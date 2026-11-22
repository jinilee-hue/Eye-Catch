"""Voice clips for Eye Catch -> assets/voice/*.mp3 + js/voice.js + js/voice-data.js (base64, so file:// plays too)

- WORDS (FPR K Unit 1 Lesson 1, js/words.js) and the LETTER SOUND /m/: the lesson pack's own audio
  (Phonics/공통자료/FP.K.U1L1-lesson-pack via phonics-kit/tools/lessonpack.py — the content team's files; the pack has
  mirror/mitt/mushroom as WAV takes, the rest as official MP3s).
- TUTOR LINES (EN + KO): company TTS (Qwen3 'aiden', cheerful 7-year-old boy — the voice the user picked for the
  phonics games). Company network / VPN only; TTS_BASE_URL + LLM_API_KEY come from ~/.zshrc and are never printed.
  Raw takes are cached in ~/.cache/eye-catch/voice_qwen (md5 of voice + instruction + text + lang).

Every clip is trimmed and levelled; {key: [file, start s, gain, dur s]} is applied at playback.
Run: /Users/jini/.local/bin/uv run --with numpy python tools/build_voice.py   (old voice: zsh -ic '… --engine qwen')
"""
import base64, hashlib, json, os, pathlib, subprocess, sys, tempfile, time, urllib.request
import numpy as np
sys.path.insert(0, str(pathlib.Path.home() / 'Documents/Jini/2026/Phonics/phonics-kit/tools'))
import lessonpack  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
PH = pathlib.Path.home() / 'Documents/Jini/2026/Phonics'
OUT = ROOT / 'assets' / 'voice'
CACHE = pathlib.Path.home() / '.cache' / 'eye-catch' / 'voice_qwen'
TB = 'FP.K.U1L1'
SR = 24000
QWEN_URL, QWEN_KEY = os.environ.get('TTS_BASE_URL', '').rstrip('/'), os.environ.get('LLM_API_KEY', '')
VOICE = 'aiden'
# 2026-11-20 (user: "Ava Multilingual · aiden 높이·빠르기 이걸로 통일"): default engine phonics-api — the tutor lines in the one
# tutor voice of the phonics games (phonics-kit tts_voice.tutor + tutor_takes: read back, retaken). `--engine qwen` = old voice.
ENGINE = sys.argv[sys.argv.index('--engine') + 1] if '--engine' in sys.argv else 'phonics-api'
T_INS = ['Speak like a cheerful, energetic 7-year-old boy: bright and excited.',
         'Speak like a cheerful, energetic 7-year-old boy, bright and excited, clearly.',
         'Like a cheerful, energetic 7-year-old boy: bright, excited and clear.']
TAKE_OF = {'k:chance2': 1}   # key -> instruction variant (a re-take needs a different instruction: the server is deterministic)
#   k:chance2 take 0 was read back as '…차례요!'
TEXT_OF = {'k:hello': '안녕! 아이 캐치 놀이 하자!'}   # spaced: '아이캐치' as one word was misread

WJ = json.loads((ROOT / 'js/words.js').read_text(encoding='utf-8').split('=', 1)[1].rstrip().rstrip(';'))
WORDS = [w['w'] for w in WJ['words']]

