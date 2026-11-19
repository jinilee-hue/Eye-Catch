/* Eye Catch — the cards as real 3D objects in the tutor's scene (user: "카드들도 3d 형태로 구현해").
 * A card = a thick coin: a glossy raised rim (lathe), a face disc with a canvas texture (the pictures standing upright
 * in rows, each with its word underneath — the reference video's cards), a back disc with a sunburst. It is lit by the
 * same lights as the tutor, floats, spins like a coin, and its matched picture gets the video's yellow tile.
 * Faces are redrawn only while something on them animates (hit pop, hint wiggle, wrong shake).
 *
 * Card3D.make(words, {style:'sky'|'pink'|'gold'|'plain'}) -> card (backs are always the deck's gold)
 *   card.root (THREE.Group), card.words, card.place(sx, sy, z), card.hit(w, on), card.hint(w), card.wrong(w),
 *   card.symScreen(w) -> stage px, card.topScreen() -> stage px of its top edge, tweens: spinIn, slideTo, flyTo, gone,
 *   card.dispose(). Card3D.pick(clientX, clientY) -> {card, word} | null. Card3D.deck(n) — the face-down stack.
 */
(function () {
  'use strict';
  const S = window.EC3D;
  const { PI, sin, cos, max, min } = Math;
  const W = window.EC_WORDS.words;
  const ART = window.EC_CARD_ART || {};
  const rnd = (a, b) => a + Math.random() * (b - a);
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // ── pictures (data URLs: fine for WebGL textures from file:// too) ───────────────────────────────────
  const IMG = {};
  const ready = Promise.all(W.map(w => new Promise(res => {
    const im = new Image(); im.onload = () => res(); im.onerror = () => res();
    im.src = ART[w.w] || w.img; IMG[w.w] = im;
  }))).then(() => (document.fonts ? document.fonts.load('700 48px "Baloo 2"') : null)).catch(() => null);

  // ── shared geometry: radius 1, axis along z, front face at +T/2 ────────────────────────────────────
  const T = 0.085, RIN = 0.885;
  const geo = (() => {
    const p = [], h = T / 2;
    const arc = (cx, cy, r, a0, a1, n) => { for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; p.push(new THREE.Vector2(cx + r * cos(a), cy + r * sin(a))); } };
    p.push(new THREE.Vector2(RIN - 0.004, -h));                 // inner back edge of the rim
    arc(1 - 0.045, -h + 0.0, 0.045, -PI / 2, 0, 8);              // round back corner
    arc(1 - 0.045, h - 0.045, 0.045, 0, PI / 2, 8);             // round front corner, level with the face
    p.push(new THREE.Vector2(RIN - 0.004, h));                   // flat to the face: no lip, no groove (user: "파인거 처럼
                                                                  // 안에 그림자 주지말고") — the face is not sunk in
    const rim = new THREE.LatheGeometry(p, 160);
    rim.rotateX(PI / 2);                                          // lathe axis y -> z (front = +z)
    rim.computeVertexNormals();
    const face = new THREE.CircleGeometry(RIN, 160); face.translate(0, 0, h + 0.001);
    const back = new THREE.CircleGeometry(RIN, 160); back.rotateY(PI); back.translate(0, 0, -h - 0.001);
    return { rim, face, back };
  })();

  // rim colours per style (read from the CSS tokens so the palette lives in one place)
  const STYLE = {
    sky: { rim: '--rim-sky', hi: '--rim-sky-hi', deep: '--rim-sky-deep', halo: '--halo-sky' },
    gold: { rim: '--rim-gold', hi: '--rim-gold-hi', deep: '--rim-gold-deep', halo: '--halo-gold' },
    // the right card: pink, so it never matches the yellow deck between the cards (user: "가운데 뒷면도 노란색이라..")
    pink: { rim: '--rim-pink', hi: '--rim-pink-hi', deep: '--rim-pink-deep', halo: '--halo-pink' },
    plain: { rim: '--card', hi: '--card', deep: '--card-edge', halo: '' },
  };
  const backTex = {};
  // the two-line logo (EYE over CATCH, level): the card back's centre and the tin's lid
  const LOGO = new Image();
  const logoReady = new Promise(res => { LOGO.onload = res; LOGO.onerror = res; });
  LOGO.src = window.EC_LOGO_DATA || 'assets/img/logo-game.webp';
  function drawLogo2(g, cx, cy, width, rot = 0, alpha = 1) {
    if (!LOGO.naturalWidth) return;
    const h = width * LOGO.naturalHeight / LOGO.naturalWidth;
    g.save(); g.translate(cx, cy); g.rotate(rot); g.globalAlpha = alpha;
    g.drawImage(LOGO, -width / 2, -h / 2, width, h);
    g.restore();
  }
  // the card back (user: "카드 뒷면처럼 안생겼어 숫자가 들어가서 그런가봐"): sunburst + a cream medallion with the logo
  function backTexture(style) {
    if (backTex[style]) return backTex[style];
    const st = STYLE[style], c = document.createElement('canvas'); c.width = c.height = 1024;
    const g = c.getContext('2d');
    const paint = () => {
      g.clearRect(0, 0, 1024, 1024);
      for (let i = 0; i < 30; i++) {
        g.beginPath(); g.moveTo(512, 512); g.arc(512, 512, 520, i * PI / 15, (i + 1) * PI / 15); g.closePath();
        g.fillStyle = css(i % 2 ? st.hi : st.rim); g.fill();
      }
      g.beginPath(); g.arc(512, 512, 300, 0, 2 * PI); g.fillStyle = css('--card-face'); g.fill();   // white medallion
      g.lineWidth = 22; g.strokeStyle = css(st.deep); g.stroke();
      drawLogo2(g, 512, 512, 440);
    };
    paint();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    logoReady.then(() => { paint(); t.needsUpdate = true; });
    return (backTex[style] = t);
  }
  let haloTexCache = {};
  // halo plane = 3.4 coin radii across (half 1.7): the coin's edge sits at 1/1.7 = 0.59 of the half width
  function haloTexture(style) {
    if (haloTexCache[style]) return haloTexCache[style];
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d'), R = 256, E = 1 / 1.7;
    // the card's own colour glowing off its rim (the reference video): strongest at the rim, fading smoothly out —
    // no white band between the rim and the glow (user: "중간에 흰색이 보이는데..어색해")
    const tint = css(STYLE[style].halo), [cr, cg, cb] = (tint.match(/[\d.]+/g) || [255, 255, 255]).map(Number);
    const col = (al) => `rgba(${cr}, ${cg}, ${cb}, ${al})`;
    const gr = g.createRadialGradient(R, R, 0, R, R, R);
    gr.addColorStop(0, col(0.9)); gr.addColorStop(E * 0.98, col(0.9));
    gr.addColorStop(E * 1.12, col(0.55)); gr.addColorStop(E * 1.32, col(0.22));
    gr.addColorStop(E * 1.6, col(0.06)); gr.addColorStop(1, col(0));
    g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return (haloTexCache[style] = t);
  }
  // slots in FACE units (face radius = 1). Pictures only, big (user: "텍스트를 빼고 이미지가 크게 보여줘야해"):
  // 0.50 across, rows 0.53 apart, middle row at ±0.56, corner pairs at ±0.29 -> boxes never touch, corners inside r 0.97
  const ROWS = [
    [[-0.29, -0.53], [0.29, -0.53], [-0.56, 0], [0, 0], [0.56, 0], [0, 0.53]],
    [[0, -0.53], [-0.56, 0], [0, 0], [0.56, 0], [-0.29, 0.53], [0.29, 0.53]],
  ];
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  const cards = new Set();
  const TEX = 1024, FR = TEX / 2;                    // canvas px per face radius

  function make(words, opts = {}) {
    const style = opts.style || 'sky';
    const st = STYLE[style];
    const card = { words, style, slots: [], dirty: true, anims: [], tw: [], alive: true };
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = TEX;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = S.renderer.capabilities.getMaxAnisotropy();
    const slots = shuffle(ROWS[Math.random() < 0.5 ? 0 : 1].map(s => s.slice()));
    words.forEach((w, i) => {
      const [sx, sy] = slots[i];
      card.slots.push({ w, x: FR + (sx + rnd(-0.012, 0.012)) * FR, y: FR + (sy + rnd(-0.008, 0.008)) * FR,
        s: 0.50 * rnd(0.97, 1.03) * FR, rot: rnd(-7, 7) * PI / 180, k: 1, tile: 0, wig: 0, shake: 0 });
    });
    const labelPx = 0.095 * FR;
    // keep every picture inside the face (the raised rim starts at radius 1)
    for (const sl of card.slots) {
      const hw = sl.s / 2;
      for (let it = 0; it < 30; it++) {
        const dx = sl.x - FR, dy = sl.y - FR;
        const far = Math.max(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => Math.hypot(dx + a * hw, dy + b * hw)));
        if (far <= FR * 0.98) break;
        sl.x = FR + dx * 0.97;
      }
    }
    card.draw = function () {
      ctx.clearRect(0, 0, TEX, TEX);
      ctx.fillStyle = css('--card-face'); ctx.beginPath(); ctx.arc(FR, FR, FR, 0, 2 * PI); ctx.fill();   // flat white
      // two passes: every yellow tile first, then pictures and words on top — a tile never covers a neighbour's word
      // the matched picture: a yellow tile behind the big picture, no word (user: "선택됐을때가 수정하기 전 버전이
      // 낫다는거야" — the tile-with-word try was reverted). Tiles first, pictures on top.
      for (const pass of [0, 1]) for (const sl of card.slots) {
        const im = IMG[sl.w], box = sl.s;
        if (pass === 0 && sl.tile <= 0) continue;
        ctx.save();
        ctx.translate(sl.x + sl.shake * 14 * sin(sl.shake * 40), sl.y);
        ctx.rotate(sl.rot + sl.wig * 0.18 * sin(sl.wig * 30));
        const k = sl.k; ctx.scale(k, k);
        if (pass === 0) {
          // the matched picture glows naturally (user's reference: "이렇게 빛이 자연스러워야지"): a soft light from
          // inside, a thin luminous ring of light round the picture with a warm bloom, and tiny twinkles — breathing
          const tt = card.time, pulse = 0.5 + 0.5 * sin(tt * 4), R = box * 0.7 * (1 + 0.04 * pulse);
          ctx.globalAlpha = sl.tile;
          const bl = ctx.createRadialGradient(0, 0, R * 0.85, 0, 0, R * 1.45);
          bl.addColorStop(0, css('--sel-bloom')); bl.addColorStop(1, 'rgba(255, 230, 160, 0)');
          ctx.fillStyle = bl; ctx.beginPath(); ctx.arc(0, 0, R * 1.45, 0, 2 * PI); ctx.fill();
          const inn = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
          inn.addColorStop(0, css('--sel-core')); inn.addColorStop(0.7, css('--sel-mid')); inn.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = inn; ctx.beginPath(); ctx.arc(0, 0, R, 0, 2 * PI); ctx.fill();
          ctx.lineWidth = box * 0.034; ctx.strokeStyle = css('--sel-ring');
          ctx.shadowColor = css('--sel-ring-glow');
          for (const blur of [44 + 20 * pulse, 22, 8]) { ctx.shadowBlur = blur; ctx.beginPath(); ctx.arc(0, 0, R, 0, 2 * PI); ctx.stroke(); }
          ctx.shadowBlur = 0;
          for (let i = 0; i < 9; i++) {
            const a = i / 9 * 2 * PI + 0.3 + tt * 0.25, rr = R * (0.95 + 0.22 * ((i * 5) % 3) / 2), o = i * 1.7;
            const tw = Math.abs(sin(tt * 2.8 + o)), r = box * (i % 3 ? 0.022 : 0.055) * (0.3 + 0.7 * tw);
            const x = rr * cos(a), y = rr * sin(a);
            ctx.fillStyle = i % 2 ? css('--sel-spark') : css('--sel-ring');
            ctx.shadowColor = css('--sel-ring-glow'); ctx.shadowBlur = 10;
            ctx.beginPath();
            for (let j = 0; j < 8; j++) { const b = j * PI / 4, q = j % 2 ? r * 0.3 : r; ctx.lineTo(x + q * cos(b), y + q * sin(b)); }
            ctx.closePath(); ctx.fill();
          }
          ctx.restore();
          continue;
        }
        if (im && im.naturalWidth) {
          const ar = im.naturalWidth / im.naturalHeight;
          const w = ar >= 1 ? box : box * ar, h = ar >= 1 ? box / ar : box;
          ctx.drawImage(im, -w / 2, -h / 2, w, h);
        }
        ctx.restore();
      }
      tex.needsUpdate = true;
      card.dirty = false;
    };
    function rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

    // meshes
    const rimMat = new THREE.MeshStandardMaterial({ color: css(st.rim), roughness: 0.3, metalness: 0.05, envMapIntensity: 1.1, side: THREE.DoubleSide });
    const faceMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });   // true white, no yellow cast (user)
    // the back in the card's own colour: the deck is sky and pink cards stacked by turns, no yellow (user)
    const backMat = new THREE.MeshStandardMaterial({ map: backTexture(style === 'plain' ? 'sky' : style), roughness: 0.45 });
    const root = new THREE.Group();              // placed on the stage
    const mover = new THREE.Group(); root.add(mover);      // tweens (spin in, slide, fly)
    const tilt = new THREE.Group(); mover.add(tilt);       // turned in toward the middle (card.yawTo)
    const bob = new THREE.Group(); tilt.add(bob);          // idle float
    const coin = new THREE.Group(); bob.add(coin);
    const rim = new THREE.Mesh(geo.rim, rimMat), face = new THREE.Mesh(geo.face, faceMat), back = new THREE.Mesh(geo.back, backMat);
    coin.add(rim, face, back);
    face.userData.card = card;
    if (st.halo) {
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ map: haloTexture(style), transparent: true, depthWrite: false }));
      halo.position.z = -0.07; halo.renderOrder = -1;            // right behind the coin, turning and floating with it
      bob.add(halo); card.halo = halo;
    }
    card.root = root; card.mover = mover; card.tilt = tilt; card.bob = bob; card.coin = coin; card.face = face;
    card.mats = [rimMat, faceMat, backMat]; card.tex = tex;
    card.float = opts.float !== false; card.phase = Math.random() * 10;
    S.scene.add(root);
    cards.add(card);
    ready.then(() => { if (card.alive) card.draw(); });
    card.draw();

    card.place = function (sx, sy, z = -1.5, px = 890) {
      const { p, k } = S.placeAt(sx, sy, z);
      root.position.copy(p);
      root.scale.setScalar(px / 200 * k);
      card.home = { sx, sy, z, px };
      return card;
    };
    const slotOf = w => card.slots.find(s => s.w === w);
    card.hit = (w, on = true) => { const sl = slotOf(w); if (!sl) return; sl.hitOn = on; card.anims.push(sl); };
    card.hint = (w) => { const sl = slotOf(w); if (!sl) return; sl.wig = 1.5; card.anims.push(sl); };
    card.wrong = (w) => { const sl = slotOf(w); if (!sl) return; sl.shake = 0.5; card.anims.push(sl); };
    card.clearHits = () => card.slots.forEach(sl => { if (sl.hitOn) card.hit(sl.w, false); });
    /** stage px of a picture's middle (for sparkles) */
    card.symScreen = (w) => {
      const sl = slotOf(w); if (!sl) return null;
      const v = new THREE.Vector3((sl.x - FR) / FR * RIN, -(sl.y - FR) / FR * RIN, T / 2);
      face.updateWorldMatrix(true, false);
      return S.project(face.localToWorld(v));
    };
    card.topScreen = () => { face.updateWorldMatrix(true, false); return S.project(face.localToWorld(new THREE.Vector3(0, 1, T / 2))); };
    card.centerScreen = () => { face.updateWorldMatrix(true, false); return S.project(face.localToWorld(new THREE.Vector3(0, 0, T / 2))); };
    card.slotAtUV = (uv) => {
      const x = uv.x * TEX, y = (1 - uv.y) * TEX;
      let best = null, bd = 1e9;
      for (const sl of card.slots) { const d = Math.hypot(sl.x - x, sl.y - y); if (d < bd) { bd = d; best = sl; } }
      return best && bd < best.s * 0.85 ? best.w : null;
    };
    // tweens on the mover (position offset in world units, spin about y, scale)
    card.tween = (ms, fn, ease = t => 1 - Math.pow(1 - t, 3)) => new Promise(res => card.tw.push({ ms, t: 0, fn, ease, res }));
    card.spinIn = (from, ms = 1050, turns = 3) => {      // from: stage px (the deck)
      const a = S.placeAt(from.x, from.y, card.home.z).p.sub(root.position).divideScalar(root.scale.x);
      mover.position.copy(a); mover.scale.setScalar(0.12); mover.rotation.y = turns * 2 * PI;
      return card.tween(ms, (u) => {
        mover.position.copy(a).multiplyScalar(1 - u);
        mover.scale.setScalar(0.12 + 0.88 * u);
        mover.rotation.y = turns * 2 * PI * (1 - u);
      }, t => 1 - Math.pow(1 - t, 3));
    };
    card.slideTo = (sx, sy, ms = 750) => {
      const { p } = S.placeAt(sx, sy, card.home.z);
      const d = p.clone().sub(root.position).divideScalar(root.scale.x);
      card.home.sx = sx; card.home.sy = sy;
      return card.tween(ms, (u) => {
        mover.position.copy(d).multiplyScalar(u); mover.rotation.y = -2 * PI * u;
        mover.position.z = sin(u * PI) * 0.6;
      }, t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2).then(() => {
        root.position.copy(p); mover.position.set(0, 0, 0); mover.rotation.y = 0;
      });
    };
    card.flyTo = (sx, sy, ms = 850, dir = 1) => {
      const { p } = S.placeAt(sx, sy, 3);
      const d = p.clone().sub(root.position).divideScalar(root.scale.x);
      return card.tween(ms, (u) => {
        mover.position.copy(d).multiplyScalar(u); mover.position.y += sin(u * PI) * 0.6;
        mover.scale.setScalar(1 - 0.93 * u); mover.rotation.y = dir * 4 * PI * u;
      }, t => t * t * (3 - 2 * t));
    };
    /** a won card flies to its player's side of the table and lies down there, fanned on the pile (user: "카드 획득한건
     *  민트 테이블에 양옆에 카드들이 펼쳐진채 쌓이게"). sx, sy = stage px; px = its size there; rz = its turn on the pile */
    card.toPile = (sx, sy, px, rz, z, ms = 900, dir = 1) => {
      const { p, k } = S.placeAt(sx, sy, z);
      const d = p.clone().sub(root.position).divideScalar(root.scale.x);
      const s1 = (px / 200 * k) / root.scale.x, y0 = tilt.rotation.y;
      card.float = false; bob.position.set(0, 0, 0); bob.rotation.set(0, 0, 0);
      if (card.halo) card.halo.visible = false;
      return card.tween(ms, (u) => {
        mover.position.copy(d).multiplyScalar(u); mover.position.y += sin(u * PI) * 0.9;
        mover.scale.setScalar(1 + (s1 - 1) * u);
        tilt.rotation.y = y0 * (1 - u);
        mover.rotation.set(-1.0 * u, dir * 2 * PI * u, rz * u);       // a flip on the way, then flat on the table
      }, t => t * t * (3 - 2 * t));
    };
    /** a sky / gold rim for the slot it now sits in (the right card slides over to the left) */
    card.restyle = (style, ms = 700) => {
      const to = new THREE.Color(css(STYLE[style].rim)), from = rimMat.color.clone();
      card.style = style;
      if (card.halo) { card.halo.material.map = haloTexture(style); card.halo.material.needsUpdate = true; }
      return card.tween(ms, u => rimMat.color.copy(from).lerp(to, u), t => t);
    };
    /** turn the face toward the middle of the table (radians about y; + = toward the right) */
    card.yawTo = (y, ms = 0) => {
      if (!ms) { tilt.rotation.y = y; return Promise.resolve(); }
      const y0 = tilt.rotation.y;
      return card.tween(ms, u => { tilt.rotation.y = y0 + (y - y0) * u; });
    };
    card.gone = (ms = 600) => card.tween(ms, (u) => { mover.scale.setScalar(1 - u); mover.rotation.y = 3 * PI * u; mover.position.y = 0.35 * u; }, t => t * t);
    card.dispose = () => {
      card.alive = false; cards.delete(card); S.scene.remove(root);
      tex.dispose(); faceMat.dispose(); rimMat.dispose(); backMat.dispose();
      if (card.halo) { card.halo.geometry.dispose(); card.halo.material.dispose(); }
    };
    card.update = (dt, t) => {
      if (card.float) {
        const ph = t * 1.12 + card.phase;
        bob.position.y = sin(ph) * 0.018;
        bob.rotation.x = 0.07 * sin(ph * 0.9 + 1);
        bob.rotation.y = 0.11 * sin(ph * 0.7);
      }
      if (card.halo) { card.halo.scale.setScalar(1 + 0.04 * sin(t * 2 + card.phase)); card.halo.material.opacity = 0.85 + 0.15 * sin(t * 2.6 + card.phase); }
      for (let i = card.tw.length - 1; i >= 0; i--) {
        const tw = card.tw[i]; tw.t += dt * 1000;
        const u = min(1, tw.t / tw.ms); tw.fn(tw.ease(u));
        if (u >= 1) { card.tw.splice(i, 1); tw.res(); }
      }
      // face animations: tile in/out with a pop, wiggle, shake
      let busy = false;
      card.time = t;
      for (const sl of card.slots) {
        const want = sl.hitOn ? 1 : 0;
        if (sl.tile !== want) { sl.tile = want ? min(1, sl.tile + dt * 5) : max(0, sl.tile - dt * 5); busy = true; }
        const kWant = sl.hitOn ? 1.1 + 0.025 * sin(t * 4) : 1;
        if (Math.abs(sl.k - kWant) > 0.002 || sl.hitOn) { sl.k += (kWant - sl.k) * min(1, dt * 12); busy = true; }
        if (sl.wig > 0) { sl.wig = max(0, sl.wig - dt); busy = true; }
        if (sl.shake > 0) { sl.shake = max(0, sl.shake - dt); busy = true; }
      }
      if (busy || card.dirty) card.draw();
    };
    return card;
  }

  S.ticks.push((dt, t) => { for (const c of cards) c.update(dt, t); });

  // ── picking (tap mode) ───────────────────────────────────────────────────────────────────────────────
  const ray = new THREE.Raycaster();
  function pick(clientX, clientY) {
    const r = S.canvas.getBoundingClientRect();
    const v = new THREE.Vector2((clientX - r.left) / r.width * 2 - 1, -((clientY - r.top) / r.height * 2 - 1));
    ray.setFromCamera(v, S.camera);
    const faces = [...cards].map(c => c.face);
    const hit = ray.intersectObjects(faces, false)[0];
    if (!hit || !hit.uv) return null;
    const card = hit.object.userData.card;
    return { card, word: card.slotAtUV(hit.uv) };
  }

  // ── the deck: coins face down, stacked ───────────────────────────────────────────────────────────────
  let deck = null;
  // the deck: the cards still to come, face down — one coin per card, so its height is the count (no number on it)
  function setDeck(n, sx = 1200, sy = 930, px = 300) {
    if (!deck) {
      deck = new THREE.Group();
      // sky and pink cards stacked by turns (user: "노란색말고 파란색과 핑크색 두개가 번갈아가면서 쌓여있으면")
      const mats = ['sky', 'pink'].map(st => ({
        back: new THREE.MeshStandardMaterial({ map: backTexture(st), roughness: 0.45 }),
        rim: new THREE.MeshStandardMaterial({ color: css(STYLE[st].rim), roughness: 0.3, envMapIntensity: 1.1, side: THREE.DoubleSide }),
      }));
      deck.coins = [];
      for (let i = 0; i < 12; i++) {
        const { back: backMat, rim: rimMat } = mats[i % 2];
        const g = new THREE.Group();
        g.add(new THREE.Mesh(geo.rim, rimMat), new THREE.Mesh(geo.face, backMat));
        g.position.set(0, -i * 0.045, -i * 0.1);
        deck.add(g); deck.coins.push(g);
      }
      S.scene.add(deck);
      S.ticks.push((dt, t) => { if (deck.visible) deck.rotation.set(0.1 + 0.03 * sin(t * 1.3), 0.1 * sin(t * 0.8), 0); });
    }
    const { p, k } = S.placeAt(sx, sy, -3);
    deck.position.copy(p); deck.scale.setScalar(px / 200 * k);
    deck.visible = n > 0;
    // the top coin stays in place; the stack grows downward/back
    deck.coins.forEach((c, i) => { c.visible = i < n; });
  }
  function hideDeck() { if (deck) deck.visible = false; }
  /** the word card pops up where the deck is: the deck steps out of the way meanwhile */
  function deckPeek(on) { if (deck && deck.coins.some(c => c.visible)) deck.visible = on; }

  // ── ambient light on the game table (the reference video): a slow golden ray burst behind the deck and twinkling
  //    sparkles drifting up round the cards. Card3D.ambient(true|false), Card3D.burst() on a match.
  let amb = null;
  function ambient(on, cx = 1200, cy = 1060) {
    if (!amb && on) {
      amb = new THREE.Group();
      const rc = document.createElement('canvas'); rc.width = rc.height = 512;
      const g = rc.getContext('2d'), R = 256;
      const rg = g.createRadialGradient(R, R, 10, R, R, R);
      rg.addColorStop(0, css('--amb-ray-core')); rg.addColorStop(0.25, css('--amb-ray')); rg.addColorStop(1, 'rgba(255, 255, 255, 0)');
      g.fillStyle = rg;
      for (let i = 0; i < 24; i++) { const a = i / 24 * 2 * PI; g.beginPath(); g.moveTo(R, R); g.arc(R, R, R, a, a + PI / 34); g.closePath(); g.fill(); }
      const cg = g.createRadialGradient(R, R, 0, R, R, R * 0.45);
      cg.addColorStop(0, css('--amb-ray-core')); cg.addColorStop(1, 'rgba(255, 255, 255, 0)');
      g.fillStyle = cg; g.fillRect(0, 0, 512, 512);
      const rt = new THREE.CanvasTexture(rc); rt.colorSpace = THREE.SRGBColorSpace;
      const rays = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: rt, transparent: true, depthWrite: false, opacity: 0.55 }));
      rays.renderOrder = -2; amb.add(rays); amb.rays = rays;
      // sparkles: little 4-point stars
      const sc = document.createElement('canvas'); sc.width = sc.height = 64;
      const sg = sc.getContext('2d');
      const sgr = sg.createRadialGradient(32, 32, 0, 32, 32, 32); sgr.addColorStop(0, 'rgba(255,255,255,1)'); sgr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); sgr.addColorStop(1, 'rgba(255,255,255,0)');
      sg.fillStyle = sgr; sg.fillRect(0, 0, 64, 64);
      sg.fillStyle = '#fff'; sg.beginPath();
      for (let i = 0; i < 8; i++) { const a = i * PI / 4, rr = i % 2 ? 4 : 30; sg.lineTo(32 + rr * cos(a), 32 + rr * sin(a)); }
      sg.closePath(); sg.fill();
      const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
      const cols = ['--spark-1', '--spark-2', '--spark-3', '--spark-4'].map(css);
      amb.sparks = [];
      for (let i = 0; i < 44; i++) {
        const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: st, color: cols[i % cols.length], transparent: true, depthWrite: false }));
        // round the two cards (stage px), a few over the middle
        const side = i % 3, x = side === 2 ? rnd(1000, 1400) : (side ? rnd(1350, 2270) : rnd(130, 1050)), y = rnd(420, 1500);
        m.userData = { x, y, z: rnd(-3, 1), s: rnd(14, 34), ph: rnd(0, 10), sp: rnd(0.6, 1.6), up: rnd(14, 40) };
        amb.add(m); amb.sparks.push(m);
      }
      S.scene.add(amb);
      S.ticks.push((dt, t) => {
        if (!amb.visible) return;
        const { p, k } = S.placeAt(amb.cx, amb.cy, -4.5);
        amb.rays.position.copy(p); amb.rays.rotation.z = t * 0.12;
        amb.boost = Math.max(0, (amb.boost || 0) - dt * 0.7);
        amb.rays.scale.setScalar((7.5 + 0.5 * sin(t * 1.3) + 8 * amb.boost) * k);   // a glow round the deck; flares on a match
        amb.rays.material.opacity = 0.85 * amb.boost;                 // only the match burst (user: the white in the middle)
        for (const m of amb.sparks) {
          const u = m.userData, yy = u.y - ((t * u.up) % 260) + 130;
          const q = S.placeAt(u.x + 18 * sin(t * 0.5 + u.ph), yy, u.z);
          m.position.copy(q.p);
          const tw = Math.max(0, sin(t * u.sp * 2.2 + u.ph));
          m.scale.setScalar(u.s / 100 * q.k * (0.3 + tw * (1 + amb.boost)));
          m.material.opacity = 0.25 + 0.75 * tw;
        }
      });
    }
    if (!amb) return;
    amb.visible = on; amb.cx = cx; amb.cy = cy;
  }
  /** a match: the rays flare up and the sparkles brighten for a moment */
  function burst() { if (amb) amb.boost = 1; }

  window.Card3D = { make, ambient, burst, deckPeek, pick, ready, setDeck, hideDeck, drawLogo2, logoReady, all: cards };
})();
