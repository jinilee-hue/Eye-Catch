"""Recognition check, phonics-api vs the on-device recogniser vs both, on dev/eval/<word>_{a,b,c}.wav
(a = the official clip, b = higher-pitched / slower / quieter like a child, c = room noise), each judged against the 12
words (the right word must pass; every other target must not). The key is read from ~/.config/phonics-api/key and put in
the page's localStorage — never printed.
uv run --with playwright==1.62.0 python tools/qa/api_vs_device.py"""
import json, pathlib, time
from playwright.sync_api import sync_playwright
KEY = (pathlib.Path.home() / '.config/phonics-api/key').read_text().strip()
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    pg.add_init_script(f"try {{ localStorage.setItem('phonics_api_key', {json.dumps(KEY)}); }} catch (e) {{}}")
    pg.goto('http://127.0.0.1:5261/?fake=1'); pg.wait_for_function('window.__ready === true')
    out = pg.evaluate("""async () => {
      STT.preload(); await STT.whenReady(60000); await PhonicsAPI.init();
      const VARIANTS = ['a', 'c', 'ana', 'guy', 'jenny', 'sunhi', 'injoon', 'maisie'];
      const words = EC_WORDS.words.map(w => w.w), PH = Object.fromEntries(EC_WORDS.words.map(w => [w.w, w.ph]));
      const rows = [];
      for (const w of words) for (const v of VARIANTS) {
        const buf = await (await fetch(`dev/eval/${w}_${v}.wav`)).arrayBuffer();
        const ac = new OfflineAudioContext(1, 16000, 16000); const ab = await ac.decodeAudioData(buf);
        const pcm = await Mic.prepare(ab.getChannelData(0), ab.sampleRate);
        const api = await PhonicsAPI.analyze(PhonicsAPI.encodeWav(pcm, 16000), w);
        // judge the same audio against 3 targets: the right one and two others (picked at random)
        const others = words.filter(x => x !== w).sort(() => Math.random() - .5).slice(0, 2);
        for (const t of [w, ...others]) {
          const rivals = words.filter(x => x !== t).sort(() => Math.random() - .5).slice(0, 9);
          const a = api.ok ? PhonicsAPI.judge(api.data, t, rivals, PH) : null;
          const d = await STT.judge(pcm, t, rivals);
          rows.push({ said: w, v, target: t, right: t === w, api: a ? a.verdict : 'err:' + api.reason, heard: a ? a.heard : '', conf: api.ok ? api.data.confidence : null, dev: d, ms: api.ms, dd: a ? a.d : null, rel: a ? a.rel : null, len: (PH[t] || []).length });
        }
      }
      return { status: PhonicsAPI.status(), rows };
    }""")
    b.close()
rows = out['rows']; print('api status', out['status'])
pathlib.Path('dev/eval/rows.json').write_text(json.dumps(rows))
def rate(f, right):
    sel = [r for r in rows if r['right'] == right]
    return sum(1 for r in sel if f(r)) , len(sel)
for name, f in [('api', lambda r: r['api'] == 'ok'), ('device', lambda r: r['dev'] == 'ok'), ('either', lambda r: r['api'] == 'ok' or r['dev'] == 'ok')]:
    ok, n = rate(f, True); fa, m = rate(f, False)
    print(f'{name:7s} right word passes {ok}/{n}   other word passes (false) {fa}/{m}')
for v in ['a', 'c', 'ana', 'guy', 'jenny', 'sunhi', 'injoon', 'maisie']:
    sel = [r for r in rows if r['right'] and r['v'] == v]
    print(v, 'api', sum(r['api'] == 'ok' for r in sel), 'device', sum(r['dev'] == 'ok' for r in sel), 'of', len(sel))
print('api misses:', [(r['said'], r['v'], r['api'], r['heard']) for r in rows if r['right'] and r['api'] != 'ok'])
print('device misses:', [(r['said'], r['v'], r['dev']) for r in rows if r['right'] and r['dev'] != 'ok'])
print('false passes:', [(r['said'], r['v'], r['target'], r['api'], r['dev']) for r in rows if not r['right'] and (r['api'] == 'ok' or r['dev'] == 'ok')])
print('api ms', sorted(r['ms'] or 0 for r in rows)[len(rows)//2])