LINES = {
    'hello': "Hi, friends! Let's play Eye Catch!",
    'rule1': 'Look at the two cards. One picture is on both!',
    'rule2': 'Found it? Press your button and say it!',
    'rule3': 'Say it first, and the card is yours!',
    'ready': 'Ready? Go!',
    'sayit': 'Say it!',
    'again': 'One more time!',
    'oops': 'Oops! Not that one.',
    'chance1': 'Player one, your turn!',
    'chance2': 'Player two, your turn!',
    'great1': 'Great job!',
    'great2': 'You got it!',
    'great3': 'Wow, so fast!',
    'answer': 'The answer is...',
    'hint': 'Look carefully!',
    'tap': 'Tap the picture!',
    'last': 'Last card!',
    'win1': 'Player one wins!',
    'win2': 'Player two wins!',
    'draw': "It's a tie! Great game!",
    'playagain': 'Play again?',
    'micask': 'Please allow the microphone.',
    'pressstart': 'Press start!',
    # the say turn (phonics-kit README "공통 규칙" 2-3, the same lines as Phonics Match): the JUMP button's guide, two unclear tries
    'jump': 'Want to skip? Tap the jump button!',
    'goodtry': 'Good try!',
}
LINES_KO = {
    'hello': '안녕! 아이캐치 놀이 하자!',
    'rule1': '두 카드를 잘 봐. 똑같은 그림이 딱 하나 있어!',
    'rule2': '찾았으면 버튼을 누르고 크게 말해 봐!',
    'rule3': '먼저 맞히는 친구가 카드를 가져가!',
    'ready': '준비, 시작!',
    'sayit': '말해 봐!',
    'again': '한 번 더 말해 봐!',
    'oops': '앗, 그게 아니야.',
    'chance1': '1번 친구 차례야!',
    'chance2': '2번 친구 차례야!',
    'great1': '잘했어!',
    'great2': '맞았어!',
    'great3': '와, 정말 빠르다!',
    'answer': '정답은...',
    'hint': '잘 찾아봐!',
    'tap': '그림을 눌러 봐!',
    'last': '마지막 카드야!',
    'win1': '1번 친구가 이겼어!',
    'win2': '2번 친구가 이겼어!',
    'draw': '비겼어! 둘 다 잘했어!',
    'playagain': '한 번 더 할까?',
    'micask': '마이크를 허용해 줘.',
    'pressstart': '시작 버튼을 눌러 봐!',
    'jump': '넘어가고 싶으면 점프 버튼을 눌러!',
    'goodtry': '좋아, 잘했어!',
}
assert set(LINES) == set(LINES_KO), set(LINES) ^ set(LINES_KO)

FR = int(SR * .01)
LEAD, TAIL = .10, .25


def decode(p):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(p), '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def speech(x, floor_db):
    n = len(x) // FR
    rms = np.sqrt((x[:n * FR].reshape(n, FR) ** 2).mean(1) + 1e-12)
    return rms, np.nonzero(rms > rms.max() * 10 ** (floor_db / 20))[0]


def trim(raw, dst, target_db=-17, floor_db=-50):
    """cut after the last speech + 0.25 s; return (start, gain, dur) for playback"""
    _, act = speech(decode(raw), floor_db)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(raw), '-t', f'{(act[-1] + 1) * FR / SR + TAIL:.3f}',
                    '-ac', '1', '-ar', str(SR), '-c:a', 'libmp3lame', '-b:a', '64k', '-map_metadata', '-1', str(dst)], check=True)
    y = decode(dst)
    rms, act = speech(y, floor_db)
    voiced = rms[act[0]:act[-1] + 1]
    loud = np.sqrt((voiced[voiced > voiced.max() * .1] ** 2).mean())
    g = min(10 ** (target_db / 20) / loud, 10 ** (-1 / 20) / np.abs(y).max())
    start = max(0., act[0] * FR / SR - LEAD)
    return [round(start, 3), round(float(g), 3), round(len(y) / SR - start, 3)]


SERVER = {'down': False, 'fetched': 0}


