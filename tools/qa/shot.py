"""Screenshots of the title and a game round (headless Chrome).
uv run --with playwright python tools/qa/shot.py <out_prefix> [url] [W H]
"""
import sys, time
from playwright.sync_api import sync_playwright
out = sys.argv[1]
url = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:5261/'
W, H = (int(sys.argv[3]), int(sys.argv[4])) if len(sys.argv) > 4 else (1600, 1195)
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1)
    logs = []
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    pg.on('response', lambda r: logs.append(f'HTTP {r.status} {r.url}') if r.status >= 400 else None)
    sep = '&' if '?' in url else '?'
    pg.goto(url + sep + 'fast=1&fake=1')
    pg.wait_for_function('window.__ready === true', timeout=20000)
    time.sleep(2.6)
    pg.screenshot(path=f'{out}_title.png')
    pg.evaluate('() => { __ec.startGame(); }')
    time.sleep(4.5)
    pg.screenshot(path=f'{out}_game.png')
    pg.evaluate('() => { __ec.buzz(0); }')
    time.sleep(2.2)
    pg.screenshot(path=f'{out}_win.png')
    b.close()
    print('\n'.join(logs[-30:]))
