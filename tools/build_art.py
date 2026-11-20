"""Game art -> assets/img/*.webp + js/art.js
- the user's own files (copied from ~/Downloads by exact name into design/): eyecatch_bg.png (room + table),
  eyecatch_logo.png (EYE CATCH logo)
- cut from the mockups (tools/cut_sprites.py -> design/work/cut): START button, "match!" tag, the two player faces,
  the card tin (tools/cut_tin.py)
uv run --with pillow --with numpy python tools/build_art.py
"""
import json, pathlib, sys
import numpy as np
from PIL import Image, ImageFilter

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


def _srgb_to_lab(rgb):
    c = rgb / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def _lab_to_srgb(lab):
    fy = (lab[..., 0] + 16) / 116
    f = np.stack([fy + lab[..., 1] / 500, fy, fy - lab[..., 2] / 200], -1)
    xyz = np.where(f ** 3 > 216 / 24389, f ** 3, (116 * f - 16) / (24389 / 27)) * np.array([0.95047, 1.0, 1.08883])
    mi = np.array([[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.2040, 1.0570]])
    c = xyz @ mi.T
    c = np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.clip(c, 0, None) ** (1 / 2.4) - 0.055)
    return np.clip(c * 255, 0, 255)


# the red letters that turn purple (user: "로고가 붉은색이 많은데..보라색도 섞어서"): the first E and the H, seeded
# inside each letter's fill on logo-game (x, y) with that fill's own hue (CIELAB degrees). Re-check the seeds if the
# source logo changes.
PURPLE = {'seeds': [((350, 300), 35), ((985, 700), 20)], 'hue': 312}


def purple_letters(im):
    """Turn the chosen letters purple, keeping their light and shade (a CIELAB hue turn).

    A letter's fill is the red region joined to its seed; the light peach outline round it
    (hue ~65) stops the region, so the orange outline and its 3D side keep their colour.
    """
    a = np.asarray(im.convert('RGBA')).astype(np.float64)
    lab = _srgb_to_lab(a[..., :3])
    hue = (np.degrees(np.arctan2(lab[..., 2], lab[..., 1])) + 360) % 360
    hh = np.where(hue > 300, hue - 360, hue)                   # crimson and pink wrap round to just below 0
    red = (a[..., 3] > 8) & (hh < 58) & (hh > -60)
    chroma = np.hypot(lab[..., 1], lab[..., 2])
    out = lab.copy()
    for (x, y), base in PURPLE['seeds']:
        fill = _blob(red, (y, x))
        # the shaded bevel just inside the outline (hue up to ~62) belongs to the letter too: take a few px round the
        # region, fade out toward the outline's hue, and soften the weights so the edge has no speckle
        w = np.where(_grow(fill, 4), np.clip((64 - hh) / 8, 0, 1), 0)
        w = np.asarray(Image.fromarray(np.uint8(np.round(w * 255))).filter(ImageFilter.GaussianBlur(1.5))) / 255.0
        # the fill's reds span ~40 degrees; squeeze them into a narrow purple band so the deep edge stays purple
        # instead of swinging to hot magenta, and cap the chroma there
        nh = np.radians(PURPLE['hue'] + (hh - base) * 0.35)
        nc = np.minimum(chroma, 72)
        out[..., 1] += (nc * np.cos(nh) - lab[..., 1]) * w
        out[..., 2] += (nc * np.sin(nh) - lab[..., 2]) * w
    a[..., :3] = _lab_to_srgb(out)
    return Image.fromarray(np.clip(np.round(a), 0, 255).astype(np.uint8), 'RGBA')


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
# less yellow (user 2026-11-19: "배경 노란기는 70% 빼줘"): in Lab only the yellow side of b* is scaled (x0.3), so blues,
# the mint table and the pinks keep their hue; creams turn more neutral
from PIL import ImageCms  # noqa: E402
_lab, _srgb = ImageCms.createProfile('LAB'), ImageCms.createProfile('sRGB')
_x = np.asarray(ImageCms.applyTransform(bg, ImageCms.buildTransformFromOpenProfiles(_srgb, _lab, 'RGB', 'LAB'))).astype(np.float32)
_b = _x[..., 2] - 128
_x[..., 2] = np.where(_b > 0, 128 + _b * 0.3, _x[..., 2])
bg = ImageCms.applyTransform(Image.fromarray(np.clip(_x, 0, 255).astype(np.uint8), 'LAB'),
                             ImageCms.buildTransformFromOpenProfiles(_lab, _srgb, 'LAB', 'RGB'))
bg.save(IMG / 'bg.webp', quality=88, method=6)
ART['bg'] = {'w': bg.width, 'h': bg.height}
logo, _ = trim(Image.open(D / 'eyecatch_logo.png').convert('RGBA'))
logo.save(IMG / 'logo.webp', quality=92, method=6)
ART['logo'] = {'w': logo.width, 'h': logo.height}
# logo-game.webp is the approved mark (the monster on the scalloped plate). A full run
# does not rebuild it from eyecatch_logo.png; it only refreshes the data URL and the size.
glogo = Image.open(IMG / 'logo-game.webp').convert('RGBA')
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
# the "match!" tag in each card's colour (user: "카드 위에 match 텍스트가 주황색인데 카드 색에 맞게"): the orange letter
# fill and its dark shade take the card's hue, the cream outline stays
def recolour(im, hue_deg, sat_k=1.0, val_k=1.0):
    a = np.asarray(im.convert('RGBA')).astype(np.float32) / 255
    rgb = a[..., :3]
    mx, mn = rgb.max(2), rgb.min(2)
    d = mx - mn + 1e-6
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    sat = d / (mx + 1e-6)
    sel = (sat > 0.3) & ((h < 33) | (h > 345))
    # HSV -> RGB with the new hue for the selected pixels
    H = np.full_like(h, hue_deg) / 60; S = np.clip(sat * sat_k, 0, 1); V = np.clip(mx * val_k, 0, 1)
    i = np.floor(H).astype(int) % 6; f = H - np.floor(H)
    P, Q, T = V * (1 - S), V * (1 - S * f), V * (1 - S * (1 - f))
    out = np.stack([np.choose(i, [V, Q, P, P, T, V]), np.choose(i, [T, V, V, Q, P, P]), np.choose(i, [P, P, T, V, V, Q])], -1)
    rgb2 = np.where(sel[..., None], out, rgb)
    return Image.fromarray((np.dstack([rgb2, a[..., 3]]) * 255 + 0.5).astype(np.uint8), 'RGBA')
match = Image.open(IMG / 'match.webp')
recolour(match, 199, 1.0, 0.98).save(IMG / 'match-sky.webp', quality=90, method=6)
recolour(match, 336, 0.95, 1.0).save(IMG / 'match-pink.webp', quality=90, method=6)
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
