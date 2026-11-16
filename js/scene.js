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
scene.background = new THREE.Color(0x0d0907);
scene.fog = new THREE.Fog(0x0d0907, 14, 30);
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
const strawTex = canvasTexture(256, 32, (g, w, h) => {
  g.fillStyle = '#c8b06a';
  g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 2) { g.fillStyle = Math.random() < 0.5 ? '#b39a55' : '#ddc684'; g.fillRect(x, 0, 1, h); }
  g.fillStyle = 'rgba(80,60,20,0.55)';
  for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 4, h);   // the rope bindings
}, 1);
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
const arena = new THREE.Group();
scene.add(arena);
{
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  // The hall floor fades to black just behind the banners, so the light ends at the edge of the ring.
  floor.material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vHall;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHall = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vHall;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb *= 1.0 - smoothstep(12.5, 16.0, length(vHall));');
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

  // The ring: twenty straw bales, half-buried, with small gaps between them.
  const strawMat = new THREE.MeshStandardMaterial({ map: strawTex, roughness: 0.9 });
  const BALES = 20;
  for (let i = 0; i < BALES; i++) {
    const arc = (Math.PI * 2) / BALES;
    const bale = new THREE.Mesh(new THREE.TorusGeometry(RING_R + 0.1, 0.1, 10, 10, arc * 0.94), strawMat);
    bale.rotation.x = -Math.PI / 2;
    bale.rotation.z = i * arc;
    bale.position.y = PLATFORM_H + 0.02;
    bale.castShadow = bale.receiveShadow = true;
    arena.add(bale);
  }
  // The square of bales round the platform's edge.
  for (let i = 0; i < 4; i++) {
    const bale = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, PLATFORM - 1.2, 10), strawMat);
    const a = (i * Math.PI) / 2;
    bale.rotation.z = Math.PI / 2;
    bale.rotation.y = a;
    bale.position.set(Math.sin(a) * (PLATFORM / 2 - 0.45), PLATFORM_H + 0.03, Math.cos(a) * (PLATFORM / 2 - 0.45));
    bale.castShadow = true;
    arena.add(bale);
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
    nobori.position.set(Math.sin(a) * 14.5, 0, Math.cos(a) * 14.5);
    nobori.lookAt(0, 0, 0);
    // The banner hangs from a crossbar on a tall pole, its foot a little off the floor.
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 4.4), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide }));
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
  }
  // The banners just catch a little warm light from above, rather than the main spot spilling onto them.
  const glow = new THREE.SpotLight(0xffc98a, 14, 16.5, 1.15, 0.6, 1.6);
  glow.position.set(0, 9, 0);
  glow.target.position.set(0, 0, 0);
  arena.add(glow, glow.target);
}
