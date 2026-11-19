"""The pink EYE CATCH card tin (+ its lid) from the title mockup -> assets/img/tin.webp (+ its place in js/art.js via
build_art.py). The user's background has no tin (user: "인트로에 카드 통은 없어졌는데..").
In the mockup the tutor's held card, its arm and a "match!" tag sit in front of the tin: those are painted over with
LaMa first (the game's own held card covers that spot again), then the tin is cut by its shape:
body = top ellipse + side + bottom ellipse, lid = the pink piece leaning on the right (colour, connected).
two steps (simple-lama and opencv pull different torch builds; together the LaMa model tried to load onto CUDA):
  uv run --with simple-lama-inpainting --with pillow --with numpy --with scipy python tools/cut_tin.py fill
  uv run --with opencv-python-headless --with pillow --with numpy --with scipy python tools/cut_tin.py
"""
import sys
import pathlib
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = pathlib.Path(__file__).resolve().parent.parent
D = ROOT / 'design'
BOX = (1400, 520, 2330, 1012)                  # work area (ref px)
ref = Image.open(D / 'ref_title.png').convert('RGB')
crop = ref.crop(BOX)
W, H = crop.size
ox, oy = BOX[0], BOX[1]
a = np.asarray(crop).astype(np.float32) / 255
mx, mn = a.max(2), a.min(2)
sat = (mx - mn) / (mx + 1e-6)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
hue = np.degrees(np.arctan2(np.sqrt(3) * (g - b), 2 * r - g - b)) % 360


def shape(draw_fn):
    im = Image.new('L', (W, H), 0)
    draw_fn(ImageDraw.Draw(im))
    return np.asarray(im) > 0


def ell(d, cx, cy, rx, ry):
    d.ellipse((cx - ox - rx, cy - oy - ry, cx - ox + rx, cy - oy + ry), fill=255)


# what stands in front of the tin
occ = shape(lambda d: ell(d, 1672, 760, 132, 134))                          # the held card
purple = (hue > 265) & (hue < 325) & (sat > 0.14)
purple[:, 260:] = False                                                       # only the tutor's arm / body (left)
occ |= ndi.binary_dilation(ndi.binary_opening(purple, iterations=2), iterations=24)
occ[:, :1482 - ox] = True                                                     # the tutor's body edge, far left
mt = np.asarray(Image.open(D / 'work/cut/match.png').split()[3]) > 10        # the "match!" tag
mx0, my0 = 1700 - ox, 930 - oy
tag = np.zeros((H, W), bool)
h2, w2 = min(mt.shape[0], H - my0), min(mt.shape[1], W - mx0)
tag[my0:my0 + h2, mx0:mx0 + w2] = mt[:h2, :w2]
occ |= ndi.binary_dilation(tag, iterations=10)
occ |= shape(lambda d: ell(d, 1662, 1000, 40, 40))                           # sparkle under the tin
if 'fill' in sys.argv:
    from simple_lama_inpainting import SimpleLama
    lama = SimpleLama()
    lama(crop, Image.fromarray((occ * 255).astype(np.uint8))).crop((0, 0, W, H)).save(D / 'work/cut/tin_filled.png')
    sys.exit(0)
f = np.asarray(Image.open(D / 'work/cut/tin_filled.png').convert('RGB')).astype(np.float32)

# the tin's outline: a shape model (body = top ellipse + side + bottom ellipse; lid = a tilted ellipse), refined by
# GrabCut on the painted-over picture (probable inside the model, background well outside it)
import cv2
body = shape(lambda d: (ell(d, 1730, 682, 252, 62), ell(d, 1730, 892, 252, 62),
                        d.rectangle((1730 - 252 - ox, 682 - oy, 1730 + 252 - ox, 892 - oy), fill=255)))
yy, xx = np.mgrid[:H, :W]
th = np.radians(17)
u = (xx + ox - 2070) * np.cos(th) + (yy + oy - 815) * np.sin(th)
v = -(xx + ox - 2070) * np.sin(th) + (yy + oy - 815) * np.cos(th)
lid = (u / 236) ** 2 + (v / 192) ** 2 <= 1
model = body | lid
gc = np.full((H, W), cv2.GC_BGD, np.uint8)
gc[ndi.binary_dilation(model, iterations=14)] = cv2.GC_PR_BGD
gc[model] = cv2.GC_PR_FGD
gc[ndi.binary_erosion(model, iterations=16)] = cv2.GC_FGD
img = np.ascontiguousarray(f[..., ::-1]).astype(np.uint8)
bgd = np.zeros((1, 65)); fgd = np.zeros((1, 65))
cv2.grabCut(img, gc, None, bgd, fgd, 5, cv2.GC_INIT_WITH_MASK)
m = (gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD)
m &= ndi.binary_dilation(body, iterations=6)          # GrabCut decides the BODY's edge only
lab, n = ndi.label(m)
m = lab == (np.argmax(ndi.sum(m, lab, range(1, n + 1))) + 1)
m = ndi.binary_fill_holes(ndi.binary_closing(m, iterations=3))
# the lid: its rim is pink all round and it is convex -> the hull of its pink pixels (letters inside come with it)
ff = f / 255
fmx, fmn = ff.max(2), ff.min(2)
fs = (fmx - fmn) / (fmx + 1e-6)
fh = np.degrees(np.arctan2(np.sqrt(3) * (ff[..., 1] - ff[..., 2]), 2 * ff[..., 0] - ff[..., 1] - ff[..., 2])) % 360
lp = ((fh > 315) | (fh < 14)) & (fs > 0.12) & (fs < 0.55) & (fmx > 0.55) & lid
lp = ndi.binary_opening(lp, iterations=2)
lab, n = ndi.label(lp)
lp = lab == (np.argmax(ndi.sum(lp, lab, range(1, n + 1))) + 1)
pts = np.argwhere(lp)[:, ::-1].astype(np.int32)
hull = cv2.convexHull(pts)
lidm = np.zeros((H, W), np.uint8); cv2.fillPoly(lidm, [hull.reshape(-1, 2)], 1)
m |= lidm.astype(bool)
alpha = np.clip(ndi.gaussian_filter(m.astype(np.float32), 1.2) * 1.15, 0, 1)
out = np.dstack([f, alpha * 255]).astype(np.uint8)
ys, xs = np.nonzero(alpha > 0.02)
x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
Image.fromarray(out[y0:y1, x0:x1], 'RGBA').save(D / 'work/cut/tin_final.png')
print('tin', (x1 - x0, y1 - y0), 'at', (ox + x0, oy + y0))
(D / 'work/cut/tin_pos.txt').write_text(f'{ox + x0} {oy + y0}\n')
