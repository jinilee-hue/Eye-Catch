"""Game art -> assets/img/*.webp + js/art.js
- the user's own files (copied from ~/Downloads by exact name into design/): eyecatch_bg.png (room + table),
  eyecatch_logo.png (EYE CATCH logo)
- cut from the mockups (tools/cut_sprites.py -> design/work/cut): START button, "match!" tag, the two player faces,
  the card tin (tools/cut_tin.py)
uv run --with pillow --with numpy python tools/build_art.py
"""
import json, pathlib, sys
import numpy as np
from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from art_boxes import JOBS  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
D = ROOT / 'design'
CUT = D / 'work/cut'
IMG = ROOT / 'assets/img'
IMG.mkdir(parents=True, exist_ok=True)
ART = {}


def trim(im):
    a = np.asarray(im.split()[3]) > 3
    ys, xs = np.nonzero(a)
    box = (max(0, xs.min() - 2), max(0, ys.min() - 2), min(im.width, xs.max() + 3), min(im.height, ys.max() + 3))
    return im.crop(box), box


def _blob(mask, seed):
    """8-connected component. mask is a bool array; seed is (y, x) already inside it."""
    h, w = mask.shape
    seen = np.zeros((h, w), bool)
    stack = [seed]
    seen[seed] = True
    while stack:
        y, x = stack.pop()
        for ny in (y - 1, y, y + 1):
            if ny < 0 or ny >= h:
                continue
            row, got = mask[ny], seen[ny]
            for nx in (x - 1, x, x + 1):
                if 0 <= nx < w and row[nx] and not got[nx]:
                    got[nx] = True
                    stack.append((ny, nx))
    return seen


def game_logo(im, letter_sat=1.75):
    """The game-screen logo: EYE over CATCH, cut from the wide wordmark.

    Letter fills get a luminance-preserving saturation lift (the title logo is shown at
    CSS saturate 1.3; this is a step above that). The cream outline is low-chroma, so it
    barely moves and stays cream.
    """
    a = np.asarray(im.convert('RGBA'))
    alpha = a[:, :, 3]
    h, w = alpha.shape
    solid = alpha > 16
    # the sparkle that sits in the gap between the two words
    x_band = int(w * 0.34)
    band = np.argwhere(solid[:80, x_band:int(w * 0.46)])
    i = int(band[:, 0].argmin())
    star = _blob(solid, (int(band[i, 0]), int(band[i, 1] + x_band)))
    star_zone = _grow(star, 3)
    body = solid.copy()
    body[:70] = False
    body[star] = False
    cols = body.sum(0)
    run, best = None, None
    for x in range(int(w * 0.28), int(w * 0.55)):
        if cols[x] == 0:
            if run is None:
                run = x
        elif run is not None:
            if best is None or x - run > best[1] - best[0]:
                best = (run, x)
            run = None
    if run is not None and (best is None or int(w * 0.55) - run > best[1] - best[0]):
        best = (run, int(w * 0.55))
    cut = (best[0] + best[1]) // 2

    def piece(sel):
        ys, xs = np.nonzero(sel)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        out = np.zeros((y1 - y0, x1 - x0, 4), np.float32)
        block, keep = a[y0:y1, x0:x1], sel[y0:y1, x0:x1]
        out[keep] = block[keep]
        return out

    # keep the soft fringe with whichever word it touches; the gap sparkle stays its own piece
    xs = np.arange(w)[None, :]
    fringe = (alpha > 4) & ~solid & ~star_zone
    eye = piece(((xs < cut) & solid & ~star) | ((xs < cut) & fringe))
    catch = piece(((xs >= cut) & solid & ~star) | ((xs >= cut) & fringe))
    spark = piece(star | ((alpha > 4) & star_zone & (np.arange(h)[:, None] < 96)))
    # the source wordmark tilts EYE one way and CATCH the other; level each line
    eye, catch = level(eye), level(catch)

    def paste(dst, src, x, y):
        sh, sw = src.shape[:2]
        x, y = int(round(x)), int(round(y))
        x0, y0 = max(0, x), max(0, y)
        x1, y1 = min(dst.shape[1], x + sw), min(dst.shape[0], y + sh)
        s = src[y0 - y:y1 - y, x0 - x:x1 - x]
        d = dst[y0:y1, x0:x1]
        sa, da = s[:, :, 3:4] / 255, d[:, :, 3:4] / 255
        oa = sa + da * (1 - sa)
        d[:, :, :3] = np.where(oa > 1e-4, (s[:, :, :3] * sa + d[:, :, :3] * da * (1 - sa)) / np.maximum(oa, 1e-4), 0)
        d[:, :, 3:] = oa * 255

    eh, ew = eye.shape[:2]
    ch, cw = catch.shape[:2]
    sh, sw = spark.shape[:2]
    width = cw + 24
    eye_x, cat_x = (width - ew) / 2, (width - cw) / 2
    eye_y = sh * 0.42
    # two level lines, centred. The boxes overlap a little so the rounded outlines
    # sit close; the letter fills themselves stay clear of each other.
    cat_y = eye_y + eh - 28
    canvas = np.zeros((int(cat_y + ch + 8), width, 4), np.float32)
    paste(canvas, catch, cat_x, cat_y)
    paste(canvas, eye, eye_x, eye_y)
    paste(canvas, spark, eye_x + ew * 0.72, 2)
    rgb = canvas[:, :, :3] / 255
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    mx, mn = rgb.max(2), rgb.min(2)
    sat = np.where(mx > 1e-4, (mx - mn) / np.maximum(mx, 1e-4), 0)
    k = np.clip((sat - 0.22) / 0.28, 0, 1)
    k = k * k * (3 - 2 * k)          # cream outline (low sat) stays; the letter fills climb
    amount = 1.12 + (letter_sat - 1.12) * k
    out = np.clip(lum[..., None] + amount[..., None] * (rgb - lum[..., None]), 0, 1)
    canvas[:, :, :3] = out * 255
    im = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8))
    im, _ = trim(im)
    return im


