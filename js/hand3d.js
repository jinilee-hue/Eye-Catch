/* Eye Catch — the tapping hand on the player buttons in 3D (user: "손가락이 볼륨이 있어야해. 3d 손가락으로").
 * A puffy white glove from SDFs (js/sdf.js, like the tutor and the crown): the pointing finger, three curled
 * fingers, the thumb, a cuff in the player's colour. The buttons sit above the main 3D scene, so each hand is
 * rendered ONCE into an image on a throwaway WebGL canvas, and the <img> then taps with CSS (style.css .buzzer .hand).
 * Player 2's hand is the mirror image, lit from the same side. Each .hand gets the fingertip as --tx / --ty (px of
 * its box): the CSS turns and taps it round that point, on the button.
 */
(function () {
  'use strict';
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const BOX = { w: 270, h: 316 }, PX = 2.2;           // the .hand box (stage px) and render scale
  const TIP = [0, 1.22, 0.02];

  // a cartoon glove (user: "만화 장갑"), one puffy white lump seen from the BACK of the hand (+z faces the screen):
  // a chunky short pointing finger along +y, the fist right of it (x+) with round knuckle lumps, a fat thumb out to
  // the left, a plain smooth back (no stitched lines — user: "가운데 3개 선도 필요없어"), a rolled cuff in the player's colour
  function fHand(x, y, z) {
    let d = SDF.capsule(x, y, z, 0, 0.42, 0, 0, 1.02, 0.02, 0.2);                           // pointing finger
    const back = SDF.smin(SDF.roundBox(x, y, z, 0.24, 0.15, 0, 0.42, 0.36, 0.21, 0.2),
      SDF.ellipsoid(x, y, z, 0.24, 0.18, 0.02, 0.5, 0.44, 0.29), 0.14);                     // the puffy back of the hand
    d = SDF.smin(d, back, 0.18);
    // knuckle lumps along the top only; the outer side stays smooth (user: "손 우측에 두개 볼록거리는건 삭제")
    const lumps = [[0.3, 0.52, 0.06, 0.18], [0.54, 0.45, 0.05, 0.17]];
    for (const [cx, cy, cz, r] of lumps) d = SDF.smin(d, SDF.sphere(x, y, z, cx, cy, cz, r), 0.04);
    d = SDF.smin(d, SDF.capsule(x, y, z, -0.1, 0.02, 0.08, -0.36, 0.32, 0.14, 0.16), 0.13);   // the thumb
    return d;
  }
  function fCuff(x, y, z) {
    return SDF.roundBox(x, y, z, 0.24, -0.33, 0, 0.5, 0.13, 0.32, 0.13);                    // a rolled band at the wrist
  }

  function render() {
    const cv = document.createElement('canvas');
    cv.width = Math.round(BOX.w * PX); cv.height = Math.round(BOX.h * PX);
    const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    scene.environment = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.4;
    scene.add(new THREE.HemisphereLight('#ffffff', '#c9b6d6', 0.95));
    const key = new THREE.DirectionalLight('#fff6ee', 2.0); key.position.set(-4, 6, 8); scene.add(key);
    const rim = new THREE.DirectionalLight('#ffffff', 0.8); rim.position.set(4, 3, -6); scene.add(rim);

    const glove = new THREE.MeshStandardMaterial({ color: css('--card-face'), roughness: 0.5, metalness: 0 });
    const handGeo = SDFMesh(fHand, [-0.62, -0.3, -0.45, 1.0, 1.45, 0.55], 0.016);
    const cuffGeo = SDFMesh(fCuff, [-0.4, -0.6, -0.5, 0.9, -0.05, 0.5], 0.018);
    const cam = new THREE.PerspectiveCamera(20, BOX.w / BOX.h, 0.5, 50);
    cam.position.set(0, 0, 6.6); cam.lookAt(0, 0, 0);
    const out = [];
    for (const [p, col] of [[0, '--p1'], [1, '--p2']]) {
      const g = new THREE.Group();
      const cuffMat = new THREE.MeshStandardMaterial({ color: css(col), roughness: 0.4, metalness: 0 });
      g.add(new THREE.Mesh(handGeo, glove), new THREE.Mesh(cuffGeo, cuffMat));
      // turned a little so the finger and knuckles show their roundness; centred on the box
      const turn = new THREE.Group(); turn.rotation.set(0.12, -0.3, 0); turn.add(g);
      g.position.set(-0.17, -0.36, 0);
      // the back of the hand faces the screen (user: "손등이 나와야하는데"); player 2's is the mirror image
      const flip = new THREE.Group(); flip.scale.x = p ? -1 : 1; flip.add(turn);
      scene.add(flip);
      r.render(scene, cam);
      const tip = new THREE.Vector3(...TIP); g.localToWorld(tip); tip.project(cam);
      out.push({ src: cv.toDataURL('image/png'), tx: (tip.x + 1) / 2 * BOX.w, ty: (1 - tip.y) / 2 * BOX.h });
      scene.remove(flip); cuffMat.dispose();
    }
    handGeo.dispose(); cuffGeo.dispose(); glove.dispose(); pm.dispose(); r.dispose(); r.forceContextLoss();
    return out;
  }

  function init() {
    try {
      const hands = render();
      document.querySelectorAll('.buzzer .hand').forEach((img, i) => {
        const h = hands[i % 2];
        img.src = h.src;
        img.style.setProperty('--tx', h.tx.toFixed(1) + 'px'); img.style.setProperty('--ty', h.ty.toFixed(1) + 'px');
      });
    } catch (e) { console.warn('hand3d', e); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0));
  else setTimeout(init, 0);
})();
