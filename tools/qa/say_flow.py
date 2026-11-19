"""The microphone path end to end: getUserMedia is swapped for a stream that plays a WAV on a loop (headless Chrome
launched from the agent can't open even a fake device: macOS privacy holds getUserMedia forever), the rest is real —
START -> round 1 (answer forced with ?answer=) -> player 1 presses -> listen -> recogniser -> outcome.
uv run --with playwright==1.62.0 python tools/qa/say_flow.py <wav> <answer> [expect ok|miss] [api|device]
api (default): the phonics-api key from ~/.config/phonics-api/key goes into this browser's localStorage (never printed);
device: no key -> the on-device whisper judges."""
import sys, time, pathlib, json
from playwright.sync_api import sync_playwright
wav, ans = sys.argv[1], sys.argv[2]
expect = sys.argv[3] if len(sys.argv) > 3 else 'ok'
mode = sys.argv[4] if len(sys.argv) > 4 else 'api'
KEY = (pathlib.Path.home() / '.config/phonics-api/key').read_text().strip() if mode == 'api' else ''
with sync_playwright() as p:
    b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page()
    pg.add_init_script('''(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const ac = new AudioContext();
        const buf = await ac.decodeAudioData(await (await fetch('%s')).arrayBuffer());
        const s = ac.createBufferSource(); s.buffer = buf; s.loop = true;
        const d = ac.createMediaStreamDestination(); s.connect(d); s.start();
        return d.stream;
      };
    })()''' % ('/' + wav))
    pg.add_init_script("localStorage.%s" % (f"setItem('phonics_api_key', {json.dumps(KEY)})" if KEY else "removeItem('phonics_api_key')"))
    logs = []
    pg.on('console', lambda m: logs.append(m.text))
    pg.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
    pg.goto(f'http://127.0.0.1:5261/?fast=1&log=1&answer={ans}')
    pg.wait_for_function('window.__ready === true')
    pg.click('#btnStart', force=True)   # START breathes forever: never 'stable' for Playwright
    pg.wait_for_function("__ec.G.phase === 'race' && STT.state === 'ready'", timeout=90000)
    pg.wait_for_function("PhonicsAPI.status() !== 'unknown'", timeout=15000)
    print('mic', pg.evaluate('Mic.state'), '| api', pg.evaluate('PhonicsAPI.status()'), '| answer', pg.evaluate('__ec.G.deck.answers[0]'))
    t0 = time.time()
    pg.evaluate('() => { __ec.buzz(0); }')
    pg.wait_for_function("__ec.G.scores[0] === 1 || __ec.G.locked[0] === true", timeout=40000)
    got = 'ok' if pg.evaluate('__ec.G.scores[0]') == 1 else 'miss'
    last = pg.evaluate('STT.last')
    print(f'outcome {got} in {time.time() - t0:.1f}s (expected {expect}) | by', (last or {}).get('by', 'on-device'),
          '| heard', (last or {}).get('heard') or (last or {}).get('text'), '|', (last or {}).get('verdict', ''))
    b.close()
print('\n'.join(l for l in logs if 'heard' in l or 'ERROR' in l or 'rror' in l)[:1500])
sys.exit(0 if got == expect else 1)