def level(arr):
    """Rotate a cut word so its letters sit on a horizontal line."""
    al = arr[:, :, 3] > 40
    h, w = al.shape
    xs, mid = [], []
    for x in range(0, w, 3):
        ys = np.nonzero(al[:, x])[0]
        if len(ys) < 40 or ys.max() - ys.min() < h * 0.35:
            continue
        xs.append(x)
        mid.append((ys.min() + ys.max()) / 2)
    if len(xs) < 8:
        return arr
    slope = np.polyfit(np.array(xs, float), np.array(mid, float), 1)[0]
    deg = float(np.degrees(np.arctan(slope)))  # PIL rotate is counter-clockwise; this flattens the line
    im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    im = im.rotate(deg, resample=Image.BICUBIC, expand=True)
    im, _ = trim(im)
    return np.asarray(im).astype(np.float32)


def _grow(mask, r):
    h, w = mask.shape
    out = mask.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy > r * r:
                continue
            y0, y1 = max(0, dy), h + min(0, dy)
            x0, x1 = max(0, dx), w + min(0, dx)
            out[y0:y1, x0:x1] |= mask[y0 - dy:y1 - dy, x0 - dx:x1 - dx]
    return out


bg = Image.open(D / 'eyecatch_bg.png').convert('RGB')
bg.save(IMG / 'bg.webp', quality=88, method=6)
ART['bg'] = {'w': bg.width, 'h': bg.height}
logo, _ = trim(Image.open(D / 'eyecatch_logo.png').convert('RGBA'))
logo.save(IMG / 'logo.webp', quality=92, method=6)
ART['logo'] = {'w': logo.width, 'h': logo.height}
# the title, the game screen, the card backs and the tin lid all wear this stacked logo
glogo = game_logo(Image.open(D / 'eyecatch_logo.png'))
glogo.save(IMG / 'logo-game.webp', quality=92, method=6)
ART['logoGame'] = {'w': glogo.width, 'h': glogo.height}
# a small copy as a data URL: the 3D tin lid and the card backs (file:// can't use image FILES as WebGL textures)
import base64, io
sm = glogo.copy(); sm.thumbnail((900, 900), Image.LANCZOS)
buf = io.BytesIO(); sm.save(buf, 'WEBP', quality=86, method=6)
(ROOT / 'js/logo-data.js').write_text('/* generated by tools/build_art.py — do not edit */\nwindow.EC_LOGO_DATA = '
                                      + json.dumps('data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()) + ';\n')
for name, (ref, box) in JOBS.items():
    im, b = trim(Image.open(CUT / f'{name}.png').convert('RGBA'))
    im.save(IMG / f'{name}.webp', quality=90, method=6)
    ART[name] = {'w': im.width, 'h': im.height, 'ref': [box[0] + b[0], box[1] + b[1]]}
# the card tin, cut from the title mockup by tools/cut_tin.py (the user's background has none)
tin = Image.open(CUT / 'tin_final.png').convert('RGBA')
tin.save(IMG / 'tin.webp', quality=90, method=6)
tx, ty = map(int, (CUT / 'tin_pos.txt').read_text().split())
ART['tin'] = {'w': tin.width, 'h': tin.height, 'ref': [tx, ty]}
# stamp the page's image links with a content hash: a swapped logo must never come from the browser's cache
import hashlib, re
html = ROOT / 'index.html'
h = html.read_text(encoding='utf-8')
for f in ('logo', 'logo-game', 'start', 'avatar1', 'avatar2', 'match'):
    v = hashlib.md5((IMG / f'{f}.webp').read_bytes()).hexdigest()[:8]
    h = re.sub(rf'assets/img/{f}\.webp(\?v=[0-9a-f]+)?', f'assets/img/{f}.webp?v={v}', h)
html.write_text(h, encoding='utf-8')
(ROOT / 'js/art.js').write_text('/* generated by tools/build_art.py — do not edit */\nwindow.EC_ART = '
                                + json.dumps(ART, default=int) + ';\n')
print(ART)
