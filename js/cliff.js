// Roast Royale: the practice ground. A sunny clifftop meadow of long golden grass and wild
// carrot flowers above the sea, with a flat-topped, mossy sea stack offshore. Built once, the
// first time practice starts; scene.js swaps it in for the arena (the dohyō stays in the middle).
import * as THREE from 'three';

const SEA_Y = -30;
const SEA_DIR = -1.05;                      // the bearing (atan2(z, x)) of the nearest cliff edge, and the sea stack beyond it
export const SUN_DIR = new THREE.Vector3(12, 20, 8).normalize();

// ---------- Noise: a small hashed value noise and some octaves of it ----------
function hash(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w) * 2 - 1;
}
const fbm = (x, y, z, oct = 3) => { let s = 0, a = 1, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f); n += a; a *= 0.5; f *= 2.1; } return s / n; };
// Seeded random, so the meadow comes out the same every time.
let seed = 7;
const rnd = (a = 0, b = 1) => { seed = (seed * 16807) % 2147483647; return a + ((seed - 1) / 2147483646) * (b - a); };

function canvasTex(w, h, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}
function softTex() {
  return canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.75)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });
}

// The plateau's outline: about 32m out, with a bite taken out towards the sea so the cliff edge
// is in view beyond the ring.
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export function plateauR(a) {
  const bite = Math.exp(-((angDiff(a, SEA_DIR) / 0.75) ** 2));
  return 33 - 16 * bite + 2.2 * Math.sin(3 * a + 1) + 1.2 * Math.sin(7 * a + 2) + 0.5 * Math.sin(17 * a + 0.4);
}

// A rocky column: a ring of rough rock round `outline`, from `top` down to `bottom`, flaring out
// as it goes down, dark grey-green with a mossy band at the top. Flat-shaded and low-poly.
function rockColumn(outline, top, bottom, { segs = 80, flare = 0.25, rough = 1.6, seedK = 0, moss = 2.2 } = {}) {
  const T = [0, 0.012, 0.035, 0.07, 0.12, 0.19, 0.28, 0.4, 0.55, 0.72, 0.87, 1];
  const pts = [], cols = [];
  const rock = new THREE.Color(0x3d3d39), dark = new THREE.Color(0x1f201d), mossC = new THREE.Color(0x8d9a38), mossD = new THREE.Color(0x5d6e2a), tmp = new THREE.Color();
  const grid = T.map((t) => {
    const y = top - (top - bottom) * t;
    const row = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const r0 = outline(a);
      const n = t === 0 ? 0 : fbm(Math.cos(a) * 3 + seedK, y * 0.14, Math.sin(a) * 3 + seedK, 3);
      // A slight overhang just under the lip, then rough ledges flaring down to the sea.
      const lip = t > 0 && t < 0.05 ? 0.35 : 0;
      const r = r0 * (1 + flare * t * t) + n * rough * Math.min(1, t * 6) * (1 + t * 2) + lip;
      const p = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
      const depth = top - y;
      const m = THREE.MathUtils.smoothstep(moss, moss * 0.25, depth + n * 0.6);
      tmp.copy(rock).lerp(dark, THREE.MathUtils.clamp(0.5 + fbm(a * 9, y * 0.5, seedK, 2) * 1.2, 0, 1));
      tmp.lerp(depth < 0.3 ? mossC : mossD, m);
      if (y < SEA_Y + 2.5) tmp.lerp(new THREE.Color(0x1d2320), 0.6);   // wet at the waterline
      row.push({ p, c: tmp.clone() });
    }
    return row;
  });
  for (let j = 0; j < T.length - 1; j++) {
    for (let i = 0; i < segs; i++) {
      const a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i], d = grid[j + 1][i + 1];
      for (const v of [a, b, c, b, d, c]) { pts.push(v.p.x, v.p.y, v.p.z); cols.push(v.c.r, v.c.g, v.c.b); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
  const foot = grid[T.length - 1].map((v) => Math.hypot(v.p.x, v.p.z));
  return { mesh, foot };
}

// A flat cap for a column: the outline as a shape, lying on the ground at height y.
function cap(outline, y, mat, segs = 96) {
  const shape = new THREE.Shape();
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2, r = outline(a);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (i) shape.lineTo(x, -z); else shape.moveTo(x, -z);
  }
  const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}
