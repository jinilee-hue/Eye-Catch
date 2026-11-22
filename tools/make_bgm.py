"""Original background music for Eye Catch — a quiz-show SWING (2026-11-22).

Why a new one (user): the old loop (D major, 112 BPM, marimba over D–Bm–G–A) had the same chords as Croco and Toy Catch
bar for bar (I–vi–IV–V | IV–V–iii–vi) and the same backing, and it was the slowest. "게임마다 게임에 맞게 음악이 좀
달라야해. 그리고 기본적으로 전체 음악은 신나야해." → "Eye-Catch → 퀴즈쇼 스윙".

Fit: two players race to spot the shared picture, press and say it; the one-eyed monster runs the show like a quiz host.
So: a swung shuffle (no other phonics game swings), B♭ major, 144 BPM, 16 bars = 26.7 s. Vibraphone tune, Charleston
piano, walking bass, game-show brass hits, a glockenspiel "spotted it!" sparkle at the phrase ends, swing ride +
hi-hat on 2 and 4, cross-stick in the A half, snare + claps in the B half, triplet snare fills back into bar 1.
Chords (written in C, played a tone lower): A = I–VI7–ii–V7 | I–I7–IV–V7, B = IV–I–II7–V7 | III7–vi–II7/V7–I/V7.
Instruments, mixer and mastering: phonics-kit tools/bgm_engine.py (shared by every game; only the score lives here).
→ assets/audio/bgm.mp3 + js/bgm-data.js (base64, so file:// plays it). Bump index.html `bgm-data.js?v=` (md5[:8]).

Run: /Users/jini/.local/bin/uv run --with numpy --with scipy --with pyloudnorm python tools/make_bgm.py
(The previous loop is in git history: tools/make_bgm.py before 2026-11-22.)
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path.home() / 'Documents/Jini/2026/Phonics/phonics-kit/tools'))
import bgm_engine as E  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
T = -2                                   # written in C, played in B♭
mx = E.Mix(bpm=144, bars=16, swing=2 / 3, seed_n=144)
CHORDS = ['C', 'A7', 'Dm', 'G7', 'C', 'C7', 'F', 'G7',
          'F', 'C', 'D7', 'G7', 'E7', 'Am', ('D7', 'G7'), ('C', 'G7')]
TONES = {'C': ['C', 'E', 'G', 'A'], 'A7': ['A', 'C#', 'E', 'G'], 'Dm': ['D', 'F', 'A', 'C'], 'G7': ['G', 'B', 'D', 'F'],
         'C7': ['C', 'E', 'G', 'Bb'], 'F': ['F', 'A', 'C', 'D'], 'D7': ['D', 'F#', 'A', 'C'], 'E7': ['E', 'G#', 'B', 'D'],
         'Am': ['A', 'C', 'E', 'G']}
B1 = [('G5', 0, .5), ('E5', .5, .5), ('G5', 1, .5), ('A5', 2, .5), ('G5', 2.5, .5), ('E5', 3, 1)]
MEL = [
    B1,
    [('C#6', 0, .5), ('A5', .5, .5), ('C#6', 1, .5), ('E6', 2, .5), ('C#6', 2.5, .5), ('A5', 3, 1)],
    [('D6', 0, .5), ('A5', .5, .5), ('F5', 1, .5), ('A5', 1.5, .5), ('C6', 2, 1.5)],
    [('B5', 0, .5), ('A5', .5, .5), ('G5', 1, .5), ('F5', 1.5, .5), ('D5', 2, 1)],
    B1,
    [('Bb5', 0, .5), ('G5', .5, .5), ('Bb5', 1, .5), ('C6', 2, .5), ('Bb5', 2.5, .5), ('G5', 3, 1)],
    [('A5', 0, .5), ('C6', .5, .5), ('F6', 1, 1), ('E6', 2, .5), ('D6', 2.5, .5), ('C6', 3, .5), ('A5', 3.5, .5)],
    [('B5', 0, .5), ('D6', .5, .5), ('F6', 1, .5), ('D6', 1.5, .5), ('B5', 2, .5), ('G5', 2.5, .5)],
    [('C6', 0, .5), ('C6', .5, .5), ('A5', 1, .5), ('C6', 1.5, .5), ('F6', 2, 1), ('E6', 3, .5), ('D6', 3.5, .5)],
    [('E6', 0, .5), ('E6', .5, .5), ('C6', 1, .5), ('E6', 1.5, .5), ('G6', 2, 1), ('F6', 3, .5), ('E6', 3.5, .5)],
    [('F#6', 0, .5), ('E6', .5, .5), ('D6', 1, .5), ('C6', 1.5, .5), ('A5', 2, .5), ('F#5', 2.5, .5), ('A5', 3, 1)],
    [('G5', 0, .5), ('B5', .5, .5), ('D6', 1, .5), ('F6', 1.5, .5), ('G6', 2, 1)],
    [('G#5', 0, .5), ('B5', .5, .5), ('E6', 1, .5), ('D6', 1.5, .5), ('B5', 2, .5), ('G#5', 2.5, .5), ('E5', 3, 1)],
    [('A5', 0, .5), ('C6', .5, .5), ('E6', 1, .5), ('G6', 1.5, .5), ('A6', 2, 1), ('G6', 3, .5), ('E6', 3.5, .5)],
    [('F#6', 0, .5), ('D6', .5, .5), ('A5', 1, .5), ('C6', 1.5, .5), ('B5', 2, .5), ('D6', 2.5, .5), ('F6', 3, .5), ('D6', 3.5, .5)],
    [('C6', 0, .5), ('G5', .5, .5), ('E5', 1, 1)],
]
SPARKLE = {3: 2.75, 11: 3.0}            # bar → beat: a triplet glock run up the chord ("spotted it!")
assert len(MEL) == len(CHORDS) == mx.bars


def bass_root(c):
    r = E.midi(TONES[c][0] + '2', T)
    return r - 12 if r > E.midi('E2') else r


for bar in range(mx.bars):
    B = bar >= 8
    fill = bar in (7, 15)
    for note, b, ln in MEL[bar]:                                     # vibraphone tune (+ octave-up glock dust in B)
        f = E.hz(note, T)
        add_t = mx.at(bar, b)
        mx.add(E.vibes(f, mx.dur(b, ln)), add_t, pan=.12, gain=.30, send=.35)
        if B:
            mx.add(E.glock(2 * f), add_t + .004, pan=-.3, gain=.035, send=.3)
    if bar in SPARKLE:
        tones = TONES[E.chord_at(CHORDS, bar, 3)]
        for k in range(6):
            n = E.midi(tones[k % 3] + '6', T) + 12 * (k // 3)
            mx.add(E.glock(E.hz(n)), (bar * 4 + SPARKLE[bar] + k / 6) * mx.beat, pan=.4, gain=.09, send=.4)
    # walking bass: root, 3rd, 5th, then a half step into the next chord (two roots in a split bar)
    split = isinstance(CHORDS[bar], tuple)
    r0, r2 = bass_root(E.chord_at(CHORDS, bar, 0)), bass_root(E.chord_at(CHORDS, bar, 2))
    nxt = bass_root(E.chord_at(CHORDS, bar + 1, 0))
    third = 3 if 'm' in E.chord_at(CHORDS, bar, 0) and not E.chord_at(CHORDS, bar, 0).endswith('7') else 4
    line = [r0, r0 + 7, r2, r2 + 7] if split else [r0, r0 + third, r0 + 7, nxt + (1 if bar % 2 else -1)]
    for b, n in enumerate(line):
        mx.add(E.upright(E.hz(n), mx.beat * .85), mx.at(bar, b), gain=.42)
    # piano: Charleston (1 + the swung and-of-2), B half adds short stabs on 2 and 4
    hits = [(0, .35), (1.5, .3)] + ([(1, .12), (3, .12)] if B else [(3.5, .2)] if bar % 4 == 1 else [])
    for b, ln in hits:
        for i, n in enumerate(TONES[E.chord_at(CHORDS, bar, b)]):
            mx.add(E.piano(E.hz(n + '4', T), ln * mx.beat), mx.at(bar, b) + i * .004, gain=.065, send=.2)
    # game-show brass: hits on bars 9, 11, 13; pushes into bars 9 and 1; "ba-dap" answers in bars 4 and 12
    if bar in (8, 10, 12):
        for n in TONES[E.chord_at(CHORDS, bar, 0)][:3]:
            mx.add(E.brass(E.hz(n + '4', T), .45 * mx.beat), mx.at(bar, 0), gain=.08, send=.25)
    if fill:
        for n in TONES[E.chord_at(CHORDS, bar + 1, 0)][:3]:
            mx.add(E.brass(E.hz(n + '4', T), .4 * mx.beat), mx.at(bar, 3.5), gain=.08, send=.25)
    if bar == 15:
        for b in (2.5, 3):
            for n in TONES['G7'][:3]:
                mx.add(E.brass(E.hz(n + '4', T), .25 * mx.beat), mx.at(bar, b), gain=.06, send=.2)
    # drums
    for b in (0, 1, 1.5, 2, 3, 3.5):
        if not (fill and b >= 3):
            mx.add(E.ride(1 if b in (1, 3) else .7), mx.at(bar, b), pan=.3, gain=.15)
    for b in (1, 3):
        mx.add(E.hat(), mx.at(bar, b), pan=.3, gain=.12)
    for b in ((0, 1, 2, 3) if B else (0, 2, 2.5) if bar % 2 else (0, 2)):
        mx.add(E.kick(), mx.at(bar, b), gain=.55)
    for b in (1, 3):
        if fill and b == 3:
            continue
        if B:
            mx.add(E.snare(), mx.at(bar, b), gain=.18)
            mx.add(E.clap(), mx.at(bar, b) + .003, pan=.05, gain=.12, send=.15)
        else:
            mx.add(E.rim(), mx.at(bar, b), pan=-.15, gain=.22, send=.1)
    if fill:
        for k in range(6):
            mx.add(E.snare(.5 + .1 * k), (bar * 4 + 3 + k / 6) * mx.beat, gain=.16)
    if bar in (0, 8):
        mx.add(E.crash(), mx.at(bar, 0), pan=-.2, gain=.09, send=.1)

st = mx.render(lufs=-14.8)
E.write(st, mx, ROOT / 'assets' / 'audio' / 'bgm.mp3', ROOT / 'js' / 'bgm-data.js', 'EC_BGM_DATA',
        'generated by tools/make_bgm.py — do not edit: the background music loop (mp3, base64)')
