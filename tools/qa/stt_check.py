"""Run dev/stt.html headless and print the recognition matrix (said x expected).
uv run --with playwright==1.62.0 python tools/qa/stt_check.py [base]"""
import sys, json
from playwright.sync_api import sync_playwright
base = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:5261/'
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') else None)
    pg.goto(base + 'dev/stt.html')
    pg.wait_for_function('window.__res', timeout=600000)
    r = pg.evaluate('window.__res')
    b.close()
print('ready', r['ready'])
words = [row['said'] for row in r['rows']]
bad = 0
print('said'.ljust(9), ' '.join(w[:4].ljust(4) for w in words), '| heard')
for row in r['rows']:
    cells = []
    for t in words:
        v = row['v'][t]
        good = (v == 'ok') == (t == row['said'])
        bad += not good
        cells.append(({'ok': 'OK', 'wrong': 'w', 'unclear': '?'}.get(v, str(v))[:4] + ('' if good else '!')).ljust(4))
    print(row['said'].ljust(9), ' '.join(cells), '|', row.get('heard'))
for n in r['neg']:
    print('not a word:', n['key'], 'passed for', n['pass'], '| heard', n['heard'])
print('mismatches:', bad)
print('\n'.join(errs[:10]))
