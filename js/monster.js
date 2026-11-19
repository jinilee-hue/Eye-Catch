/* Eye Catch — the tutor: a one-eyed monster built in 3D from the user's model sheet (design/model_sheet.png:
 * egg body, one big eye, two curved horns, sausage arms with mitten hands, two stubby legs), coloured like the
 * mockups (pastel lilac clay, butter-yellow horns). Smooth "clay" meshes from SDFs (js/sdf.js, Croco's mesher).
 *
 * World units: 1 = 100 stage px, origin at the stage centre (stage = 2400 x 1792), y up. One transparent canvas
 * covers the stage; pointer events go through it.
 *
 * Monster API (EC3D.monster): place(sx, sy, px), lookAt(sx, sy) / lookAt(null), talk(level 0..1), pose(name, side),
 * hop(n), cheer(), oops(), wave(side), blink(), handScreen(side) -> stage px of a mitten.
 */
(function () {
  'use strict';
  const { sin, cos, max, min, abs, PI } = Math;
  const clamp = (v, a, b) => max(a, min(b, v));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const SW = 2400, SH = 1792;

  const COL = {
    skin: '#d0addb', horn: '#ecd682', mouth: '#4a1d3d', tongue: '#ec7f80', fang: '#fbf5ea',
  };

  // ── model (units: body ~2 wide; feet at y = 0) ─────────────────────────────────────────────────────────
  const BODY = { y: 1.2, rx: 1.0, ry: 1.1, rz: 0.93 };
  const EYE = { y: 1.47, z: 0.6, r: 0.5 };
  const MOUTH = { top: 0.84, z: 0.86, rx: 0.4, ry: 0.3, rz: 0.34 };
  const OPEN = [0.28, 0.62, 1.0];                    // visemes: closed-ish smile, half, wide (rest = wide, like the mockup)

  function fEgg(x, y, z) {
    // a touch wider low down (the mockups' body is an egg sitting on its legs)
    const rx = BODY.rx * (1 + 0.05 * clamp((BODY.y - y) / BODY.ry, -1, 1));
    return SDF.ellipsoid(x, y, z, 0, BODY.y, 0, rx, BODY.ry, BODY.rz * (rx / BODY.rx));
  }
  function fMouth(x, y, z, open) {
    const ry = MOUTH.ry * open;
    const e = SDF.ellipsoid(x, y, z, 0, MOUTH.top, MOUTH.z, MOUTH.rx * (0.82 + 0.18 * open), ry, MOUTH.rz);
    return SDF.smax(e, y - MOUTH.top - 0.005, 0.05);  // flat top lip, round bottom (a "D" on its back)
  }
  function fRim(x, y, z) {                           // the soft skin lid round the eye
    const dx = x, dy = y - EYE.y, dz = z - (EYE.z + 0.05);
    const q = Math.hypot(dx, dy) - EYE.r * 1.0;
    return Math.hypot(q, dz) - 0.085;
  }
  function fBody(open) {
    return (x, y, z) => {
      let d = SDF.smin(fEgg(x, y, z), fRim(x, y, z), 0.16);
      d = SDF.smax(d, -fMouth(x, y, z, open), 0.07);
      return d;
    };
  }
  function fHorn(s) {
    // a bent cone: out from the shoulder of the head, then up (front view), tipped slightly back
    const P = [[0.5, 1.95, 0.06, 0.18], [0.69, 2.12, 0.05, 0.135], [0.78, 2.3, 0.04, 0.085], [0.75, 2.47, 0.03, 0.028]];
    return (x, y, z) => {
      let d = 1e9;
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], b = P[i + 1];
        d = SDF.smin(d, SDF.roundCone(x, y, z, s * a[0], a[1], a[2], s * b[0], b[1], b[2], a[3], b[3]), 0.05);
      }
      return d;
    };
  }
  // arm along +x from the shoulder pivot; the mitten hand at the end, thumb up-front
  function fArm(x, y, z) {
    const arm = SDF.roundCone(x, y, z, 0, 0, 0, 0.48, 0, 0, 0.2, 0.17);
    const palm = SDF.ellipsoid(x, y, z, 0.62, 0.0, 0.0, 0.2, 0.19, 0.16);
    const thumb = SDF.capsule(x, y, z, 0.55, 0.07, 0.07, 0.58, 0.19, 0.09, 0.075);
    return SDF.smin(SDF.smin(arm, palm, 0.08), thumb, 0.05);
  }
  // the mitten closed round a card's edge (user: "손에 꼭 쥐고 있는 모양으로"), seen from the front like a real pinch:
  // the fist sits BEHIND the card (the card covers its top), only the thumb lies on the card's face, reaching in from
  // the edge toward the middle. GRIP = the point on the card plane where the edge goes in (arm-local).
  const GRIP = { x: 0.66, y: 0.04, z: 0 };
  function fArmGrip(x, y, z) {
    const arm = SDF.roundCone(x, y, z, 0, 0, 0, 0.48, 0, 0, 0.2, 0.17);
    const fist = SDF.ellipsoid(x, y, z, 0.64, -0.03, -0.19, 0.21, 0.21, 0.15);          // behind the card (card plane z = 0)
    const thumb = SDF.roundCone(x, y, z, 0.55, -0.06, -0.03, 0.76, 0.1, 0.075, 0.09, 0.072);  // from the fist round the edge onto the face
    return SDF.smin(SDF.smin(arm, fist, 0.08), thumb, 0.06);
  }
  function fLeg(x, y, z) {
    const l = SDF.roundCone(x, y, z, 0, 0.5, 0, 0.0, 0.16, 0.03, 0.25, 0.26);
    return SDF.smax(l, -y, 0.06);                   // flat sole
  }

  function eyeMaterial() {   // Croco / Phonics Match tutor eye: warm-white ball, brown iris painted round +z, screen-space catch-lights
    return new THREE.ShaderMaterial({
      uniforms: { uLight: { value: new THREE.Vector3(-0.35, 0.6, 0.72).normalize() }, uIris: { value: 33 * PI / 180 }, uPupil: { value: 17 * PI / 180 } },
      vertexShader: `
        varying vec3 vO; varying vec3 vN; varying vec3 vG;
        void main() {
          vO = position;
          vN = normalize(normalMatrix * normal);
          vG = normalize((modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uLight; uniform float uIris, uPupil;
        varying vec3 vO; varying vec3 vN; varying vec3 vG;
        void main() {
          vec3 o = normalize(vO), N = normalize(vN), G = normalize(vG);
          float l = clamp(dot(N, uLight) * 0.5 + 0.5, 0.0, 1.0);
          vec3 col = mix(vec3(0.84, 0.82, 0.79), vec3(1.0, 0.99, 0.965), smoothstep(0.25, 0.85, l));
          float a = acos(clamp(o.z, -1.0, 1.0));
          float ir = 1.0 - smoothstep(uIris - 0.025, uIris + 0.006, a);
          vec2 ip = o.xy / sin(uIris);
          vec3 irc = mix(vec3(0.27, 0.16, 0.09), vec3(0.15, 0.085, 0.045), smoothstep(-0.95, 0.5, ip.y));
          irc = mix(irc, vec3(0.08, 0.045, 0.025), smoothstep(0.55, 1.0, length(ip)) * 0.7);
          float pa = acos(clamp(dot(o, vec3(0.0, 0.0, 1.0)), -1.0, 1.0));
          irc = mix(irc, vec3(0.05, 0.03, 0.02), (1.0 - smoothstep(uPupil - 0.06, uPupil + 0.03, pa)) * 0.85);
          col = mix(col, irc, ir);
          vec2 h1 = G.xy + vec2(-0.17, 0.19);
          col = mix(col, vec3(1.0), (1.0 - smoothstep(0.1, 0.118, length(N.xy - h1))) * step(0.0, N.z) * ir);
          vec2 h2 = G.xy + vec2(0.15, -0.14);
          col = mix(col, vec3(0.95, 0.9, 0.86), (1.0 - smoothstep(0.022, 0.04, length(N.xy - h2))) * 0.7 * ir);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
  }

  function blobTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, 'rgba(70,40,60,0.42)'); gr.addColorStop(0.55, 'rgba(70,40,60,0.16)'); gr.addColorStop(1, 'rgba(70,40,60,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  function buildMonster() {
    const t0 = performance.now();
    const mat = (hex, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: hex, roughness: 0.78, metalness: 0, envMapIntensity: 0.55 }, o));
    const M = {
      skin: mat('#ffffff', { vertexColors: true }),
      skinPlain: mat(COL.skin),
      horn: mat(COL.horn, { roughness: 0.7 }),
      tongue: mat(COL.tongue, { roughness: 0.6 }),
      fang: mat(COL.fang, { roughness: 0.55 }),
      eye: eyeMaterial(),
    };
    const skin = new THREE.Color(COL.skin), dark = new THREE.Color(COL.mouth);
    const H = 0.034;
    const root = new THREE.Group();            // placed on the stage
    const face = new THREE.Group();            // turns toward the camera (frontal wherever it stands)
    root.add(face);
    const hop = new THREE.Group();             // bounces
    face.add(hop);
    const squash = new THREE.Group();          // squash/stretch about the feet
    hop.add(squash);
    const body = new THREE.Group();            // turns / leans / breathes
    squash.add(body);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 1.3), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }));
    shadow.rotation.x = -PI / 2; shadow.position.y = 0.01;
    face.add(shadow);

    // body variants, one per mouth opening (talking swaps them)
    const bodies = OPEN.map((o, i) => {
      const f = fBody(o);
      const g = SDFMesh(f, [-1.12, 0.06, -1.05, 1.12, 2.36, 1.12], H, {
        color(x, y, z, out) {
          const m = fMouth(x, y, z, o);
          const k = 1 - smooth(-0.005, 0.05, m);         // inside the mouth
          const deep = smooth(0.0, 0.22, MOUTH.z + 0.08 - z);
          const c = skin.clone().lerp(dark, k * (0.85 + 0.15 * deep));
          // a soft shade low down on the body (the mockups' warm under-light) — kept subtle
          const sh = 1 - 0.06 * smooth(0.9, 0.2, y);
          out[0] = c.r * sh; out[1] = c.g * sh; out[2] = c.b * sh;
        },
      });
      const m = new THREE.Mesh(g, M.skin);
      m.visible = i === OPEN.length - 1;
      body.add(m);
      return m;
    });
    // tongue + fangs (scaled with the opening)
    const mouthKit = new THREE.Group();
    body.add(mouthKit);
    const tongue = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), M.tongue);
    tongue.scale.set(0.27, 0.1, 0.18);
    mouthKit.add(tongue);
    const fangGeo = new THREE.ConeGeometry(0.06, 0.12, 24, 1);
    const fangs = [-1, 1].map(s => {
      const f = new THREE.Mesh(fangGeo, M.fang);
      f.rotation.x = PI;                             // point down
      f.position.set(s * 0.19, MOUTH.top - 0.05, MOUTH.z + 0.0);
      body.add(f);
      return f;
    });
    // eye: ball (turns to look) + skin lid for blinks
    const eyeG = new THREE.Group(); eyeG.position.set(0, EYE.y, EYE.z); body.add(eyeG);
    const look = new THREE.Group(); eyeG.add(look);
    look.add(new THREE.Mesh(new THREE.SphereGeometry(EYE.r, 64, 48), M.eye));
    const lidPivot = new THREE.Group(); eyeG.add(lidPivot);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(EYE.r * 1.035, 64, 32, 0, PI * 2, 0, PI * 0.5), M.skinPlain);
    lidPivot.add(lid);
    // horns
    const hornGeo = [-1, 1].map(s => SDFMesh(fHorn(s), s < 0 ? [-0.95, 1.7, -0.35, -0.2, 2.8, 0.3] : [0.2, 1.7, -0.35, 0.95, 2.8, 0.3], H * 0.6));
    hornGeo.forEach(g => body.add(new THREE.Mesh(g, M.horn)));
    // arms (pivot at the shoulder, the arm points along +x in the pivot's frame; the left one is mirrored)
    const armGeo = SDFMesh(fArm, [-0.26, -0.3, -0.26, 0.88, 0.34, 0.28], H * 0.55);
    const gripGeo = SDFMesh(fArmGrip, [-0.26, -0.32, -0.26, 0.92, 0.36, 0.3], H * 0.5);
    const arms = [-1, 1].map(s => {
      const p = new THREE.Group();
      p.position.set(s * 0.82, 1.0, 0.04);
      const inner = new THREE.Group(); p.add(inner);
      const m = new THREE.Mesh(armGeo, M.skinPlain);
      const g = new THREE.Mesh(gripGeo, M.skinPlain);
      if (s < 0) { m.scale.x = -1; g.scale.x = -1; }
      g.visible = false;
      inner.add(m, g);
      body.add(p);
      return { p, inner, s, m, g };
    });
    // legs (hips under the body; they stay on the ground through squash)
    const legGeo = SDFMesh(fLeg, [-0.32, -0.02, -0.32, 0.32, 0.8, 0.34], H * 0.6);
    const legs = [-1, 1].map(s => {
      const g = new THREE.Group(); g.position.set(s * 0.4, 0, 0.02);
      g.add(new THREE.Mesh(legGeo, M.skinPlain));
      squash.add(g);
      return g;
    });
    console.info(`monster built in ${Math.round(performance.now() - t0)} ms`);
    return { root, face, hop, squash, body, bodies, mouthKit, tongue, fangs, look, lidPivot, lid, arms, legs, shadow };
  }

  // ── stage (renderer, camera, light) ────────────────────────────────────────────────────────────────────
  const S = { ready: false, t: 0, frozen: false };
  S.init = function (canvas) {
    S.canvas = canvas;
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.setClearColor(0x000000, 0);
    S.renderer = r;
    const scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    scene.environment = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.3;
    scene.add(new THREE.HemisphereLight('#fff7f0', '#b8a0a8', 0.75));
    const key = new THREE.DirectionalLight('#fff3e6', 2.1); key.position.set(-5, 7, 8); scene.add(key);
    const fill = new THREE.DirectionalLight('#f0e6ff', 0.45); fill.position.set(6, 1, 6); scene.add(fill);
    const rim = new THREE.DirectionalLight('#ffffff', 0.9); rim.position.set(2, 5, -7); scene.add(rim);
    S.scene = scene;
    const fov = 20;
    S.camera = new THREE.PerspectiveCamera(fov, SW / SH, 1, 200);
    S.camera.position.set(0, 0, (SH / 200) / Math.tan(fov * PI / 360));
    S.camera.lookAt(0, 0, 0);
    S.monster = new Monster(buildMonster());
    scene.add(S.monster.m.root);
    S.ready = true;
    S.resize();
    let last = performance.now();
    const loop = (now) => {
      requestAnimationFrame(loop);
      if (S.frozen) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      S.step(dt);
    };
    requestAnimationFrame(loop);
    return S;
  };
  S.ticks = [];                       // other 3D things (js/card3d.js) update here, before the render
  S.step = function (dt) {
    S.t += dt;
    S.monster.update(dt, S.t);
    for (const fn of S.ticks.slice()) fn(dt, S.t);
    S.renderer.render(S.scene, S.camera);
  };
  /** size the canvas backing store to what the stage shows on screen */
  // The canvas covers the whole WINDOW, not just the 4:3 stage: (ex, ey) = stage px of window beyond the stage on each
  // side. The camera keeps its place and widens its view, so stage px still map to the same world points — things past
  // the stage edge (the tin's lid on a 16:9 screen) are drawn instead of clipped.
  S.ex = 0; S.ey = 0;
  S.resize = function (scale, ex = S.ex, ey = S.ey) {
    if (!S.ready) return;
    const k = scale || S.scale || 1;
    S.scale = k; S.ex = ex; S.ey = ey;
    const cw = SW + 2 * ex, ch = SH + 2 * ey;
    Object.assign(S.canvas.style, { left: -ex + 'px', top: -ey + 'px', width: cw + 'px', height: ch + 'px' });
    const cam = S.camera, dist = cam.position.z;
    cam.fov = 2 * Math.atan((ch / 200) / dist) * 180 / PI;
    cam.aspect = cw / ch;
    cam.updateProjectionMatrix();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    S.renderer.setPixelRatio(1);
    S.renderer.setSize(Math.round(cw * k * dpr), Math.round(ch * k * dpr), false);
  };
  const toWorld = (sx, sy) => new THREE.Vector3(sx / 100 - SW / 200, SH / 200 - sy / 100, 0);
  S.toWorld = toWorld;
  /** the world point on the plane z that the camera sees at stage (sx, sy); k = world units per stage px there / 0.01 */
  S.placeAt = function (sx, sy, z = 0) {
    const cz = S.camera.position.z, f = (cz - z) / cz;
    return { p: new THREE.Vector3((sx / 100 - SW / 200) * f, (SH / 200 - sy / 100) * f, z), k: f };
  };
  /** world point -> stage px */
  S.project = function (v) {
    const p = v.clone().project(S.camera);
    return { x: (p.x + 1) / 2 * (SW + 2 * S.ex) - S.ex, y: (1 - p.y) / 2 * (SH + 2 * S.ey) - S.ey };
  };

  // ── behaviour ──────────────────────────────────────────────────────────────────────────────────────────
  function Monster(m) {
    this.m = m;
    this.scale = 2.6;
    this.lookTarget = null;          // world point or null (idle glances)
    this.gaze = { x: 0, y: 0 };      // current eye yaw/pitch
    this.turn = 0;                   // body yaw (smoothed)
    this.level = 0; this.vis = OPEN.length - 1; this.visHold = 0;
    this.blinkT = 3 + Math.random() * 3; this.blinkK = 0;
    this.hopQ = []; this.hopT = 0; this.hopH = 0; this.land = 0; this.squashV = 0; this.squashK = 0;
    this.poseName = 'idle'; this.poseSide = 1; this.poseT = 0;
    this.arm = [{ a: -0.55, b: 0, sw: 0 }, { a: -0.55, b: 0, sw: 0 }];  // current arm angles (z raise, y forward)
    this.shake = 0;
    this.idleLook = { x: 0, y: 0, t: 1.5 };
    this.lean = 0;
  }
  const P = Monster.prototype;
  P.place = function (sx, sy, px) {    // feet at stage (sx, sy); px = body width in stage px
    const w = toWorld(sx, sy);
    this.m.root.position.copy(w);
    this.scale = px / 200;            // body is 2 units wide
    this.m.root.scale.setScalar(this.scale);
    // face the camera from wherever it stands
    const cam = S.camera.position;
    const dx = cam.x - w.x, dy = cam.y - (w.y + 1.2 * this.scale), dz = cam.z - w.z;
    this.m.face.rotation.set(-Math.atan2(dy, Math.hypot(dx, dz)) * 0.9, Math.atan2(dx, dz) * 0.9, 0, 'YXZ');
  };
  P.setShadow = function (on) { this.m.shadow.visible = on; };
  P.lookAt = function (sx, sy) { this.lookTarget = sx == null ? null : toWorld(sx, sy); };
  P.talk = function (level) { this.level = level; };
  P.blink = function () { this.blinkT = 0; };
  P.hop = function (n = 1, h = 0.35) { for (let i = 0; i < n; i++) this.hopQ.push(h); };
  P.pose = function (name, side = 1) { this.poseName = name; this.poseSide = side; this.poseT = 0; };
  P.cheer = function () { this.pose('cheer'); this.hop(2, 0.42); };
  P.oops = function () { this.pose('oops'); this.shake = 1; };
  P.wave = function (side = 1) { this.pose('wave', side); };
  /** stage px of a mitten (side -1 = the monster's right hand, on screen left) */
  /** world position of a mitten (side -1 = on screen left) */
  P.handWorld = function (side) {
    const a = this.m.arms[side < 0 ? 0 : 1];
    a.m.updateWorldMatrix(true, false);
    return a.inner.localToWorld(new THREE.Vector3(side < 0 ? -0.64 : 0.64, 0, 0.05));
  };
  /** closed mittens that hold cards (title) / open ones (game) */
  P.setGrip = function (on) { this.grip = on; this.m.arms.forEach(a => { a.g.visible = on; a.m.visible = !on; }); };
  /** world position of the fist's grip point (where a held card's edge goes in) */
  P.gripWorld = function (side) {
    const a = this.m.arms[side < 0 ? 0 : 1];
    a.g.updateWorldMatrix(true, false);
    return a.inner.localToWorld(new THREE.Vector3(side < 0 ? -GRIP.x : GRIP.x, GRIP.y, GRIP.z));
  };
  P.handScreen = function (side) {
    const a = this.m.arms[side < 0 ? 0 : 1];
    const v = new THREE.Vector3(side < 0 ? -0.64 : 0.64, 0, 0.05);
    a.m.updateWorldMatrix(true, false);
    return S.project(a.inner.localToWorld(v));
  };

  P.update = function (dt, t) {
    const m = this.m;
    this.poseT += dt;
    // breathing
    const br = sin(t * 2.3);
    m.body.scale.set(1 - 0.008 * br, 1 + 0.014 * br, 1 - 0.008 * br);
    // hop
    if (this.hopT <= 0 && this.hopQ.length) { this.hopH = this.hopQ.shift(); this.hopT = 0.0001; this.squashV = -0.12; }
    if (this.hopT > 0) {
      const dur = 0.42, u = this.hopT / dur;
      m.hop.position.y = this.hopH * 4 * u * (1 - u);
      this.hopT += dt;
      if (u >= 1) { this.hopT = 0; m.hop.position.y = 0; this.squashV = 0.2; }
    }
    // squash spring (y scale about the feet)
    const acc = -60 * this.squashK - 9 * (this.squashV);
    this.squashV += acc * dt; this.squashK += this.squashV * dt * 4;
    this.squashK = clamp(this.squashK, -0.18, 0.18);
    m.squash.scale.set(1 + this.squashK * 0.6, 1 - this.squashK, 1 + this.squashK * 0.6);
    // gaze: target, or idle glances
    let gx = 0, gy = 0;
    if (this.lookTarget) {
      const eye = new THREE.Vector3(0, EYE.y, EYE.z); m.body.localToWorld(eye);
      const d = this.lookTarget.clone().sub(eye);
      // in the face frame (the face group already looks at the camera)
      const inv = new THREE.Quaternion(); m.face.getWorldQuaternion(inv); inv.invert();
      d.applyQuaternion(inv); d.z = Math.max(d.z, 0) + 6;
      gx = Math.atan2(d.x, d.z); gy = Math.atan2(d.y, Math.hypot(d.x, d.z));
    } else {
      this.idleLook.t -= dt;
      if (this.idleLook.t <= 0) {
        this.idleLook.t = 1.4 + Math.random() * 2.6;
        const r = Math.random();
        this.idleLook.x = r < 0.45 ? 0 : (Math.random() - 0.5) * 0.7;
        this.idleLook.y = r < 0.45 ? 0 : (Math.random() - 0.4) * 0.35;
      }
      gx = this.idleLook.x; gy = this.idleLook.y;
    }
    const k = 1 - Math.exp(-dt * 9);
    this.gaze.x = lerp(this.gaze.x, clamp(gx, -0.75, 0.75), k);
    this.gaze.y = lerp(this.gaze.y, clamp(gy, -0.5, 0.5), k);
    m.look.rotation.set(-this.gaze.y * 0.75, this.gaze.x * 0.75, 0, 'YXZ');
    // the body turns a little with the gaze (more when pointing)
    let turnTo = this.gaze.x * 0.45;
    if (this.poseName === 'point') turnTo = this.poseSide * 0.38;
    this.turn = lerp(this.turn, turnTo, 1 - Math.exp(-dt * 5));
    this.shake = Math.max(0, this.shake - dt * 1.4);
    const shakeA = this.shake > 0 ? sin(this.shake * 30) * 0.16 * this.shake : 0;
    m.body.rotation.set(-0.03 + this.lean * 0.1, this.turn + shakeA, sin(t * 1.1) * 0.025 + shakeA * 0.3, 'YXZ');
    // blink
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blinkK += dt / 0.055;
      if (this.blinkK >= 2) { this.blinkK = 0; this.blinkT = 2.2 + Math.random() * 3.2; if (Math.random() < 0.2) this.blinkT = 0.18; }
    }
    const shut = this.blinkK > 0 ? (this.blinkK < 1 ? this.blinkK : 2 - this.blinkK) : 0;
    const lidA = shut;
    // the lid cap rests rolled up behind the brow (hidden inside the head) and rolls down over the ball
    m.lidPivot.rotation.x = lerp(-1.65, 1.52, lidA);   // facing back-down (inside the head) -> facing front (shut)
    m.lid.visible = lidA > 0.02;
    // mouth: visemes from the voice level (rest = wide open, like the mockup)
    this.visHold -= dt;
    let want = OPEN.length - 1;
    if (this.level > 0.02) want = this.level < 0.18 ? 0 : this.level < 0.45 ? 1 : 2;
    if (this.poseName === 'oops' && this.poseT < 1.4) want = 0;
    if (want !== this.vis && this.visHold <= 0) { this.vis = want; this.visHold = 0.06; }
    m.bodies.forEach((b, i) => { b.visible = i === this.vis; });
    const o = OPEN[this.vis];
    m.tongue.position.set(0, MOUTH.top - MOUTH.ry * o * 0.78, MOUTH.z - 0.12);
    m.tongue.scale.set(0.27 * (0.75 + 0.25 * o), 0.1 * (0.55 + 0.45 * o), 0.18);
    m.fangs.forEach(f => { f.scale.setScalar(0.7 + 0.3 * o); });
    // arms
    this.updateArms(dt, t);
  };

  P.updateArms = function (dt, t) {
    const pt = this.poseT, s = this.poseSide;
    // target (raise a: radians up from straight down-out; fwd b) per arm [right(-1), left(+1)]
    let A = [-0.62, -0.62], B = [0.1, 0.1], swing = 0.06;
    switch (this.poseName) {
      case 'hold':  A = [0.42, 0.42]; B = [0.25, 0.25]; swing = 0.015; break;           // title: holding two cards out
      case 'cheer': A = [1.05 + 0.12 * sin(pt * 14), 1.05 + 0.12 * sin(pt * 14 + 1)]; B = [0.1, 0.1]; swing = 0; if (pt > 2.2) this.pose('idle'); break;
      case 'up':    A = [0.95, 0.95]; B = [0.15, 0.15]; swing = 0.03; break;              // game: hands up like the mockup
      case 'wave': {
        const i = s < 0 ? 0 : 1;
        A[i] = 1.25 + 0.28 * sin(pt * 11); B[i] = 0.25; swing = 0.03;
        if (pt > 2.0) this.pose(this.rest || 'idle');
        break;
      }
      case 'point': {
        const i = s < 0 ? 0 : 1;
        A[i] = 0.12 + 0.05 * sin(pt * 6); B[i] = 0.45; swing = 0.02;
        break;
      }
      case 'oops':  A = [-0.2, -0.2]; B = [0.9, 0.9]; swing = 0; if (pt > 1.5) this.pose(this.rest || 'idle'); break;
      case 'think': A = [-0.7, 0.55]; B = [0.1, 1.1]; swing = 0.01; break;
      default: break;
    }
    const k = 1 - Math.exp(-dt * 10);
    this.m.arms.forEach((a, i) => {
      const st = this.arm[i];
      st.a = lerp(st.a, A[i] + swing * sin(t * 2.3 + i * 1.7), k);
      st.b = lerp(st.b, B[i], k);
      // pivot frame: arm along ±x; raise = rotate about z (positive = up for the left arm, mirrored for the right)
      a.p.rotation.set(0, -a.s * st.b, a.s * st.a, 'YXZ');
    });
  };

  window.EC3D = S;
})();
