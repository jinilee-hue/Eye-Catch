/* Eye Catch — the pink EYE CATCH card tin on the title, in 3D, as close to the title mockup as possible
 * (user: "최대한 이미지로 전달한 스타일과 비슷하게 3d 형태로 카드통 만들어줘"):
 *  - a satin pink round tin: puffy cream EYE CATCH letters that really stand out of the wall (displaced geometry, not
 *    a bump map), a stepped top band with a thick rolled lip, a rolled foot, a pale inner wall, a stack of cards inside
 *  - its lid leaning on the right: a deep lid (a wide side band with rolled edges), a raised centre plateau inside a
 *    pressed groove, little embossed stars, the logo in two lines in puffy relief (displaced too) and full colour
 * Lit by the tutor's scene lights. Tin3D.show(true|false) — built once (after the font and the logo load), drops in.
 */
(function () {
  'use strict';
  const S = window.EC3D;
  const { PI, sin, cos, min } = Math;
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const H = 0.84;                 // tin height / radius
  const BAND = 0.13;              // the top band (where the lid fits) above the lettered wall
  const WH = H - BAND;            // lettered wall height
  let tin = null, building = null;
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function tex(c, srgb = true) {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = S.renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  /** bilinear sampler over a canvas's red channel (0..1), u/v in 0..1, v = 0 at the canvas top */
  function sampler(c) {
    const { width: w, height: h } = c, d = c.getContext('2d').getImageData(0, 0, w, h).data;
    return (u, v) => {
      const x = Math.max(0, Math.min(w - 1.001, u * (w - 1))), y = Math.max(0, Math.min(h - 1.001, v * (h - 1)));
      const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
      const at = (xx, yy) => d[(yy * w + xx) * 4] / 255;
      return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
    };
  }
  /** white silhouette of whatever draw() paints (for height fields) */
  function silhouette(w, h, draw) {
    const c = canvas(w, h), g = c.getContext('2d');
    draw(g);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    return c;
  }

  // ── the lettered wall ────────────────────────────────────────────────────────────────────────────────
  function wallText(g, W, Hh, fill) {
    g.font = `800 ${Math.round(Hh * 0.6)}px "Baloo 2", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if ('letterSpacing' in g) g.letterSpacing = `${Math.round(Hh * 0.03)}px`;
    g.fillStyle = fill; g.fillText('EYE CATCH', W * 0.5, Hh * 0.56);
  }
  function buildWall() {
    const W = 4096, Hh = Math.round(W * WH / (2 * PI));
    // colour: satin pink, lighter up top and darker toward the table; cream letters with a soft shadow below
    const cc = canvas(W, Hh), g = cc.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, Hh);
    gr.addColorStop(0, css('--tin-hi')); gr.addColorStop(0.55, css('--tin')); gr.addColorStop(1, css('--tin-lo'));
    g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
    g.filter = `blur(${Math.round(Hh * 0.025)}px)`; g.save(); g.translate(0, Hh * 0.035); wallText(g, W, Hh, css('--tin-shade')); g.restore();
    g.filter = 'none'; wallText(g, W, Hh, css('--tin-letter'));
    // height: the letters, puffy (blurred silhouette -> smoothstep: round shoulders, a full top)
    const hc = canvas(2048, Math.round(Hh / 2)), hg = hc.getContext('2d');
    hg.fillStyle = '#000'; hg.fillRect(0, 0, hc.width, hc.height);
    hg.filter = `blur(${Math.round(hc.height * 0.035)}px)`; wallText(hg, hc.width, hc.height, '#fff'); hg.filter = 'none';
    const hs = sampler(hc);
    const geo = new THREE.CylinderGeometry(1, 1, WH, 720, 150, true, PI, 2 * PI);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const u = uv.getX(i), v = 1 - uv.getY(i);
      const d = 0.05 * smooth(0.04, 0.72, hs(u, v));
      const x = pos.getX(i), z = pos.getZ(i), r = Math.hypot(x, z) || 1;
      pos.setX(i, x * (1 + d / r)); pos.setZ(i, z * (1 + d / r));
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex(cc), roughness: 0.46, metalness: 0, envMapIntensity: 0.65 }));
    m.position.y = WH / 2;
    return m;
  }

  // ── the lid's face: plateau, groove, stars, the logo in relief ───────────────────────────────────────
  function star(g, x, y, r, rot) {
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = rot + i * PI / 5 - PI / 2, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + rr * cos(a), y + rr * sin(a)); }
    g.closePath(); g.fill();
  }
  function stars(g, N) {
    const R = N / 2;
    for (let i = 0; i < 20; i++) {
      const a = i / 20 * 2 * PI + 0.15, rr = R * (0.79 + 0.035 * ((i * 7) % 3 - 1));
      star(g, R + rr * cos(a), R + rr * sin(a), N * (0.016 + 0.006 * (i % 3)), a);
    }
  }
  function buildLidFace() {
    // the lid's words: EYE over CATCH in the same puffy cream letters as the tin's wall — not the colourful logo pasted
    // on (user: "뚜껑에 로고가 그대로 들어가서 좀더 별루") — raised out of the pink, a soft shade under them
    const N = 1024, R = N / 2;
    const words = (g2, n, fill, dy = 0) => {
      g2.fillStyle = fill; g2.textAlign = 'center'; g2.textBaseline = 'middle';
      if ('letterSpacing' in g2) g2.letterSpacing = `${Math.round(n * 0.008)}px`;
      g2.font = `800 ${Math.round(n * 0.25)}px "Baloo 2", sans-serif`; g2.fillText('EYE', n / 2, n * 0.4 + dy);
      g2.font = `800 ${Math.round(n * 0.215)}px "Baloo 2", sans-serif`; g2.fillText('CATCH', n / 2, n * 0.62 + dy);
    };
    // colour
    const cc = canvas(N, N), g = cc.getContext('2d');
    const gr = g.createRadialGradient(R * 0.75, R * 0.6, R * 0.1, R, R, R);
    gr.addColorStop(0, css('--tin-hi')); gr.addColorStop(1, css('--tin'));
    g.fillStyle = gr; g.fillRect(0, 0, N, N);
    g.fillStyle = css('--tin-star'); stars(g, N);
    g.filter = `blur(${Math.round(N * 0.008)}px)`; words(g, N, css('--tin-shade'), N * 0.012); g.filter = 'none';
    words(g, N, css('--tin-letter'));
    // height: rim, groove, raised plateau, + stars, + the logo's letters
    const h = 512, hR = 256, hc = canvas(h, h), hg = hc.getContext('2d');
    hg.fillStyle = 'rgb(64,64,64)'; hg.fillRect(0, 0, h, h);
    // the carved centre as before (user: "가운데 파인느낌은 이전꺼가 나은데"): a groove pressed round a raised centre — only
    // the dark PAINTED ring is gone, and the lid's edge stays flush (the bead standing above it made the dark top line)
    hg.filter = 'blur(5px)';
    hg.fillStyle = 'rgb(12,12,12)'; hg.beginPath(); hg.arc(hR, hR, hR * 0.925, 0, 2 * PI); hg.fill();
    hg.fillStyle = 'rgb(90,90,90)'; hg.beginPath(); hg.arc(hR, hR, hR * 0.875, 0, 2 * PI); hg.fill();
    hg.filter = 'blur(2px)'; hg.globalCompositeOperation = 'lighter';
    hg.fillStyle = 'rgb(55,55,55)'; stars(hg, h);
    hg.filter = 'blur(6px)'; hg.globalAlpha = 0.75; words(hg, h, 'rgb(255,255,255)');
    hg.globalAlpha = 1; hg.filter = 'none'; hg.globalCompositeOperation = 'source-over';
    const hs0 = sampler(hc), hs = (u, v) => { const x = hs0(u, v); return x < 0.36 ? x : 0.36 + 0.64 * smooth(0.36, 0.9, x); };   // puffy
    const geo = new THREE.RingGeometry(0.0005, 1, 360, 150);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, 0.11 * hs(uv.getX(i), 1 - uv.getY(i)));
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex(cc), roughness: 0.46, metalness: 0, envMapIntensity: 0.65 }));
  }

  /** Lean the lid AGAINST the tin, never through it (user: "통이 뚜껑을 관통했어"): sample the lid's rim and face (both
   *  sides of its band) in the tin's own frame; while any point is inside the tin (r < lip, 0 <= y <= top), slide the lid
   *  straight out from the tin's axis; then let it down until its lowest point sits on the table (y = 0). */
  function settleLid(lid, body, LR, DEPTH) {
    const pts = [];
    for (let i = 0; i < 72; i++) {
      const a = i / 72 * 2 * PI;
      for (const r of [0.35, 0.7, LR, LR + 0.05]) for (const z of [0.1, -0.12, -DEPTH - 0.02]) pts.push(new THREE.Vector3(r * cos(a), r * sin(a), z));
    }
    pts.push(new THREE.Vector3(0, 0, 0.11));
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(body.quaternion);          // the table's up, in the lid's parent frame
    const scan = () => {
      lid.updateMatrix(); body.updateMatrix();
      const m = new THREE.Matrix4().copy(body.matrix).invert().multiply(lid.matrix);
      let inside = 0, minY = Infinity;
      for (const p of pts) {
        const q = p.clone().applyMatrix4(m);
        if (q.y > -0.01 && q.y < H + 0.08 && Math.hypot(q.x, q.z) < 1.065) inside++;
        minY = Math.min(minY, q.y);
      }
      return { inside, minY };
    };
    const out = new THREE.Vector3(0.28, 0, 1).normalize();       // out to the FRONT: it ends leaning on the tin's front-right, overlapping it like the mockup
    for (let it = 0; it < 300; it++) {
      const { inside, minY } = scan();
      if (inside) { lid.position.addScaledVector(out, 0.012); continue; }
      if (Math.abs(minY) > 0.006) { lid.position.addScaledVector(up, -minY * 0.8); continue; }
      break;
    }
    const r = scan();
    if (r.inside) console.warn('tin lid still touches the tin', r);
  }

  function build() {
    const pink = (o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: css('--tin'), roughness: 0.42, metalness: 0, envMapIntensity: 0.65, side: THREE.DoubleSide }, o));
    const lathe = (pts, mat, seg = 160) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);
    const arc = (cx, cy, r, a0, a1, n) => { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; o.push([cx + r * cos(a), cy + r * sin(a)]); } return o; };
    const root = new THREE.Group(), drop = new THREE.Group(), body = new THREE.Group();
    root.add(drop); drop.add(body);
    // wall + foot bead + the top band (a small step in, then the rolled lip)
    body.add(buildWall());
    body.add(lathe(arc(1.0, 0.035, 0.035, -PI / 2, PI / 2, 10), pink()));                                  // rolled foot
    body.add(lathe([[1.0, WH], [0.988, WH + 0.012], [0.982, WH + 0.03], [0.982, H - 0.06], ...arc(1.0, H - 0.03, 0.045, -PI * 0.75, PI, 18), [0.955, H - 0.03]],
      pink({ color: css('--tin-hi') })));                                                                  // band + rolled lip
    // inside: a pale wall (darker deep down) and the cards
    const ic = canvas(8, 256), ig = ic.getContext('2d'), igr = ig.createLinearGradient(0, 0, 0, 256);
    igr.addColorStop(0, css('--tin-in')); igr.addColorStop(1, css('--tin-in-lo'));
    ig.fillStyle = igr; ig.fillRect(0, 0, 8, 256);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.955, 0.955, H - 0.03, 160, 1, true),
      new THREE.MeshStandardMaterial({ map: tex(ic), roughness: 0.4, metalness: 0, side: THREE.BackSide }));
    inner.position.y = (H - 0.03) / 2; body.add(inner);
    // the cards inside, as a real stack (user: "카드케이스 좀더 자연스럽게"): the side shows the cards' edges in layers —
    // sky and pink rims by turns with a thin shaded seam between cards — and the top card a little turned
    const NS = 16, stc = canvas(8, 512), stg = stc.getContext('2d'), seam = 512 / NS;
    for (let i = 0; i < NS; i++) {
      stg.fillStyle = css(i % 2 ? '--rim-pink' : '--rim-sky'); stg.fillRect(0, i * seam, 8, seam);
      stg.fillStyle = css('--rim-sky-hi'); stg.globalAlpha = 0.55; stg.fillRect(0, i * seam, 8, seam * 0.22); stg.globalAlpha = 1;   // the lit top of each rim
      stg.fillStyle = css('--tin-in-lo'); stg.fillRect(0, (i + 1) * seam - seam * 0.16, 8, seam * 0.16);                       // the seam under it
    }
    const stexture = tex(stc); stexture.wrapS = THREE.RepeatWrapping;
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, H * 0.74, 120, 1, true), new THREE.MeshStandardMaterial({ map: stexture, roughness: 0.6 }));
    stack.position.y = H * 0.39; body.add(stack);
    const stackTop = new THREE.Mesh(new THREE.CircleGeometry(0.9, 120), new THREE.MeshStandardMaterial({ color: css('--card-face'), roughness: 0.6 }));
    stackTop.rotation.x = -PI / 2; stackTop.position.y = H * 0.76; body.add(stackTop);
    const top = Card3D.make(Cards.makeDeck(1).cards[0], { style: 'plain', float: false });
    S.scene.remove(top.root); body.add(top.root);
    top.root.scale.setScalar(0.88); top.root.rotation.set(-PI / 2 + 0.1, 0, 0.35); top.root.position.set(0, H * 0.78 + 0.05, -0.02);

    // the lid: face (relief) + a deep side band with rolled edges + a pale inside
    const LR = 0.9, DEPTH = 0.16;                     // in front of the tin it looks bigger: a little smaller than the tin
    const lid = new THREE.Group();
    // the lid's top is flush: the edge rolls DOWN from the face's own level (the face's flat area sits at z 0.028) — a bead
    // standing above it showed its shaded inner slope as a dark ring along the top (user: "위쪽 … 그림자가 안으로 들어간")
    const FZ = 0.028;
    const face = buildLidFace(); face.scale.setScalar(LR - 0.05); lid.add(face);
    const band = lathe([[LR - 0.06, FZ], ...arc(LR - 0.05, FZ - 0.05, 0.05, PI * 0.5, 0, 14), [LR, -0.06], [LR, -DEPTH + 0.05], ...arc(LR - 0.04, -DEPTH + 0.05, 0.04, 0, -PI * 0.9, 12)], pink(), 200);
    band.rotation.x = PI / 2; lid.add(band);
    const lidIn = new THREE.Mesh(new THREE.CircleGeometry(LR, 120), new THREE.MeshStandardMaterial({ color: css('--tin-in'), roughness: 0.45, metalness: 0 }));
    lidIn.rotation.y = PI; lidIn.position.z = -0.02; lid.add(lidIn);
    // leaning in front of the tin's right side, its face turned up toward the viewer (the mockup)
    lid.position.set(1.05, 0.7, 0.9);                 // starts overlapping the tin's front-right; settleLid moves it out front
    lid.lookAt(new THREE.Vector3(1.05 - 0.3, 0.7 + 0.8, 0.9 + 0.62));
    lid.rotateZ(-0.16);
    drop.add(lid);
    settleLid(lid, body, LR, DEPTH);

    // a soft contact shadow on the table
    const sc = canvas(256, 256), sg = sc.getContext('2d'), sgr = sg.createRadialGradient(128, 128, 18, 128, 128, 128);
    sgr.addColorStop(0, 'rgba(70, 40, 50, 0.4)'); sgr.addColorStop(0.6, 'rgba(70, 40, 50, 0.15)'); sgr.addColorStop(1, 'rgba(70, 40, 50, 0)');
    sg.fillStyle = sgr; sg.fillRect(0, 0, 256, 256);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.8), new THREE.MeshBasicMaterial({ map: tex(sc), transparent: true, depthWrite: false }));
    shadow.rotation.x = -PI / 2; shadow.position.set(0.7, 0.004, 0.25); body.add(shadow);
    // seen from a little above, like the mockup
    body.rotation.set(0.3, -0.1, 0);
    root.visible = false;
    S.scene.add(root);
    return { root, drop, body, top, lid };
  }

  function place() {
    // well behind the tutor: at z -3 the tin's front rim reached the plane of the card in the tutor's hand and went
    // through it (user: "카드와 통이 겹쳐서 통이 관통되서 나와"); same place and size on screen
    const { p, k } = S.placeAt(1735, 985, -6);
    tin.root.position.copy(p);
    tin.root.scale.setScalar(2.5 * k);
  }
  function dropIn() {
    const t0 = performance.now();
    const fn = () => {
      if (!tin.root.visible) return;
      const u = min(1, (performance.now() - t0) / 700);
      const e = 1 + 2.2 * Math.pow(u - 1, 3) + 1.2 * Math.pow(u - 1, 2);
      tin.drop.position.y = 1.4 * (1 - e); tin.drop.scale.setScalar(0.85 + 0.15 * e);
      if (u < 1) requestAnimationFrame(fn);
    };
    fn();
  }

  let want = false;
  const Tin3D = {
    show(on) {
      want = on;
      if (tin) { tin.root.visible = on; if (on) dropIn(); return; }
      if (!on || building) return;
      // the relief needs the font and the logo pixels: build once both are in
      building = Promise.all([Card3D.logoReady, document.fonts ? document.fonts.load('800 60px "Baloo 2"') : null]).then(() => {
        tin = build(); place();
        if (want) { tin.root.visible = true; dropIn(); }
      });
    },
    get: () => tin,
  };
  window.Tin3D = Tin3D;
})();
