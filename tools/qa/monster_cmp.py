"""Render the 3D tutor (dev/monster.html) next to the mockup's monster crop.
uv run --with playwright==1.62.0 --with pillow python tools/qa/monster_cmp.py <out.png> [query...]
"""
import sys, pathlib
from playwright.sync_api import sync_playwright
from PIL import Image
ROOT = pathlib.Path(__file__).resolve().parents[2]
out = sys.argv[1]
qs = sys.argv[2:] or ['pose=hold']
shots = []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1200, 'height': 896}, device_scale_factor=2)
    for q in qs:
        pg.goto(f'http://127.0.0.1:5261/dev/monster.html?{q}')
        pg.wait_for_function('window.__done === true', timeout=20000)
        f = f'/tmp/_m_{len(shots)}.png'
        pg.screenshot(path=f, omit_background=True)
        shots.append(f)
    b.close()
ref = Image.open(ROOT / 'design/ref_title.png').convert('RGB')
box = (560, 440, 1820, 1260)
tiles = [ref.crop(box)]
bg = ref.copy()
for f in shots:
    im = Image.open(f).convert('RGBA').resize((2400, 1792))
    base = Image.open(ROOT / 'design/eyecatch_bg.png').convert('RGBA')
    base.alpha_composite(im)
    tiles.append(base.convert('RGB').crop(box))
w, h = tiles[0].size
sheet = Image.new('RGB', (w * len(tiles), h), 'white')
for i, t in enumerate(tiles):
    sheet.paste(t, (i * w, 0))
sheet.thumbnail((2400, 900))
sheet.save(out)
print(out, sheet.size)
