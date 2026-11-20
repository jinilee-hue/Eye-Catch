/* Eye Catch — the winner's crown on the result card as a real 3D object (user: "결과화면에 왕관도 3d 형태로").
 * The result card sits above the main 3D scene, so the crown has its own small WebGL canvas, made the first time a
 * result shows. A puffy candy crown from SDFs (js/sdf.js, like the tutor): a round band, five rounded points with
 * pearls on their tips, gems on the band; lit like the tutor's scene; it turns slowly while it is shown.
 * Crown3D.show(parentEl) -> true when the 3D crown is up (false: no WebGL — the CSS crown stays), Crown3D.hide()
 */
(function () {
  'use strict';
  const { PI, sin, cos, atan2, sqrt, round } = Math;
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const N = 5, R = 1;                                  // points, band radius
  let three = null, cv = null, raf = 0, last = 0;

  // ── the shape ───────────────────────────────────────────────────────────────────────────────────────────
  // local frame of the nearest point / gem: u = along the band, w = out from the band
  function frame(x, z, a) { return [-x * sin(a) + z * cos(a), x * cos(a) + z * sin(a) - R]; }
  const spikeAt = i => i * 2 * PI / N + PI / 2;               // one point straight to the front
  const gemAt = i => spikeAt(i) + PI / N;                     // the gems sit between the points
  const nearest = (ang, at) => { const k = round((ang - at(0)) / (2 * PI / N)); return at(((k % N) + N) % N); };
  const GEM = { y: 0.2, r: 0.12, out: 0.075 }, PEARL = { y: 1.13, r: 0.11 };

  function fCrown(x, y, z) {
    const rho = sqrt(x * x + z * z), ang = atan2(z, x);
    let d = SDF.rrect(rho - R, y - 0.2, 0.085, 0.2, 0.08);                     // the band
    const [u, w] = frame(x, z, nearest(ang, spikeAt));
    // a point: a round cone flattened against the band (thin out from it, wide along it), leaning out a little
    const sp = SDF.roundCone(u, y, w * 2.3, 0, 0.24, 0, 0, 1.07, 0.1, 0.36, 0.06) / 2.3 * 1.6;
    d = SDF.smin(d, sp, 0.09);
    d = SDF.smin(d, SDF.sphere(u, y, w, 0, PEARL.y, 0.045, PEARL.r), 0.03);
    const [gu, gw] = frame(x, z, nearest(ang, gemAt));
    d = SDF.smin(d, SDF.ellipsoid(gu, y, gw, 0, GEM.y, GEM.out, GEM.r, GEM.r, GEM.r * 0.6), 0.02);
    return SDF.smax(d, 0.01 - y, 0.05);                  // a level foot: the points' round bases don't sag below the band
  }

  function build() {
    const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, premultipliedAlpha: true });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    scene.environment = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    scene.add(new THREE.HemisphereLight('#fff7f0', '#b8a0a8', 0.8));
    const key = new THREE.DirectionalLight('#fff3e6', 2.2); key.position.set(-4, 6, 7); scene.add(key);
    const rim = new THREE.DirectionalLight('#ffffff', 1.0); rim.position.set(3, 4, -6); scene.add(rim);

    const gold = new THREE.Color(css('--crown-gold')), deep = new THREE.Color(css('--crown-gold-deep'));
    const pearl = new THREE.Color(css('--crown-pearl'));
    const gems = ['--crown-gem-1', '--crown-gem-2', '--crown-gem-3', '--crown-gem-1', '--crown-gem-2'].map(t => new THREE.Color(css(t)));
    const geo = SDFMesh(fCrown, [-1.45, -0.12, -1.45, 1.45, 1.32, 1.45], 0.024, {
      color(x, y, z, out) {
        const ang = atan2(z, x);
        const [u, w] = frame(x, z, nearest(ang, spikeAt));
        const gi = ((round((ang - gemAt(0)) / (2 * PI / N)) % N) + N) % N;
        const [gu, gw] = frame(x, z, gemAt(gi));
        const sm = (d) => Math.max(0, Math.min(1, (0.022 - d) / 0.03));   // a soft colour edge, no jagged rim
        const c = gold.clone().lerp(deep, Math.max(0, Math.min(1, (0.25 - y) / 0.4)) * 0.6);   // a warmer foot
        c.lerp(gems[gi], sm(SDF.ellipsoid(gu, y, gw, 0, GEM.y, GEM.out, GEM.r, GEM.r, GEM.r * 0.6)));
        c.lerp(pearl, sm(SDF.sphere(u, y, w, 0, PEARL.y, 0.045, PEARL.r)));
        out[0] = c.r; out[1] = c.g; out[2] = c.b;
      },
    });
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.2 });
    const crown = new THREE.Mesh(geo, mat);
    const tilt = new THREE.Group(); tilt.rotation.x = 0.13; tilt.add(crown); scene.add(tilt);
    const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    cam.position.set(0, 0.45, 5.6); cam.lookAt(0, 0.55, 0);
    return { r, scene, cam, crown };
  }

  function frameLoop(now) {
    raf = requestAnimationFrame(frameLoop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    three.crown.rotation.y += dt * 0.7;
    three.r.render(three.scene, three.cam);
  }

  function show(parent) {
    try {
      if (!cv) { cv = document.createElement('canvas'); cv.className = 'crown3d'; cv.setAttribute('aria-hidden', 'true'); }
      parent.appendChild(cv);
      if (!three) three = build();
      // layout size (stage px, untouched by the card's pop-in transform) x the stage's scale x the screen's density
      const k = parseFloat(getComputedStyle(document.getElementById('stage')).getPropertyValue('--k')) || 1;
      const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.offsetWidth, h = cv.offsetHeight;
      three.r.setPixelRatio(1);
      three.r.setSize(Math.max(1, round(w * k * dpr)), Math.max(1, round(h * k * dpr)), false);
      three.cam.aspect = w / Math.max(1, h); three.cam.updateProjectionMatrix();
      three.crown.rotation.y = -0.5;
      cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(frameLoop);
      return true;
    } catch (e) {
      console.warn('crown3d', e); if (cv) cv.remove(); return false;
    }
  }
  function hide() { cancelAnimationFrame(raf); raf = 0; if (cv) cv.remove(); }

  window.Crown3D = { show, hide };
})();
