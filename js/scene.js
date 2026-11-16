// Roast Royale: renderer, camera, lighting, procedural textures and the dohyō arena.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RING_R, PLATFORM, PLATFORM_H, rand } from './config.js';

// =====================================================================================
// Renderer, scene, camera
// =====================================================================================
export const canvas = document.getElementById('game');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.Fog(0x000000, 14, 30);
// A soft studio reflection so roast skin glistens without washing out the warm spotlight.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

export const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 120);
camera.position.set(0, 8, 12);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// Lighting: one warm arena spotlight from the roof (the key light, with shadows), a dim warm/cool
// hemisphere for the soft fill, and a low rim light so silhouettes read against the dark hall.
scene.add(new THREE.HemisphereLight(0xffe2b8, 0x2a1a10, 0.1));
// Straight down from the roof onto the ring, with a tight cone and a short soft edge, so the light
// pools on the dohyō and the hall beyond stays dark.
const spot = new THREE.SpotLight(0xffd29a, 340, 0, 0.36, 0.22, 2);
spot.position.set(0.4, 15, 0.6);
spot.target.position.set(0, PLATFORM_H, 0);
spot.castShadow = true;
spot.shadow.mapSize.set(2048, 2048);
spot.shadow.bias = -0.0004;
spot.shadow.normalBias = 0.02;
spot.shadow.radius = 4;
scene.add(spot, spot.target);
const rim = new THREE.DirectionalLight(0x9db8ff, 0.45);
rim.position.set(-6, 5, -8);
scene.add(rim);

// =====================================================================================
// Procedural textures (small canvases, so there's nothing else to download)
// =====================================================================================
export function canvasTexture(w, h, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}
export function speckle(g, w, h, n, colours, size = [1, 3]) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colours[(Math.random() * colours.length) | 0];
    const s = rand(size[0], size[1]);
    g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}
const sandTex = canvasTexture(512, 512, (g, w, h) => {
  g.fillStyle = '#c9a36b';
  g.fillRect(0, 0, w, h);
  speckle(g, w, h, 9000, ['#b8925c', '#d6b27a', '#a9844f', '#dcbc88']);
  g.globalAlpha = 0.06;
  for (let i = 0; i < 40; i++) { g.fillStyle = i % 2 ? '#fff' : '#000'; g.fillRect(0, rand(0, h), w, rand(2, 8)); }   // raked lines
}, 3);
const clayTex = canvasTexture(256, 64, (g, w, h) => {
  g.fillStyle = '#8a5a33';
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 6) { g.fillStyle = y % 12 ? '#7b4f2c' : '#946239'; g.fillRect(0, y, w, 3); }
  speckle(g, w, h, 1500, ['#6e4526', '#a06c40']);
}, 1);
// Twisted straw rope: three strands spiralling round, each a bundle of fine fibres, with a deep
// crease between strands. Drawn so it tiles seamlessly both ways (u runs along the rope, v round it),
// as a colour map plus a matching height map for the relief. One tile is one full twist.
function ropeMaps() {
  const N = 512, STRANDS = 3;
  const col = document.createElement('canvas'), hgt = document.createElement('canvas');
  col.width = col.height = hgt.width = hgt.height = N;
  const ci = col.getContext('2d').createImageData(N, N), hi = hgt.getContext('2d').createImageData(N, N);
  // Fibres: a random brightness per fibre line (lines run along each strand, so they're indexed by l - a).
  const fibre = Array.from({ length: STRANDS }, () => Float32Array.from({ length: N }, () => Math.random()));
  const tone = [[214, 186, 112], [226, 201, 130], [196, 168, 96]];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const t = ((x + y) / N) * STRANDS;              // which strand, and where across it
      const k = Math.floor(t), f = t - k;
      const strand = k % STRANDS;
      const round = Math.sin(f * Math.PI);             // each strand bulges, creased at its edges
      const line = (((x - y) * 2) % N + N) % N;        // fibres run along the strand, wrapping cleanly
      const fib = fibre[strand][line] * 0.7 + fibre[strand][(line + 1) % N] * 0.3;
      const h = Math.pow(round, 0.55) * (0.82 + 0.18 * fib);
      const b = 0.34 + 0.66 * h;
      const [r, g, bl] = tone[strand];
      const i = (y * N + x) * 4;
      ci.data[i] = r * b * (0.92 + 0.12 * fib); ci.data[i + 1] = g * b * (0.92 + 0.12 * fib); ci.data[i + 2] = bl * b; ci.data[i + 3] = 255;
      const hv = 255 * h;
      hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = hv; hi.data[i + 3] = 255;
    }
  }
  col.getContext('2d').putImageData(ci, 0, 0);
  hgt.getContext('2d').putImageData(hi, 0, 0);
  const make = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 16;
    return t;
  };
  return { map: make(col, true), bump: make(hgt, false) };
}
const ROPE_TWIST = 0.5;   // metres of rope per full twist
// A material for a closed rope `length` metres long whose geometry runs u along it (0..1 once round).
function ropeMaterial(length) {
  const { map, bump } = ropeMaps();
  const reps = Math.max(1, Math.round(length / ROPE_TWIST));   // a whole number, so the ends meet without a seam
  map.repeat.set(reps, 1);
  bump.repeat.set(reps, 1);
  return new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 3, roughness: 0.9 });
}
const floorTex = canvasTexture(512, 512, (g, w, h) => {
  for (let y = 0; y < h; y += 32) {
    for (let x = (y / 32) % 2 ? -64 : 0; x < w; x += 128) {
      const v = 30 + Math.random() * 14;
      g.fillStyle = `rgb(${v + 22},${v + 10},${v})`;
      g.fillRect(x, y, 127, 31);
    }
  }
  speckle(g, w, h, 3000, ['rgba(0,0,0,0.25)', 'rgba(255,220,180,0.05)'], [1, 2]);
}, 6);
export const softDot = canvasTexture(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
});
softDot.wrapS = softDot.wrapT = THREE.ClampToEdgeWrapping;

