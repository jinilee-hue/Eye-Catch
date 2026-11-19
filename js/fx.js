/* Eye Catch — effects in the front layer (stage px). Sparkle bursts, confetti, fireworks (the reference video's end). */
(function () {
  'use strict';
  const fx = () => document.getElementById('fx');
  const COLS = ['var(--rim-l)', 'var(--pink)', 'var(--p1)', 'var(--mint)', 'var(--rim-r)', 'var(--cream)'];
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const rnd = (a, b) => a + Math.random() * (b - a);
  function add(el, ms) { fx().appendChild(el); setTimeout(() => el.remove(), ms); return el; }

  const FX = {};
  FX.sparkles = function (x, y, n = 14, spread = 260, cols = COLS) {
    for (let i = 0; i < n; i++) {
      const e = document.createElement('i'); e.className = 'spark';
      const a = Math.random() * Math.PI * 2, r = spread * rnd(0.45, 1);
      e.style.cssText = `left:${x}px;top:${y}px;--s:${rnd(26, 62)}px;--c:${pick(cols)};--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r}px;--t:${rnd(0.6, 1.1)}s`;
      add(e, 1300);
    }
    const b = document.createElement('i'); b.className = 'burst';
    b.style.cssText = `left:${x}px;top:${y}px;--c:var(--glow);--r:${spread * 0.55}px`;
    add(b, 800);
  };
  FX.confetti = function (n = 90, ms = 3600) {
    const ex = (window.__ec && __ec.G.ex) || 0, ey = (window.__ec && __ec.G.ey) || 0;
    for (let i = 0; i < n; i++) {
      const e = document.createElement('i'); e.className = 'confetti';
      e.style.cssText = `left:${rnd(-ex, 2400 + ex)}px;top:${-60 - ey}px;--w:${rnd(16, 30)}px;--h:${rnd(26, 44)}px;--c:${pick(COLS)};--t:${rnd(2.2, 3.6)}s;--delay:${rnd(0, ms / 2600)}s;--dx:${rnd(-260, 260)}px;--r:${rnd(-900, 900)}deg`;
      add(e, ms + 2600);
    }
  };
  FX.firework = function (x, y) {
    const c = pick(COLS);
    for (let i = 0; i < 26; i++) {
      const e = document.createElement('i'); e.className = 'firework';
      const a = i / 26 * Math.PI * 2, r = rnd(180, 300);
      e.style.cssText = `left:${x}px;top:${y}px;--c:${Math.random() < 0.7 ? c : 'var(--cream)'};--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r}px;--t:${rnd(0.9, 1.4)}s`;
      add(e, 1600);
    }
    if (window.Sound) Sound.sfx('firework');
  };
  FX.fireworks = function (count = 6, ms = 3200) {
    const ex = (window.__ec && __ec.G.ex) || 0;
    for (let i = 0; i < count; i++) setTimeout(() => FX.firework(rnd(300 - ex, 2100 + ex), rnd(250, 800)), i * ms / count + rnd(0, 200));
  };
  /** glowing ribbons that swirl once round (x, y) and fade (the light trails round the cards in the reference video) */
  FX.ribbon = function (x, y, r) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'ribbon');
    svg.setAttribute('viewBox', `${-r * 1.3} ${-r * 1.3} ${r * 2.6} ${r * 2.6}`);
    svg.style.cssText = `left:${x - r * 1.3}px;top:${y - r * 1.3}px;width:${r * 2.6}px;height:${r * 2.6}px`;
    const loops = [[1.12, .42, -18, 'var(--ribbon-a)', ''], [1.05, .5, 24, 'var(--ribbon-b)', 'thin'], [1.18, .34, 4, 'var(--ribbon-c)', 'thin']];
    loops.forEach(([kx, ky, rot, c, cls], i) => {
      const a = r * kx, b = r * ky;
      const path = document.createElementNS(ns, 'path');
      // an ellipse drawn from its left end, a little more than once round
      path.setAttribute('d', `M ${-a} 0 A ${a} ${b} 0 1 1 ${a} 0 A ${a} ${b} 0 1 1 ${-a * 0.9} ${b * 0.4}`);
      path.setAttribute('transform', `rotate(${rot})`);
      if (cls) path.setAttribute('class', cls);
      const len = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
      path.style.cssText = `--c:${c};--len:${len.toFixed(0)};animation-delay:${i * 0.1}s`;
      svg.appendChild(path);
    });
    add(svg, 1800);
  };
  /** golden rays bursting out behind (x, y) */
  FX.rays = function (x, y, r = 800) {
    const e = document.createElement('i'); e.className = 'rays';
    e.style.cssText = `left:${x}px;top:${y}px;--r:${r}px`;
    add(e, 1500);
  };
  /** centre of an element in stage px */
  FX.center = function (el) {
    const st = document.getElementById('stage').getBoundingClientRect(), r = el.getBoundingClientRect();
    const k = st.width / 2400;
    return { x: (r.left + r.width / 2 - st.left) / k, y: (r.top + r.height / 2 - st.top) / k, w: r.width / k, h: r.height / k };
  };
  window.FX = FX;
})();
