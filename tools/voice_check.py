"""Read every tutor line back with Whisper (medium) and print it next to its text.
~/.claude/skills/video-vision/.venv/bin/python tools/voice_check.py [model]"""
import json, pathlib, sys, difflib, re
import whisper
ROOT = pathlib.Path(__file__).resolve().parent.parent
V = json.loads((ROOT / 'js/voice.js').read_text(encoding='utf-8').split('=', 1)[1].rstrip().rstrip(';'))
model = whisper.load_model(sys.argv[1] if len(sys.argv) > 1 else 'medium')
norm = lambda s: re.sub(r'[^0-9a-z가-힣]', '', s.lower())
for key, c in V['clips'].items():
    if key[0] not in 'tk':
        continue
    lang = 'ko' if key[0] == 'k' else 'en'
    text = (V['lines_ko'] if lang == 'ko' else V['lines'])[key[2:]]
    r = model.transcribe(str(ROOT / 'assets/voice' / c[0]), language=lang, fp16=False)
    heard = r['text'].strip()
    ratio = difflib.SequenceMatcher(None, norm(text), norm(heard)).ratio()
    print(f"{'  ' if ratio > .8 else '!!'} {key:12s} {ratio:.2f} | {text} | {heard}", flush=True)
