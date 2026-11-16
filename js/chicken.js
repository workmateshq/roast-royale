// Roast Royale: the athletes. A roast chicken standing upright on its drumsticks, rigged with a
// pelvis, torso, two legs and two wings (shoulder + elbow; the elbows bend the opposite way to a
// person's). The GLB is one solid mesh, so the rig is built here: every vertex is weighted to the
// leg, wing or torso it sits in. The mawashi belt is painted straight onto the skin.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clamp, rand, smoothstep } from './config.js';
import { scene, canvasTexture, speckle, softDot } from './scene.js';

const CHICKEN_H = 1.35;               // standing height, drumstick tips to shoulders
// The GLB lies on its back; this stands it on its legs with the breast facing forward (+Z).
const MODEL_TILT = -Math.PI / 2;
const MODEL_YAW = Math.PI;
// Where the joints sit, as fractions of the standing height.
const HIP_Y = 0.34;
const LEG_TOP = 0.42;                 // skin below this (out over a foot) moves with the leg
const WING_FROM = 0.5;                // wings are above this, out at the sides

// ---------- The skin: how it's cooked, and the painted mawashi ----------
// Worked out per pixel from where that bit of skin sits on the standing chicken in its rest pose
// (before the rig moves it), so the belt stays on the hips however the legs and wings move.
// uSkin picks the cook: 0 golden roast, 1 extra crispy (charred black), 2 barely crispy (pale),
// 3 frozen raw chook (pale pink, frosted), 4 battered (crunchy golden coating), 5 rotten (grey, green mould, fuzz),
// 6 raw white chicken in a roasting bag (the bag itself is a separate see-through shell, made in rigChicken).
const SKIN_GLSL = `
  float rrHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float rrNoise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(rrHash(i), rrHash(i + vec3(1,0,0)), f.x), mix(rrHash(i + vec3(0,1,0)), rrHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(rrHash(i + vec3(0,0,1)), rrHash(i + vec3(1,0,1)), f.x), mix(rrHash(i + vec3(0,1,1)), rrHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  // Surface relief for the cook (batter crumbs, charred cracks, goosebumps), 0..1.
  float rrRelief(vec3 p) {
    if (uSkin > 5.5) return rrNoise(p * 140.0);                                 // goosebumpy raw skin
    if (uSkin > 4.5) return rrNoise(p * 9.0) * 0.5 + rrNoise(p * 220.0) * 0.5;   // lumpy, with fine fuzz
    if (uSkin > 3.5) return rrNoise(p * 55.0) * 0.6 + rrNoise(p * 130.0) * 0.4;
    if (uSkin > 2.5) return rrNoise(p * 160.0);
    if (uSkin > 0.5 && uSkin < 1.5) return abs(rrNoise(p * 24.0) - 0.5) * 2.0;
    return 0.5;
  }
`;
function paintSkin(material, belt, box) {
  const u = {
    uBelt: { value: new THREE.Color(belt) },
    uSkin: { value: 0 },
    uMin: { value: box.min.clone() },
    uSize: { value: box.getSize(new THREE.Vector3()) },
  };
  material.userData.u = u;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = transformed;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRest;\nuniform vec3 uBelt; uniform vec3 uMin; uniform vec3 uSize; uniform float uSkin;\n' + SKIN_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 c = diffuseColor.rgb;
          float L = dot(c, vec3(0.299, 0.587, 0.114));
          float r = rrRelief(vRest);
          if (uSkin > 0.5 && uSkin < 1.5) {          // extra crispy: charcoal black, a few burnt-brown edges
            c = mix(vec3(0.035, 0.028, 0.024), vec3(0.16, 0.08, 0.035), smoothstep(0.35, 0.8, L)) * (0.7 + 0.6 * r);
          } else if (uSkin > 1.5 && uSkin < 2.5) {   // skillet-seared: golden, with browned patches where it met the pan
            c = mix(vec3(0.6, 0.37, 0.15), vec3(0.86, 0.6, 0.3), smoothstep(0.15, 0.7, L));
            float sear = smoothstep(0.3, 0.85, rrNoise(vRest * 5.0) * 0.75 + rrNoise(vRest * 18.0) * 0.25);
            c = mix(c, vec3(0.4, 0.2, 0.07), sear * 0.7) * (0.88 + 0.14 * L);
          } else if (uSkin > 2.5 && uSkin < 3.5) {   // frozen raw chook: pale pink skin, frosted over
            c = mix(vec3(0.84, 0.48, 0.5), vec3(0.98, 0.72, 0.72), smoothstep(0.1, 0.65, L));
            c = mix(c, vec3(0.9, 0.95, 1.0), smoothstep(0.7, 0.95, rrNoise(vRest * 38.0)) * 0.45);
          } else if (uSkin > 5.5) {                  // bagged: raw, white, a faint pink-cream blush in the creases
            c = mix(vec3(0.82, 0.76, 0.72), vec3(0.98, 0.96, 0.93), smoothstep(0.08, 0.6, L));
          } else if (uSkin > 4.5 && uSkin < 5.5) {   // rotten: sallow grey, dark green mould blooms, pale fuzz on top
            c = mix(vec3(0.36, 0.36, 0.32), vec3(0.6, 0.59, 0.53), smoothstep(0.1, 0.7, L));
            float bloom = smoothstep(0.52, 0.68, rrNoise(vRest * 6.0) * 0.7 + rrNoise(vRest * 21.0) * 0.3);
            c = mix(c, vec3(0.1, 0.2, 0.09), bloom * 0.9);
            c = mix(c, vec3(0.2, 0.32, 0.14), smoothstep(0.62, 0.8, rrNoise(vRest * 14.0 + 3.1)) * 0.6 * (1.0 - bloom));
            float fuzz = smoothstep(0.55, 1.0, rrNoise(vRest * 240.0)) * (0.35 + 0.65 * bloom);
            c = mix(c, vec3(0.78, 0.82, 0.74), fuzz * 0.55);
          } else if (uSkin > 3.5) {                  // battered: golden, crunchy, crumbs catching the light
            c = mix(vec3(0.62, 0.32, 0.08), vec3(0.98, 0.7, 0.3), smoothstep(0.25, 0.75, r)) * (0.85 + 0.25 * L);
          }
          diffuseColor.rgb = c;
        }
        vec3 q = (vRest - uMin) / uSize;                          // 0..1 within its standing box
        float x = q.x * 2.0 - 1.0;                                // -1 left .. 1 right
        float front = smoothstep(0.0, 0.15, q.z - 0.5);           // the breast side
        float band = smoothstep(0.29, 0.31, q.y) * (1.0 - smoothstep(0.43, 0.45, q.y));            // round the hips
        float flap = front * smoothstep(0.17, 0.19, q.y) * (1.0 - smoothstep(0.31, 0.33, q.y)) * (1.0 - smoothstep(0.2, 0.23, abs(x)));
        float cords = front * smoothstep(0.08, 0.1, q.y) * (1.0 - smoothstep(0.30, 0.32, q.y)) * step(0.5, fract(x * 7.0 + 0.25)) * (1.0 - smoothstep(0.32, 0.35, abs(x)));
        float m = clamp(band + flap + cords, 0.0, 1.0);
        vec3 silk = uBelt * (0.85 + 0.15 * sin(q.y * 140.0));  // a little woven sheen
        float seam = smoothstep(0.43, 0.44, q.y) * (1.0 - smoothstep(0.445, 0.455, q.y));
        silk = mix(silk, uBelt * 1.6 + 0.08, seam);
        diffuseColor.rgb = mix(diffuseColor.rgb, silk, m);
        float rrBelt = m;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        if (uSkin > 0.5 && uSkin < 1.5) roughnessFactor = mix(roughnessFactor, 0.92, 0.8);
        else if (uSkin > 1.5 && uSkin < 2.5) roughnessFactor = mix(roughnessFactor, 0.4, 0.5);
        else if (uSkin > 2.5 && uSkin < 3.5) roughnessFactor = mix(0.32, 0.6, rrNoise(vRest * 38.0));
        else if (uSkin > 5.5) roughnessFactor = 0.42;   // moist raw skin
        else if (uSkin > 4.5) roughnessFactor = 0.97;   // dull, furry, nothing glistens
        else if (uSkin > 3.5) roughnessFactor = mix(roughnessFactor, 0.78, 0.8);
        roughnessFactor = mix(roughnessFactor, 0.55, rrBelt);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (uSkin > 0.5 && rrBelt < 0.5) {
          // Bump the surface with the cook's relief (batter crumbs stand out the most).
          float amt = uSkin > 5.5 ? 0.0015 : uSkin > 4.5 ? 0.01 : uSkin > 3.5 ? 0.012 : uSkin > 2.5 ? 0.0012 : uSkin < 1.5 ? 0.006 : 0.0;
          float h = rrRelief(vRest) * amt;
          vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
          float hx = dFdx(h), hy = dFdy(h);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          vec3 grad = sign(det) * (hx * r1 + hy * r2);
          normal = normalize(abs(det) * normal - grad);
        }`);
  };
  material.customProgramCacheKey = () => 'roast-skin';
}

// ---------- The procedural roast (shown until the GLB loads, or if it can't) ----------
const roastTex = canvasTexture(256, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#d89443');
  gr.addColorStop(1, '#a8601f');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = Math.random() < 0.7 ? `rgba(90,40,10,${rand(0.08, 0.3)})` : `rgba(255,220,150,${rand(0.08, 0.25)})`;
    g.beginPath();
    g.ellipse(rand(0, w), rand(0, h), rand(3, 18), rand(2, 10), rand(0, 3), 0, Math.PI * 2);
    g.fill();
  }
  speckle(g, w, h, 900, ['rgba(60,25,5,0.5)', 'rgba(255,240,200,0.4)']);
}, 1);

// A whole roast, headless, standing on its drumsticks, breast forward (+Z).
function proceduralChicken() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ map: roastTex, roughness: 0.42, metalness: 0.02 });
  const bone = new THREE.MeshStandardMaterial({ color: 0xf2e6cf, roughness: 0.5 });
  const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.rotation.z = rz;
    g.add(m);
  };
  const sphere = new THREE.SphereGeometry(1, 32, 24);
  add(sphere, skin, 0, 0.72, 0, 0.5, 0.48, 0.42);                   // body
  add(sphere, skin, 0, 0.82, 0.14, 0.38, 0.34, 0.3);                // plump breast
  for (const s of [-1, 1]) {
    add(sphere, skin, s * 0.52, 0.86, 0, 0.12, 0.26, 0.16, s * 0.25);  // wings at the shoulders
    add(sphere, skin, s * 0.24, 0.34, 0.04, 0.2, 0.26, 0.2);         // thighs
    add(new THREE.CylinderGeometry(0.05, 0.065, 0.22, 10), bone, s * 0.24, 0.11, 0.04);
    add(new THREE.SphereGeometry(0.075, 12, 10), bone, s * 0.24, 0.02, 0.04);
  }
  add(new THREE.CylinderGeometry(0.11, 0.13, 0.05, 16), new THREE.MeshStandardMaterial({ color: 0x3a1a08, roughness: 0.9 }), 0, 1.19, 0.02);
  return g;
}

// ---------- Rigging ----------
// Bakes a model into one standing pose (feet on y = 0, CHICKEN_H tall, breast to +Z), finds its
// feet and wings, builds the skeleton and weights every vertex to it.
function rigChicken(object, belt, tilt = 0, yaw = 0) {
  const pose = new THREE.Group();
  pose.rotation.y = yaw;
  object.rotation.x = tilt;
  pose.add(object);
  pose.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(pose);
  pose.scale.setScalar(CHICKEN_H / box.getSize(new THREE.Vector3()).y);
  pose.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(pose);
  const c = box.getCenter(new THREE.Vector3());
  pose.position.set(-c.x, -box.min.y, -c.z);
  pose.updateMatrixWorld(true);

  const parts = [];
  object.traverse((m) => {
    if (m.isMesh) parts.push({ geo: m.geometry.clone().applyMatrix4(m.matrixWorld), mat: m.material, wing: /wing/i.test(m.name) ? (/_L/.test(m.name) ? 'L' : 'R') : null });
  });
  const rest = new THREE.Box3();
  parts.forEach((p) => { p.geo.computeBoundingBox(); rest.union(p.geo.boundingBox); });
  const H = rest.max.y - rest.min.y;
  const halfW = (rest.max.x - rest.min.x) / 2;

  // Feet: the lowest skin either side. Wings: the outermost skin up high, either side.
  const feet = [new THREE.Vector3(), new THREE.Vector3()], nFeet = [0, 0];
  const wings = [[], []];
  const v = new THREE.Vector3();
  // The model's wings are separate pieces (cut free in Blender), so they can swing away from the body.
  const separateWings = parts.some((p) => p.wing);
  for (const p of parts) {
    const pos = p.geo.attributes.position;
    for (let i = 0; i < pos.count; i += 3) {
      v.fromBufferAttribute(pos, i);
      const side = v.x < 0 ? 0 : 1;
      if (!p.wing && v.y < rest.min.y + 0.07 * H) { feet[side].add(v); nFeet[side]++; }
      if (separateWings ? p.wing : (v.y > WING_FROM * H && Math.abs(v.x) > 0.72 * halfW)) wings[side].push(v.clone());
    }
  }
  feet.forEach((f, s) => (nFeet[s] ? f.divideScalar(nFeet[s]) : f.set((s ? 1 : -1) * 0.3 * halfW, 0, 0)));
  // Where each separate wing joins the body: its vertices that sit exactly on the body's skin (the
  // line it was cut along, up by the back). The wing pivots there, and stays fastened there.
  const seams = [[], []];
  if (separateWings) {
    const key = (q) => `${Math.round(q.x * 2e4)},${Math.round(q.y * 2e4)},${Math.round(q.z * 2e4)}`;
    const onBody = new Set();
    for (const p of parts) {
      if (p.wing) continue;
      const pos = p.geo.attributes.position;
      for (let i = 0; i < pos.count; i++) onBody.add(key(v.fromBufferAttribute(pos, i)));
    }
    for (const p of parts) {
      if (!p.wing) continue;
      const pos = p.geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        if (onBody.has(key(v))) seams[v.x < 0 ? 0 : 1].push(v.clone());
      }
    }
  }
  const hipY = HIP_Y * H;
  // Each wing hangs down the side of the body from its shoulder at the top, its tip (the "hand")
  // tucked against the waist. The shoulder is the wing's top end; the elbow is halfway down.
  const wingJoints = wings.map((pts, s) => {
    const sign = s ? 1 : -1;
    if (pts.length < 20) {
      const sh = new THREE.Vector3(sign * 0.85 * halfW, 0.95 * H, 0);
      return { shoulder: sh, elbow: sh.clone().add(new THREE.Vector3(0, -0.16 * H, 0)), reach: 0.32 * H };
    }
    let shoulder;
    if (seams[s].length > 8) {
      // The middle of the join, nudged into the body a touch so the wing turns about its root.
      shoulder = seams[s].reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(seams[s].length);
      shoulder.x -= sign * 0.03 * halfW;
    } else {
      pts.sort((a, b) => b.y - a.y);
      const top = pts.slice(0, Math.max(5, pts.length * 0.12 | 0));
      shoulder = top.reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(top.length);
      shoulder.x = sign * Math.min(Math.abs(shoulder.x), 0.86 * halfW);   // in at the body's edge, where it joins
    }
    let tip = shoulder, far = 0;
    for (const q of pts) { const d = q.distanceTo(shoulder); if (d > far) { far = d; tip = q; } }
    return { shoulder, elbow: shoulder.clone().lerp(tip, 0.5), reach: far };
  });

  // The skeleton.
  const root = new THREE.Bone();
  const pelvis = new THREE.Bone();
  pelvis.position.set(0, hipY, 0);
  root.add(pelvis);
  const torso = new THREE.Bone();
  pelvis.add(torso);
  const legs = feet.map((f) => {
    const leg = new THREE.Bone();
    leg.position.set(f.x, 0, f.z);
    pelvis.add(leg);
    return leg;
  });
  const arms = wingJoints.map((j) => {
    const shoulder = new THREE.Bone();
    shoulder.position.set(j.shoulder.x, j.shoulder.y - hipY, j.shoulder.z);
    torso.add(shoulder);
    const elbow = new THREE.Bone();
    elbow.position.copy(j.elbow).sub(j.shoulder);
    shoulder.add(elbow);
    return { shoulder, elbow };
  });
  const rig = new THREE.Group();
  rig.add(root);
  rig.updateMatrixWorld(true);
  const bones = [root, pelvis, torso, legs[0], legs[1], arms[0].shoulder, arms[0].elbow, arms[1].shoulder, arms[1].elbow];
  const skeleton = new THREE.Skeleton(bones);
  const B = { torso: 2, leg: [3, 4], shoulder: [5, 7], elbow: [6, 8] };

  // (Without separate wing pieces) the model is one closed skin. Only the wing itself (out at the side, up high) follows the
  // wing bones, blending into the body over a short band at its root, and the wing poses are kept
  // small, so the wings stay attached and the torso skin doesn't stretch.
  const mats = [], bag = [];
  for (const p of parts) {
    const geo = p.geo;
    const pos = geo.attributes.position;
    const n = pos.count;
    const idx = new Uint16Array(n * 4), wt = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i);
      const s = v.x < 0 ? 0 : 1, f = feet[s], j = wingJoints[s];
      const legW = p.wing ? 0 : smoothstep(LEG_TOP * H, (HIP_Y - 0.12) * H, v.y) * smoothstep(0.2, 0.6, Math.abs(v.x) / Math.max(0.05, Math.abs(f.x)));
      const along = v.distanceTo(j.shoulder) / Math.max(0.05, j.reach);
      // A separate wing moves with its wing bones, except right at its root: the join stays fastened
      // to the body and the skin just beyond it stretches, so the wing never comes away.
      let fromSeam = 1;
      if (p.wing && seams[s].length) {
        let d = Infinity;
        for (const q of seams[s]) d = Math.min(d, v.distanceToSquared(q));
        fromSeam = smoothstep(0, 0.13 * H, Math.sqrt(d));
      }
      const wingW = separateWings ? (p.wing ? fromSeam : 0)
        : (1 - legW) * smoothstep(0.68, 0.8, Math.abs(v.x) / halfW) * smoothstep(0.58 * H, 0.68 * H, v.y) * (1 - smoothstep(1.0, 1.2, along));
      const elbowW = wingW * smoothstep(0.45, 0.7, along);
      idx.set([B.leg[s], B.shoulder[s], B.elbow[s], B.torso], i * 4);
      wt.set([legW, wingW - elbowW, elbowW, Math.max(0, 1 - legW - wingW)], i * 4);
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wt, 4));
    const mat = p.mat.clone();
    paintSkin(mat, belt, rest);
    mats.push(mat);
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    rig.add(mesh);
    mesh.bind(skeleton);
    // The roasting bag: the same skin, puffed out a little and crumpled, glossy and see-through.
    // Shown only for the bagged chicken (setSkin).
    const shell = new THREE.SkinnedMesh(geo, bagMaterial(H));
    shell.frustumCulled = false;
    shell.renderOrder = 2;
    shell.visible = false;
    rig.add(shell);
    shell.bind(skeleton);
    bag.push(shell);
  }
  // The bag's tie at the very top, where the head would be: twisted plastic sticking up like a ponytail.
  {
    let n = 0;
    const top = new THREE.Vector3();
    for (const p of parts) {
      if (p.wing) continue;
      const pos = p.geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        if (v.y > rest.max.y - 0.06 * H) { top.add(v); n++; }
      }
    }
    if (n) top.divideScalar(n); else top.set(0, rest.max.y, 0);
    const tail = bagTail(H);
    tail.position.set(top.x, rest.max.y - 0.03 * H - hipY, top.z);
    tail.visible = false;
    torso.add(tail);
    bag.push(tail);
  }
  rig.userData.rig = {
    pelvis, torso, legs, arms, hipY, H, mats, bag,
    rest: { arms: arms.map((a) => ({ s: a.shoulder.quaternion.clone(), e: a.elbow.quaternion.clone() })) },
    phase: 0, amp: 0, dir: new THREE.Vector2(0, 1), push: 0, wingT: Math.random() * 10, separateWings,
  };
  return rig;
}

// ---------- The visual for one wrestler ----------
export const visuals = [];
export function makeVisual(belt) {
  const root = new THREE.Group();
  const body = new THREE.Group();   // leans and tips over, pivoting on the feet
  root.add(body);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshBasicMaterial({ map: softDot, color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  scene.add(root, blob);
  const v = { root, body, blob, belt, model: null, anim: { pitch: 0, roll: 0, lunge: 0, crouch: 0, squash: 1 } };
  setModel(v, rigChicken(proceduralChicken(), belt));
  visuals.push(v);
  return v;
}
function setModel(v, rig) {
  if (v.model) v.body.remove(v.model);
  v.model = rig;
  v.body.add(rig);
  setSkin(v, v.skin || 0);
}
// Which cook this chicken is (see ROSTER in roster.js).
export function setSkin(v, skin) {
  v.skin = skin;
  applySkin(v.model, skin);
}
function applySkin(rig, skin) {
  const r = rig.userData.rig;
  for (const m of r.mats) m.userData.u.uSkin.value = skin;
  for (const b of r.bag || []) b.visible = skin === BAGGED;
}
const BAGGED = 6;

// ---------- The roasting bag ----------
// Clear, glossy plastic. A shell over the skin: pushed out along the normals, with a crumpled ripple.
function bagMaterial(H) {
  // Clear film, shrink-wrapped close to the skin: nearly invisible face-on, catching the light at the
  // edges (Fresnel) and in sharp wrinkle highlights, like real roasting-bag plastic.
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x000000, transparent: true, opacity: 1, roughness: 0.03, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.0,   // no diffuse: only reflections show
    specularIntensity: 1, depthWrite: false, side: THREE.FrontSide, envMapIntensity: 4.2,
  });
  const u = { uPuff: { value: 0.009 * H }, uScale: { value: 1 / H } };
  const NOISE = `
    float bagHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float bagNoise(vec3 x) {
      vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(bagHash(i), bagHash(i + vec3(1,0,0)), f.x), mix(bagHash(i + vec3(0,1,0)), bagHash(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(bagHash(i + vec3(0,0,1)), bagHash(i + vec3(1,0,1)), f.x), mix(bagHash(i + vec3(0,1,1)), bagHash(i + vec3(1,1,1)), f.x), f.y), f.z);
    }
    // Creases: long, thin ridges (stretched noise) rather than blobs, so highlights streak.
    float bagRidge(vec3 p) { return 1.0 - abs(bagNoise(p) - 0.5) * 2.0; }
    float bagWrinkle(vec3 p) {
      float a = bagRidge(vec3(p.x * 7.0, p.y * 22.0, p.z * 7.0));
      float b = bagRidge(vec3(p.x * 19.0 + 3.1, p.y * 8.0, p.z * 19.0));
      float c = bagRidge(vec3((p.x + p.y) * 15.0 + 7.3, (p.y - p.z) * 15.0, p.z * 11.0));
      float d = bagRidge(vec3(p.x * 34.0 + 1.7, (p.y + p.z) * 30.0, (p.z - p.x) * 34.0));
      return max(pow(max(a, max(b, c)), 3.5), 0.8 * pow(d, 5.0));
    }`;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uPuff; uniform float uScale;
        varying vec3 vBag;` + NOISE)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vBag = transformed * uScale;
        // Just off the skin, with the slight slack of film over the hollows.
        transformed += objectNormal * uPuff * (0.6 + 0.9 * bagNoise(vBag * 10.0) + 0.7 * bagWrinkle(vBag));`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform mat3 normalMatrix;
        varying vec3 vBag;` + NOISE)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // Wrinkle the film so reflections break up into creases: the slope of the crease pattern, worked
          // out on the surface itself (smooth, unlike screen-space derivatives), tilts the normal.
          const float e = 0.004;
          float w0 = bagWrinkle(vBag);
          vec3 g = vec3(bagWrinkle(vBag + vec3(e, 0, 0)), bagWrinkle(vBag + vec3(0, e, 0)), bagWrinkle(vBag + vec3(0, 0, e))) - w0;
          vec3 gv = normalMatrix * (g / e);
          normal = normalize(normal - 0.06 * (gv - dot(gv, normal) * normal));
        }`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        {
          // Mostly see-through: more opaque (and whiter) where the film turns away from you, and where it shines.
          float facing = abs(dot(normalize(normal), normalize(vViewPosition)));
          float fres = pow(1.0 - facing, 3.0);
          float shine = max(max(gl_FragColor.r, gl_FragColor.g), gl_FragColor.b);
          float crease = smoothstep(0.45, 0.9, bagWrinkle(vBag));
          // Clear film: the chicken shows through. What you see is the reflections (shine), a pale sheen
          // at the edges, and thin bright lines along the creases.
          gl_FragColor.rgb = gl_FragColor.rgb * 1.25 + vec3(0.9) * (0.4 * fres + 0.45 * crease);
          gl_FragColor.a = clamp(0.04 + 0.45 * fres + 0.95 * smoothstep(0.12, 0.7, shine) + 0.3 * crease, 0.0, 0.88);
        }`);
  };
  m.customProgramCacheKey = () => 'roast-bag-7';
  return m;
}
// The gathered neck of the bag: a twist-tie band and a crumpled tuft of plastic flaring up above it.
function bagTail(H) {
  const g = new THREE.Group();
  const plastic = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, transparent: true, opacity: 0.3, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05,
    depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6,
  });
  // Gathered neck, narrowing to the tie, then the tail fanning out and drooping a touch.
  const prof = [];
  const P = (r, y) => prof.push(new THREE.Vector2(r * H, y * H));
  P(0.11, -0.02); P(0.07, 0.03); P(0.028, 0.075); P(0.022, 0.1);    // gathered up to the tie
  P(0.03, 0.12); P(0.055, 0.17); P(0.08, 0.23); P(0.095, 0.29); P(0.085, 0.32);   // the tuft above
  const lathe = new THREE.LatheGeometry(prof, 28);
  // Crumple it: pinch it into pleats and wobble the top so it isn't a neat cone.
  const pos = lathe.attributes.position, q = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    q.fromBufferAttribute(pos, i);
    const a = Math.atan2(q.z, q.x), y = q.y / H;
    const pleat = 1 + 0.28 * Math.sin(a * 7 + y * 20) * smoothstep(0.1, 0.3, y) + 0.12 * Math.sin(a * 11);
    q.x *= pleat; q.z *= pleat;
    q.x += Math.sin(y * 9) * 0.04 * H * smoothstep(0.12, 0.32, y);     // leaning over a little, like a ponytail
    q.y += Math.sin(a * 5) * 0.012 * H * smoothstep(0.2, 0.32, y);
    pos.setXYZ(i, q.x, q.y, q.z);
  }
  lathe.computeVertexNormals();
  const tuft = new THREE.Mesh(lathe, plastic);
  tuft.renderOrder = 3;
  g.add(tuft);
  // The twist tie.
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.03 * H, 0.008 * H, 8, 24), new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.5, metalness: 0.3 }));
  tie.rotation.x = Math.PI / 2;
  tie.position.y = 0.1 * H;
  tie.castShadow = true;
  g.add(tie);
  const ends = new THREE.Mesh(new THREE.CylinderGeometry(0.005 * H, 0.005 * H, 0.06 * H, 6), tie.material);
  ends.rotation.z = Math.PI / 2.4;
  ends.position.set(0.045 * H, 0.1 * H, 0);
  g.add(ends);
  return g;
}