// =====================================================================================
// The arena: hall floor, raised clay platform with a sand top, straw-bale ring (tawara),
// starting lines (shikiri-sen), the hanging roof with its four tassels, and festival banners.
// =====================================================================================
export const BANNER_R = 13.5;
const arena = new THREE.Group();
const banners = [];   // { group, mats } for fading out the ones the camera gets close to
scene.add(arena);
{
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  // The hall floor fades to black just past the platform: the light ends at the ring, and the crowd is out there in the dark.
  floor.material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vHall;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHall = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vHall;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb *= 1.0 - smoothstep(11.0, 15.0, length(vHall));');
  };
  arena.add(floor);

  // Platform: clay sides, sand top.
  const sideMat = new THREE.MeshStandardMaterial({ map: clayTex, roughness: 0.95 });
  const topMat = new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 });
  const platform = new THREE.Mesh(new THREE.BoxGeometry(PLATFORM, PLATFORM_H, PLATFORM), [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
  platform.position.y = PLATFORM_H / 2;
  platform.receiveShadow = platform.castShadow = true;
  arena.add(platform);
  // A step up on each side (fumidawara), sunk into the clay.
  const stepMat = new THREE.MeshStandardMaterial({ map: clayTex, color: 0xcfb08a, roughness: 1 });
  for (let i = 0; i < 4; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(2.2, PLATFORM_H * 0.5, 0.7), stepMat);
    const a = (i * Math.PI) / 2;
    step.position.set(Math.sin(a) * (PLATFORM / 2 + 0.35), PLATFORM_H * 0.25, Math.cos(a) * (PLATFORM / 2 + 0.35));
    step.rotation.y = a;
    step.receiveShadow = true;
    arena.add(step);
  }

  // The ring (tawara): one continuous twisted straw rope, half sunk into the clay.
  const ROPE_R = 0.11;
  const ringR = RING_R + 0.1;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(ringR, ROPE_R, 24, 480), ropeMaterial(2 * Math.PI * ringR));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = PLATFORM_H + 0.02;
  ring.castShadow = ring.receiveShadow = true;
  arena.add(ring);
  // The square of rope round the platform's edge: one closed loop with rounded corners.
  {
    const half = PLATFORM / 2 - 0.45, corner = 0.35, pts = [];
    for (let side = 0; side < 4; side++) {
      const a = (side * Math.PI) / 2;
      const cs = Math.cos(a), sn = Math.sin(a);
      const rot = (x, z) => new THREE.Vector3(x * cs - z * sn, 0, x * sn + z * cs);
      for (let i = 0; i < 24; i++) pts.push(rot(half, -(half - corner) + (2 * (half - corner) * i) / 24));          // a straight side
      for (let i = 0; i < 8; i++) {                                                                                   // round the corner
        const t = (i / 8) * (Math.PI / 2);
        pts.push(rot(half - corner + Math.cos(t) * corner, half - corner + Math.sin(t) * corner));
      }
    }
    const path = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    const edge = new THREE.Mesh(new THREE.TubeGeometry(path, 640, ROPE_R, 24, true), ropeMaterial(path.getLength()));
    edge.position.y = PLATFORM_H + 0.03;
    edge.castShadow = edge.receiveShadow = true;
    arena.add(edge);
  }
  // A band of freshly brushed sand just outside the ring (the janome), where footprints would show.
  const janome = new THREE.Mesh(new THREE.RingGeometry(RING_R + 0.22, RING_R + 0.55, 96), new THREE.MeshStandardMaterial({ color: 0xe2c896, roughness: 1, transparent: true, opacity: 0.55 }));
  janome.rotation.x = -Math.PI / 2;
  janome.position.y = PLATFORM_H + 0.003;
  janome.receiveShadow = true;
  arena.add(janome);
  // The two white starting lines.
  for (const x of [-0.55, 0.55]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.9), new THREE.MeshStandardMaterial({ color: 0xf6f1e6, roughness: 0.7 }));
    line.rotation.x = -Math.PI / 2;
    line.position.set(x, PLATFORM_H + 0.004, 0);
    line.receiveShadow = true;
    arena.add(line);
  }

  // The hanging shrine roof (tsuriyane), its purple drape, and the four coloured tassels (fusa).
  const roof = new THREE.Group();
  roof.position.y = 9.5;
  const wood = new THREE.MeshStandardMaterial({ color: 0x2b1b12, roughness: 0.7 });
  const cap = new THREE.Mesh(new THREE.ConeGeometry(9.2, 2.2, 4, 1), wood);
  cap.rotation.y = Math.PI / 4;
  cap.position.y = 1.2;
  roof.add(cap);
  const drape = new THREE.Mesh(new THREE.CylinderGeometry(6.6, 6.6, 0.9, 4, 1, true), new THREE.MeshStandardMaterial({ color: 0x4b2a6e, roughness: 0.9, side: THREE.DoubleSide }));
  drape.rotation.y = Math.PI / 4;
  roof.add(drape);
  const trim = new THREE.Mesh(new THREE.CylinderGeometry(6.65, 6.65, 0.08, 4, 1, true), new THREE.MeshStandardMaterial({ color: 0xc9a55a, metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide }));
  trim.rotation.y = Math.PI / 4;
  trim.position.y = -0.45;
  roof.add(trim);
  [0x2f8a4a, 0xc0392b, 0xf2efe8, 0x15151a].forEach((col, i) => {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const tassel = new THREE.Group();
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6), new THREE.MeshStandardMaterial({ color: col }));
    cord.position.y = -0.8;
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.3, 16), new THREE.MeshStandardMaterial({ color: col, roughness: 0.8 }));
    tuft.position.y = -2.1;
    tassel.add(cord, tuft);
    tassel.position.set(Math.sin(a) * 4.6, -0.4, Math.cos(a) * 4.6);
    roof.add(tassel);
  });
  arena.add(roof);

  // Festival banners (nobori) round the hall, just catching the light.
  const words = ['丸焼き横綱', '鶏', '焼鳥場所', '大相撲', '照り焼き', '手羽先'];
  const colours = ['#7a1f1f', '#1f3d6b', '#2f5a2a', '#6b4a1f', '#4b2a6e'];
  for (let i = 0; i < 14; i++) {
    const tex = canvasTexture(64, 256, (g, w, h) => {
      g.fillStyle = colours[i % colours.length];
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(0, 0, w, 10);
      g.fillStyle = '#f3e6c8';
      g.font = 'bold 40px "Hiragino Mincho ProN", "Yu Mincho", serif';
      g.textAlign = 'center';
      [...words[i % words.length]].forEach((ch, k) => g.fillText(ch, w / 2, 56 + k * 44));
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.repeat.set(1, 1);
    const a = (i / 14) * Math.PI * 2;
    const nobori = new THREE.Group();
    nobori.position.set(Math.sin(a) * BANNER_R, 0, Math.cos(a) * BANNER_R);   // a ring of banners round the hall, beyond where the camera goes
    nobori.lookAt(0, 0, 0);
    // The banner hangs from a crossbar on a tall pole, its foot a little off the floor.
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 4.4), new THREE.MeshStandardMaterial({ map: tex, color: 0xd0d0d0, roughness: 0.9, side: THREE.DoubleSide }));
    flag.position.set(0, 2.85, 0);
    flag.castShadow = true;
    nobori.add(flag);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.6 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 5.2, 8), poleMat);
    pole.position.set(-0.6, 2.6, 0.02);
    pole.castShadow = true;
    nobori.add(pole);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.25, 6), poleMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 5.07, 0.02);
    nobori.add(bar);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.18, 12), new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.9 }));
    base.position.set(-0.6, 0.09, 0.02);
    base.castShadow = base.receiveShadow = true;
    nobori.add(base);
    // A soft shadow pooled on the floor at its foot.
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), new THREE.MeshBasicMaterial({ map: softDot, color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(-0.2, 0.01, 0.15);
    nobori.add(pool);
    arena.add(nobori);
    const mats = [];
    nobori.traverse((m) => { if (m.material && !mats.includes(m.material)) mats.push(m.material); });
    for (const m of mats) { m.transparent = true; m.userData.baseOpacity = m.opacity; }
    banners.push({ group: nobori, mats });
  }
  // A soft wash from above that reaches the banners round the ring, but not the hall beyond them.
  const glow = new THREE.SpotLight(0xffc98a, 90, 26, 1.12, 0.35, 1.3);
  glow.position.set(0, 11, 0);
  glow.target.position.set(0, 0, 0);
  arena.add(glow, glow.target);
}

// The camera never passes through a banner: any it gets near fade away, and come back as it moves off.
const _bp = new THREE.Vector3();
export function updateBanners() {
  for (const b of banners) {
    b.group.getWorldPosition(_bp);
    const d = Math.hypot(camera.position.x - _bp.x, camera.position.z - _bp.z);
    const k = THREE.MathUtils.smoothstep(d, 1.2, 3.2);
    b.group.visible = k > 0.01;
    for (const m of b.mats) m.opacity = m.userData.baseOpacity * k;
  }
}