// White water round the foot of a rock.
function foam(foot, segs) {
  const shape = new THREE.Shape();
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2, r = foot[i] * 1.04 + 1.2;
    if (i) shape.lineTo(Math.cos(a) * r, -Math.sin(a) * r); else shape.moveTo(Math.cos(a) * r, -Math.sin(a) * r);
  }
  const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0xeaf4f7, transparent: true, opacity: 0.55, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = SEA_Y + 0.08;
  return m;
}

const grassTex = () => canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#62802c';
  g.fillRect(0, 0, w, h);
  // Big soft patches of yellower and deeper green, then thousands of little blade strokes.
  for (let i = 0; i < 60; i++) {
    const x = rnd(0, w), y = rnd(0, h), r = rnd(30, 110);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const c = ['rgba(176,160,60,0.35)', 'rgba(60,92,30,0.4)', 'rgba(150,140,50,0.3)'][i % 3];
    gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { g.save(); g.translate(dx, dy); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); }
  }
  const blades = ['#5c7a2a', '#86a33f', '#a3a94a', '#4d6a24', '#b8b25a', '#7c9637'];
  g.lineCap = 'round';
  for (let i = 0; i < 14000; i++) {
    const x = rnd(0, w), y = rnd(0, h), len = rnd(4, 12), lean = rnd(-0.5, 0.5);
    g.strokeStyle = blades[(rnd() * blades.length) | 0];
    g.lineWidth = rnd(0.8, 1.8);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + lean * len, y - len); g.stroke();
  }
}, 1);

