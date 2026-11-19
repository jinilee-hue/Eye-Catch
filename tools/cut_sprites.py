"""Cut sprites out of the reference images with rembg birefnet-general (alpha mattes).
uv run --with "rembg[cpu]" --with pillow --with numpy --with scipy python tools/cut_sprites.py [names...]
-> design/work/cut/<name>.png (crop + model alpha)
"""
import os, pathlib, sys, time
os.environ.setdefault('U2NET_HOME', os.path.expanduser('~/.cache/rembg/models/birefnet-general'))
from PIL import Image
from rembg import new_session, remove
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from art_boxes import JOBS  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
D = ROOT / 'design'
OUT = D / 'work' / 'cut'
OUT.mkdir(parents=True, exist_ok=True)
REF = {k: Image.open(D / f'ref_{k}.png').convert('RGB') for k in ('title', 'game')}
only = set(sys.argv[1:])
sess = new_session('birefnet-general')
for name, (ref, box) in JOBS.items():
    if only and name not in only:
        continue
    t0 = time.time()
    crop = REF[ref].crop(box)
    mask = remove(crop, session=sess, only_mask=True, post_process_mask=False)
    rgba = crop.copy(); rgba.putalpha(mask)
    rgba.save(OUT / f'{name}.png')
    print(name, crop.size, f'{time.time() - t0:.1f}s', flush=True)
