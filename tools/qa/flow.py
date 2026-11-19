"""Whole game with scripted verdicts (?fake=1): 10 rounds, both players, a miss + chance, a nobody round, result.
Stills -> <out>_NN.png; prints console errors / HTTP >= 400.
uv run --with playwright==1.62.0 python tools/qa/flow.py <out_prefix> [W H]"""
import sys, time
from playwright.sync_api import sync_playwright
out = sys.argv[1]
W, H = (int(sys.argv[2]), int(sys.argv[3])) if len(sys.argv) > 3 else (1600, 1195)
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': W, 'height': H})
    errs = []
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('response', lambda r: errs.append(f'HTTP {r.status} {r.url}') if r.status >= 400 else None)
    pg.goto('http://127.0.0.1:5261/?fake=1')
    pg.wait_for_function('window.__ready === true')
    n = [0]
    def shot(tag):
        n[0] += 1; pg.screenshot(path=f'{out}_{n[0]:02d}_{tag}.png')
    time.sleep(1.5); shot('title')
    pg.mouse.click(300, 300)          # first touch: hello
    time.sleep(1.0)
    pg.click('#btnStart', force=True)
    pg.wait_for_function("__ec.G.phase === 'race'", timeout=90000)   # after the rule demo
    shot('round1')
    plan = ['p0', 'p1', 'miss0', 'p0', 'p1', 'nobody', 'p0', 'p0', 'p1', 'p0']
    for r, step in enumerate(plan):
        pg.wait_for_function(f"__ec.G.phase === 'race' && __ec.G.r === {r}", timeout=60000)
        if step == 'p0' or step == 'p1':
            pg.evaluate(f"() => {{ __ec.fake.push('ok'); __ec.buzz({step[1]}); }}")
        elif step == 'miss0':
            pg.evaluate("() => { __ec.fake.push('wrong'); __ec.buzz(0); }")
            pg.wait_for_function("__ec.G.locked[0] && __ec.G.phase === 'race'", timeout=30000)
            time.sleep(1.2); shot('chance')
            pg.evaluate("() => { __ec.fake.push('ok'); __ec.buzz(1); }")
        elif step == 'nobody':
            pg.evaluate("() => { __ec.fake.push('wrong', 'wrong'); __ec.buzz(0); }")
            pg.wait_for_function("__ec.G.locked[0] && __ec.G.phase === 'race'", timeout=30000)
            pg.evaluate("() => { __ec.buzz(1); }")
        if r == 0:
            time.sleep(2.0); shot('match')
    pg.wait_for_function("__ec.G.phase === 'result'", timeout=60000)
    time.sleep(2.0); shot('result')
    print('scores', pg.evaluate('__ec.G.scores'), '| title', pg.inner_text('#resTitle'))
    pg.click('#btnAgain')
    time.sleep(3.5); shot('again')
    print('again: phase', pg.evaluate('__ec.G.phase'), 'scores', pg.evaluate('__ec.G.scores'))
    pg.click('#btnHome'); time.sleep(1.5); shot('home')
    print('screen', pg.evaluate('__ec.G.screen'))
    b.close()
print('errors:', errs or 'none')