// Load the GLB; both chickens switch to it when it arrives.
let template = null;   // the loaded GLB, for portraits
export function loadModel(onProgress, onLoaded = () => {}) {
  new GLTFLoader().load('assets/roast_chicken.glb', (gltf) => {
    template = gltf.scene;
    visuals.forEach((v) => setModel(v, rigChicken(gltf.scene.clone(true), v.belt, MODEL_TILT, MODEL_YAW)));
    onProgress('');
    onLoaded();
  }, (e) => {
    if (e.total) onProgress(`Preheating the oven... ${Math.round((e.loaded / e.total) * 100)}%`);
  }, (err) => {
    console.warn('Roast chicken model unavailable, using the procedural roast.', err);
    onProgress('');
    onLoaded();
  });
}

// Character-select portraits: each cook rendered once, front three-quarter, as an image URL.
export function renderPortraits(skins, size = 256) {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(size, size * 1.25);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.outputColorSpace = THREE.SRGBColorSpace;
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xfff0dc, 0x3a2414, 1.1));
  const key = new THREE.DirectionalLight(0xffd8a8, 2.6);
  key.position.set(1.5, 3, 3);
  const rim = new THREE.DirectionalLight(0x9db8ff, 1.2);
  rim.position.set(-2, 2, -2);
  sc.add(key, rim);
  const cam = new THREE.PerspectiveCamera(30, 0.8, 0.1, 20);
  cam.position.set(1.1, 1.05, 2.7);
  cam.lookAt(0, 0.62, 0);
  const urls = skins.map((skin) => {
    const rig = template ? rigChicken(template.clone(true), 0x2a2a34, MODEL_TILT, MODEL_YAW) : rigChicken(proceduralChicken(), 0x2a2a34);
    applySkin(rig, skin);
    rig.rotation.x = 0.1;
    sc.add(rig);
    r.render(sc, cam);
    const url = r.domElement.toDataURL('image/png');
    sc.remove(rig);
    rig.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } });
    return url;
  });
  r.dispose();
  return urls;
}