def qwen(text, ins, dst, lang):
    if SERVER['down'] or not (QWEN_URL and QWEN_KEY):
        return False
    body = json.dumps({'model': 'qwen-tts', 'input': text, 'voice': VOICE, 'language': lang,
                       'response_format': 'wav', 'instructions': ins}).encode()
    for attempt in range(5):
        try:
            req = urllib.request.Request(QWEN_URL + '/audio/speech', data=body, method='POST',
                                         headers={'Authorization': 'Bearer ' + QWEN_KEY, 'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=30) as r:
                wav = r.read()
            with tempfile.NamedTemporaryFile(suffix='.wav') as f:
                f.write(wav); f.flush()
                subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', f.name, '-ac', '1', '-ar', str(SR), '-c:a', 'libmp3lame',
                                '-b:a', '96k', str(dst)], check=True)
            SERVER['fetched'] += 1
            return True
        except Exception as e:  # 429/5xx = GPU busy: wait; anything else = not on the company network
            busy = getattr(e, 'code', None) in (429, 502, 503, 504)
            if attempt == 4 or not busy:
                print(f'  TTS failed: {type(e).__name__} {getattr(e, "code", "")}')
                if not busy:
                    SERVER['down'] = True
                return False
            time.sleep(4 + 3 * attempt)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob('*.mp3'):
        f.unlink()
    clips, lines, lines_ko, source = {}, {}, {}, {}
    pk = lessonpack.load(lessonpack.pack_dir(TB))
    for w in WORDS:
        e = pk['words'][w]
        dst = OUT / f'w_{w}.mp3'
        clips[f'w:{w}'] = [dst.name, *trim(e['audio'], dst, target_db=-18, floor_db=-40)]
        source[w] = f"{TB} pack ({pathlib.Path(e['audio']).suffix[1:]})"
    snd = pk['sound']
    clips['s:' + snd['text']] = [f"s_{snd['text']}.mp3", *trim(snd['audio'], OUT / f"s_{snd['text']}.mp3", target_db=-18, floor_db=-40)]
    missing = []
    if ENGINE == 'phonics-api':
        import tts_voice  # noqa: E402
        import tutor_takes  # noqa: E402
        got, never = tutor_takes.best([(f't:{k}', TEXT_OF.get(f't:{k}', t), 'en') for k, t in LINES.items()]
                                      + [(f'k:{k}', TEXT_OF.get(f'k:{k}', t), 'ko') for k, t in LINES_KO.items()])
        if never:
            print('never heard right (kept take 1 — check by ear):', never)
        for pre, table, out in (('t', LINES, lines), ('k', LINES_KO, lines_ko)):
            for k, text in table.items():
                dst = OUT / f'{pre}_{k}.mp3'
                clips[f'{pre}:{k}'] = [dst.name, *trim(got[f'{pre}:{k}'], dst)]
                out[k] = text
    for pre, table, lang, out in ((('t', LINES, 'en', lines), ('k', LINES_KO, 'ko', lines_ko)) if ENGINE != 'phonics-api' else ()):
        for k, text in table.items():
            key = f'{pre}:{k}'
            ins = T_INS[TAKE_OF.get(key, 0) % len(T_INS)]
            said = TEXT_OF.get(key, text)
            raw = CACHE / f'{pre}_{k}_{hashlib.md5((VOICE + ins + said + lang).encode()).hexdigest()[:8]}.mp3'
            if not raw.exists() and not qwen(said, ins, raw, lang):
                missing.append(key)
                continue
            dst = OUT / f'{pre}_{k}.mp3'
            clips[key] = [dst.name, *trim(raw, dst)]
            out[k] = text
    (ROOT / 'js/voice.js').write_text('/* generated by tools/build_voice.py — do not edit */\nwindow.EC_VOICE = '
                                      + json.dumps({'voice': tts_voice.TUTOR_VOICE if ENGINE == 'phonics-api' else VOICE,
                                                    'engine': 'phonics-api' if ENGINE == 'phonics-api' else 'company-tts', 'clips': clips, 'lines': lines, 'lines_ko': lines_ko,
                                                    'wordSource': source}, ensure_ascii=False, indent=0) + ';\n', encoding='utf-8')
    data = {k: base64.b64encode((OUT / v[0]).read_bytes()).decode() for k, v in clips.items()}
    (ROOT / 'js/voice-data.js').write_text('/* generated by tools/build_voice.py — do not edit */\nwindow.EC_VOICE_DATA = '
                                           + json.dumps(data) + ';\n', encoding='utf-8')
    size = sum((OUT / v[0]).stat().st_size for v in clips.values())
    print(f'{len(clips)} clips, {size / 1024:.0f} KB; TTS requests this run: {SERVER["fetched"]}')
    print('word sources:', source)
    if missing:
        print('NOT generated (company TTS unreachable):', missing)


if __name__ == '__main__':
    main()