// One tuft of long grass: a handful of tapering, leaning blades, dark at the root and golden at the tip.
function tuftGeometry() {
  const pos = [], col = [];
  const base = new THREE.Color(0x3f5a1e), mid = new THREE.Color(0x7f9a35), tip = new THREE.Color(0xd6c871);
  const N = 9;
  for (let b = 0; b < N; b++) {
    const a = rnd(0, Math.PI * 2), r = rnd(0, 0.09), h = rnd(0.55, 1), lean = rnd(0.1, 0.45), w = rnd(0.018, 0.03);
    const ox = Math.cos(a) * r, oz = Math.sin(a) * r;
    const dx = Math.cos(a), dz = Math.sin(a);          // leans outwards
    const px = -dz, pz = dx;                           // across the blade
    const at = (t) => [ox + dx * lean * t * t, h * t, oz + dz * lean * t * t];
    const p0 = at(0), p1 = at(0.55), p2 = at(1);
    const v = [
      [p0[0] - px * w, p0[1], p0[2] - pz * w], [p0[0] + px * w, p0[1], p0[2] + pz * w],
      [p1[0] - px * w * 0.7, p1[1], p1[2] - pz * w * 0.7], [p1[0] + px * w * 0.7, p1[1], p1[2] + pz * w * 0.7],
      p2,
    ];
    const c = [base, base, mid, mid, tip];
    for (const k of [0, 1, 2, 2, 1, 3, 2, 3, 4]) { pos.push(...v[k]); col.push(c[k].r, c[k].g, c[k].b); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

// The long grass sways in the breeze: a shader tweak that bends each blade more towards its tip.
const wind = { value: 0 };
function sway(mat, amount) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 rootW = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float bend = transformed.y * transformed.y * ${amount.toFixed(3)};
        float gust = sin(uWind * 1.6 + rootW.x * 0.35 + rootW.z * 0.22) + 0.4 * sin(uWind * 3.1 + rootW.x * 0.9);
        transformed.x += gust * bend;
        transformed.z += gust * bend * 0.5;`);
  };
}

// Is (x, z) somewhere on the meadow, clear of the dohyō?
const clearOfRing = (x, z, pad) => Math.abs(x) > 5.9 + pad || Math.abs(z) > 5.9 + pad;

function meadow(group) {
  // Grass tufts: densest round the ring (where the camera looks), thinning out to the cliff edge.
  const TUFTS = 5200;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85 });
  sway(mat, 0.12);
  const tufts = new THREE.InstancedMesh(tuftGeometry(), mat, TUFTS);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  let n = 0, tries = 0;
  while (n < TUFTS && tries++ < TUFTS * 6) {
    const a = rnd(0, Math.PI * 2), d = 6 + (plateauR(a) - 6.8) * Math.pow(rnd(), 1.25);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!clearOfRing(x, z, 0.3)) continue;
    const nearRing = clearOfRing(x, z, 1.4) ? 1 : 0.55;   // shorter right by the platform, so fallen chickens aren't lost in it
    const h = rnd(0.45, 1.05) * nearRing * (0.8 + 0.4 * (fbm(x * 0.08, 0, z * 0.08, 2) + 0.5));
    s.set(rnd(0.8, 1.4), h, rnd(0.8, 1.4));
    q.setFromAxisAngle(up, rnd(0, Math.PI * 2));
    p.set(x, 0, z);
    tufts.setMatrixAt(n, m4.compose(p, q, s));
    const gold = Math.max(0, fbm(x * 0.05 + 3, 1, z * 0.05, 2) + 0.15) * 1.6;   // drifts of drier, golden grass
    tufts.setColorAt(n, tint.setRGB(rnd(0.82, 1) + gold * 0.25, rnd(0.85, 1) + gold * 0.08, rnd(0.6, 0.85) - gold * 0.2));
    n++;
  }
  tufts.count = n;
  tufts.receiveShadow = true;
  group.add(tufts);

  // Wild carrot (Queen Anne's lace): a slim stem with a flat white umbel on top.
  const FLOWERS = 700;
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x6a8a33, roughness: 0.9 });
  sway(stemMat, 0.1);
  const stemGeo = new THREE.CylinderGeometry(0.008, 0.012, 1, 4, 1, true).translate(0, 0.5, 0);
  const headGeo = new THREE.SphereGeometry(0.1, 9, 3, 0, Math.PI * 2, 0, 0.9).scale(1, 0.45, 1).translate(0, 0.985, 0);
  const headTex = canvasTex(64, 64, (g) => {
    g.fillStyle = '#e9e6d6'; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 70; i++) { g.fillStyle = i % 5 ? '#fbfaf2' : '#cfcbb0'; g.beginPath(); g.arc(rnd(0, 64), rnd(0, 64), rnd(2, 4), 0, Math.PI * 2); g.fill(); }
  });
  const headMat = new THREE.MeshStandardMaterial({ map: headTex, color: 0xffffff, roughness: 0.8, emissive: 0x2a2a24 });
  sway(headMat, 0.1);
  const stems = new THREE.InstancedMesh(stemGeo, stemMat, FLOWERS);
  const heads = new THREE.InstancedMesh(headGeo, headMat, FLOWERS);
  n = 0; tries = 0;
  // In drifts: pick a few clump centres and scatter round them.
  const clumps = Array.from({ length: 40 }, () => { const a = rnd(0, Math.PI * 2); return [a, 7 + (plateauR(a) - 8) * Math.sqrt(rnd())]; });
  while (n < FLOWERS && tries++ < FLOWERS * 8) {
    const [ca, cd] = clumps[(rnd() * clumps.length) | 0];
    const x = Math.cos(ca) * cd + rnd(-2.5, 2.5), z = Math.sin(ca) * cd + rnd(-2.5, 2.5);
    const r = Math.hypot(x, z);
    if (!clearOfRing(x, z, 1.2) || r > plateauR(Math.atan2(z, x)) - 0.8) continue;
    const h = rnd(0.7, 1.25), k = rnd(0.6, 1);
    q.setFromEuler(new THREE.Euler(rnd(-0.12, 0.12), rnd(0, 6.28), rnd(-0.12, 0.12)));
    p.set(x, 0, z);
    stems.setMatrixAt(n, m4.compose(p, q, s.set(1, h, 1)));
    heads.setMatrixAt(n, m4.compose(p, q, s.set(k, h, k)));
    n++;
  }
  stems.count = heads.count = n;
  stems.receiveShadow = heads.receiveShadow = true;
  group.add(stems, heads);
}

function sky(group) {
  // A big gradient dome: deep blue overhead, pale at the horizon, with a warm glow round the sun.
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sun: { value: SUN_DIR } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 sun; varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 top = vec3(0.16, 0.42, 0.85), hor = vec3(0.70, 0.86, 0.97), low = vec3(0.55, 0.74, 0.88);
        vec3 c = h > 0.0 ? mix(hor, top, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(hor, low, clamp(-h * 8.0, 0.0, 1.0));
        float s = max(dot(vDir, sun), 0.0);
        c += vec3(1.0, 0.85, 0.6) * (pow(s, 8.0) * 0.25 + pow(s, 900.0) * 3.0);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
  dome.renderOrder = -1;
  group.add(dome);
  // Soft white clouds: clusters of fuzzy sprites, far off.
  const tex = softTex();
  for (let c = 0; c < 14; c++) {
    const a = rnd(0, Math.PI * 2), d = rnd(380, 620), y = rnd(70, 190);
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
    for (let k = 0; k < 7; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: k % 3 ? 0xffffff : 0xe8eef6, transparent: true, opacity: rnd(0.55, 0.85), fog: false, depthWrite: false }));
      const w = rnd(50, 110);
      sp.scale.set(w, w * rnd(0.35, 0.55), 1);
      sp.position.set(cx + rnd(-60, 60), y + rnd(-10, 12), cz + rnd(-60, 60));
      group.add(sp);
    }
  }
}

function sea(group) {
  const bump = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) {
      g.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)';
      g.lineWidth = rnd(1, 3);
      const x = rnd(0, w), y = rnd(0, h), l = rnd(6, 22);
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 2, x + l, y); g.stroke();
    }
  }, 160);
  bump.colorSpace = THREE.NoColorSpace;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ color: 0x1f6b98, roughness: 0.32, metalness: 0.1, bumpMap: bump, bumpScale: 1.2 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = SEA_Y;
  group.add(water);
}

// The clifftop scene, plus the sun and sky lights it needs. Returns { group, sun, update(t) }.
export function buildCliff() {
  seed = 7;
  const group = new THREE.Group();
  group.name = 'cliff';

  // The meadow on top (its surface at y = 0, where ring-outs land) and the rock falling away to the sea.
  const grassMat = new THREE.MeshStandardMaterial({ map: grassTex(), roughness: 1 });
  grassMat.map.repeat.set(1 / 5, 1 / 5);
  group.add(cap(plateauR, 0, grassMat, 160));
  const cliff = rockColumn(plateauR, -0.01, SEA_Y - 2, { segs: 120, flare: 0.3, rough: 2.2, seedK: 1.3 });
  cliff.mesh.receiveShadow = true;
  group.add(cliff.mesh, foam(cliff.foot, 120));
  meadow(group);

  sky(group);
  sea(group);

  // The sun: warm, from high over your shoulder, casting the one set of shadows (tight round the ring).
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.8);
  sun.position.copy(SUN_DIR).multiplyScalar(30);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 5, far: 70 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  group.add(sun, sun.target);

  return { group, update: (t) => { wind.value = t; } };
}