// ---------- Posing: walking, balancing and wing-arms ----------
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
// Sets a bone to its rest pose turned by (x, y, z) radians in its own frame.
function turn(bone, rest, x, y, z) {
  bone.quaternion.copy(rest).multiply(_q.setFromEuler(_e.set(x, y, z)));
}

/**
 * Pose one chicken for this frame.
 * w: the wrestler (state, vel, heading...). o: { crouch 0..1, squash, armPose } from the animator.
 *
 * Walking is driven by distance travelled: a planted foot sweeps back exactly as far as the body
 * moves over it, so feet never skate. The swinging foot lifts and reaches forward. The body bobs
 * and shifts its weight over whichever leg is planted, and leans into its own acceleration.
 */
export function poseChicken(v, w, dt, o) {
  const r = v.model.userData.rig;
  if (!r) return;
  const H = r.H, L = r.hipY;
  // Velocity in the chicken's own frame (+Z forward, +X to its left as it faces us).
  const h = w.heading, vx = w.vel.x, vz = w.vel.y;
  const fwd = vx * Math.sin(h) + vz * Math.cos(h);
  const side = vx * Math.cos(h) - vz * Math.sin(h);
  const speed = Math.hypot(fwd, side);
  // Turning on the spot counts as stepping: the feet shuffle round (about a foot's width from the
  // middle) rather than the chicken spinning on them.
  const turnStep = Math.abs(w.turnVel || 0) * 0.32;
  const stepSpeed = Math.max(speed, turnStep);
  const moving = stepSpeed > 0.1 && !w.done && o.canWalk;
  if (speed > 0.05) r.dir.lerp(new THREE.Vector2(side, fwd).normalize(), Math.min(1, dt * 10)).normalize();
  else if (turnStep > 0.1) r.dir.lerp(new THREE.Vector2(Math.sign(w.turnVel), 0.25).normalize(), Math.min(1, dt * 10)).normalize();

  // Stride: longer and quicker the faster it goes.
  const wantAmp = moving ? clamp(0.16 + stepSpeed * 0.09, 0, 0.6) : 0;
  r.amp += (wantAmp - r.amp) * Math.min(1, dt * (moving ? 8 : 5));
  const stride = 4 * L * Math.sin(Math.max(0.14, r.amp));   // body travel per full cycle (two steps)
  if (moving) r.phase = (r.phase + (stepSpeed * dt) / stride) % 1;
  else r.phase += ((Math.round(r.phase * 2) / 2) - r.phase) * Math.min(1, dt * 6);   // settle onto both feet

  const crouch = o.crouch;                           // knees can't bend, so the hips sink and the legs splay
  const bob = 0.022 * H * Math.min(1, r.amp / 0.3) * Math.cos(r.phase * Math.PI * 4);
  const pelvisY = L * (1 - crouch * 0.28) + bob;
  r.pelvis.position.y = pelvisY;
  const splay = 0.08 + crouch * 0.42;

  if (o.armPose === 'flap') {
    // Legs in the air, pedalling.
    r.legs.forEach((leg, k) => {
      leg.rotation.set(-0.5 + Math.sin(r.wingT * 13 + k * Math.PI) * 0.4, 0, (k ? 1 : -1) * 0.25);
      leg.scale.set(1, 1, 1);
    });
  } else r.legs.forEach((leg, k) => {
    const p = (r.phase + k * 0.5) % 1;
    let s, lift;
    if (p < 0.5) { s = 1 - 4 * p; lift = 0; }                           // planted: sweeps steadily back
    else { const q = (p - 0.5) * 2; s = -Math.cos(q * Math.PI); lift = Math.sin(q * Math.PI); }   // swinging forward, foot raised
    const th = r.amp * s;
    const ax = -th * r.dir.y;                                           // forward/back swing
    const az = th * r.dir.x + (k ? splay : -splay);                     // sideways swing + stance width
    leg.rotation.set(ax, 0, az);
    // Keep the planted foot on the sand: the leg reaches exactly down to the ground at its angle.
    const reach = pelvisY / (L * Math.max(0.6, Math.cos(ax) * Math.cos(az)));
    leg.scale.set(1, reach * (1 - 0.3 * lift * Math.min(1, r.amp / 0.25)), 1);
  });
  // Shiko: one leg swung high out to the side (then stamped down), the other planted.
  if (o.shiko) {
    const k = o.shiko.leg, up = o.shiko.lift;
    const leg = r.legs[k];
    leg.rotation.set(-0.15 * up, 0, (k ? 1 : -1) * (splay + 1.05 * up));
    leg.scale.set(1, up > 0.05 ? 1 : leg.scale.y, 1);
  }

  // The upper body: weight over the planted leg, a lean into the walk, squash for effort.
  const sway = 0.07 * Math.min(1, r.amp / 0.3) * Math.sin(r.phase * Math.PI * 2);
  r.torso.rotation.set(Math.min(0.25, speed * 0.04) * Math.sign(fwd), 0, sway);
  r.torso.scale.set(1 / Math.sqrt(o.squash), o.squash, 1 / Math.sqrt(o.squash));

  // Wings as arms, hanging from the shoulder. Each pose is (shoulder swing, negative = forward;
  // shoulder out to the side; elbow bend), radians from rest. The elbow bends backwards, the
  // opposite way to a person's, so a positive bend folds the wing's tip back behind it.
  r.wingT += dt;
  const swing = 0.35 * Math.min(1, r.amp / 0.3) * Math.sin(r.phase * Math.PI * 2);   // arms swing against the legs
  const ARM = {
    idle:    [0, 0, 0],
    walk:    [0, 0.02, 0.05],
    push:    [-0.75, -0.08, -0.1],       // both wings swing forward into the shove
    brace:   [-0.3, 0.35, 0.4],          // wings out a little, tips folded back, ready to absorb
    windup:  [0.4, 0.15, 0.45],          // drawn back
    charge:  [-0.6, 0.02, 0.1],          // reaching ahead into the hit
    dodge:   [0.1, 0.4, 0.2],            // lifted out for balance
    flail:   [-0.15, 0.45, 0.3],         // windmilling at the straw / staggering
    victory: [-0.2, 0.5, 0.25],
    shiko:   [-0.15, 0.55, 0.2],         // wings out wide for balance
    flap:    [-0.1, 0.45, 0.25],         // on its back: wings flapping helplessly
    down:    [0.1, 0.35, 0.15],
  }[o.armPose] || [0, 0, 0];
  // Free-moving wings (separate pieces) can go much further without tearing the skin.
  const big = r.separateWings ? 1.4 : 1;
  r.push += ((o.armPose === 'push' ? 1 : 0) - r.push) * Math.min(1, dt * 18);
  const wob = o.armPose === 'flail' ? Math.sin(r.wingT * 22) * 0.35 : o.armPose === 'victory' ? Math.sin(r.wingT * 6.4) * 0.25
    : o.armPose === 'flap' ? Math.sin(r.wingT * 26) * 0.45 : 0;
  r.arms.forEach((arm, k) => {
    const sg = k ? 1 : -1;            // mirror left/right
    const ph = k ? swing : -swing;
    const target = { s: [(ARM[0] + ph + (k ? wob : -wob) * 0.5) * big, 0, sg * (ARM[1] + Math.abs(wob) * 0.3) * big], e: ARM[2] * big };
    arm.cur = arm.cur || { s: [0, 0, 0], e: 0 };
    const kk = Math.min(1, dt * (o.armPose === 'push' ? 22 : o.armPose === 'flap' ? 30 : 10));
    for (let i = 0; i < 3; i++) arm.cur.s[i] += (target.s[i] - arm.cur.s[i]) * kk;
    arm.cur.e += (target.e - arm.cur.e) * kk;
    turn(arm.shoulder, r.rest.arms[k].s, arm.cur.s[0], arm.cur.s[1], arm.cur.s[2]);
    turn(arm.elbow, r.rest.arms[k].e, arm.cur.e, 0, 0);
  });
}

// For tuning the rig: tints each vertex by the bone it follows most (legs red, wings blue,
// elbows cyan, torso unchanged). Call from the console: roast.debugRig(true)
export function debugRig(on) {
  for (const v of visuals) {
    v.model.traverse((m) => {
      if (!m.isSkinnedMesh) return;
      if (!on) { m.material.vertexColors = false; m.material.needsUpdate = true; return; }
      const idx = m.geometry.attributes.skinIndex, wt = m.geometry.attributes.skinWeight;
      const col = new Float32Array(idx.count * 3);
      for (let i = 0; i < idx.count; i++) {
        const w = [wt.getX(i), wt.getY(i), wt.getZ(i), wt.getW(i)];
        col.set([1 - w[1] * 0.8 - w[2] * 0.9, 1 - w[0] * 0.9 - w[1] * 0.6, 1 - w[0] * 0.9], i * 3);
      }
      m.geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      m.material.vertexColors = true;
      m.material.needsUpdate = true;
    });
  }
}
