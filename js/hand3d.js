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
  const TIP = [0, 1.54, 0.02];

  // finger along +y; the palm sits right of it (x+), the thumb on the left; the cuff below
  function fHand(x, y, z) {
    let d = SDF.capsule(x, y, z, 0, 0.5, 0, 0, 1.37, 0.02, 0.17);                          // pointing finger
    // the back of the hand: a rounded block softened by an egg, so the side facing the screen bulges like a puffy glove
    d = SDF.smin(d, SDF.smin(SDF.roundBox(x, y, z, 0.25, 0.2, -0.02, 0.38, 0.34, 0.18, 0.17),
      SDF.ellipsoid(x, y, z, 0.25, 0.24, -0.06, 0.44, 0.4, 0.27), 0.12), 0.12);
    const curl = [[0.2, 0.5, 0.15], [0.42, 0.45, 0.13], [0.6, 0.33, 0.12]];                  // curled fingers' knuckles
    for (const [cx, cy, r] of curl) d = SDF.smin(d, SDF.capsule(x, y, z, cx, cy, 0.04, cx + 0.02, cy - 0.16, 0.2, r), 0.06);
    d = SDF.smin(d, SDF.capsule(x, y, z, -0.06, 0.06, 0.14, -0.2, 0.38, 0.24, 0.13), 0.08);   // thumb, tucked in front
    return d;
  }
  function fCuff(x, y, z) {
    return SDF.roundBox(x, y, z, 0.25, -0.17, -0.02, 0.45, 0.13, 0.27, 0.12);   // right under the palm
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
    const handGeo = SDFMesh(fHand, [-0.55, -0.25, -0.45, 1.0, 1.8, 0.5], 0.018);
    const cuffGeo = SDFMesh(fCuff, [-0.35, -0.5, -0.4, 0.85, 0.0, 0.35], 0.018);
    const cam = new THREE.PerspectiveCamera(20, BOX.w / BOX.h, 0.5, 50);
    cam.position.set(0, 0, 7.3); cam.lookAt(0, 0, 0);
    const out = [];
    for (const [p, col] of [[0, '--p1'], [1, '--p2']]) {
      const g = new THREE.Group();
      const cuffMat = new THREE.MeshStandardMaterial({ color: css(col), roughness: 0.4, metalness: 0 });
      g.add(new THREE.Mesh(handGeo, glove), new THREE.Mesh(cuffGeo, cuffMat));
      // turned a little so the finger and knuckles show their roundness; centred on the box
      const turn = new THREE.Group(); turn.rotation.set(0.12, -0.42, 0); turn.add(g);
      g.position.set(-0.14, -0.58, 0);
      // seen from the BACK of the hand (user: "손등이 나와야하는데 손바닥이 나오는걸?"): mirrored front to back, the curled
      // fingers go behind and the smooth back of the glove, with the knuckles along its top, faces the screen
      const flip = new THREE.Group(); flip.scale.set(p ? -1 : 1, 1, -1); flip.add(turn);
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
