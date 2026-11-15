// Roast Royale: particles, synthesised sound, and the camera shake/zoom kick other modules trigger.
import * as THREE from 'three';
import { PLATFORM, PLATFORM_H, rand } from './config.js';
import { scene, softDot } from './scene.js';

// Camera kicks: impacts set these, the camera (main.js) eases them back off.
export const view = { shake: 0, zoomPunch: 0 };
export function shake(a) { view.shake = Math.max(view.shake, a); }

// =====================================================================================
// Particles: salt, crispy flakes, sand dust, steam. A small pool of sprites.
// =====================================================================================
const particles = [];
const live = [];
for (let i = 0; i < 260; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, transparent: true, depthWrite: false }));
  s.visible = false;
  scene.add(s);
  particles.push({ s, vel: new THREE.Vector3(), life: 0, max: 1, grav: 0, drag: 0, grow: 0, alpha: 1, size: 0.1 });
}
export function emit(pos, n, { colour = 0xffffff, speed = 2, up = 1.5, life = 0.8, grav = 6, drag = 1.5, size = 0.08, grow = 0, alpha = 1, spread = 1, dir = null } = {}) {
  for (let i = 0; i < n; i++) {
    const p = particles.find((q) => q.life <= 0);
    if (!p) return;
    p.s.position.copy(pos);
    const a = rand(0, Math.PI * 2);
    const sp = rand(0.3, 1) * speed;
    p.vel.set(Math.cos(a) * sp * spread, rand(0.4, 1) * up, Math.sin(a) * sp * spread);
    if (dir) p.vel.addScaledVector(dir, sp);
    p.life = p.max = life * rand(0.7, 1.2);
    Object.assign(p, { grav, drag, grow, alpha, size });
    p.s.material.color.setHex(colour);
    p.s.visible = true;
    live.push(p);
  }
}
export function updateParticles(dt) {
  for (let i = live.length - 1; i >= 0; i--) {
    const p = live[i];
    p.life -= dt;
    if (p.life <= 0) { p.s.visible = false; live.splice(i, 1); continue; }
    p.vel.y -= p.grav * dt;
    p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
    p.s.position.addScaledVector(p.vel, dt);
    if (p.s.position.y < PLATFORM_H + 0.02 && p.grav > 0 && Math.abs(p.s.position.x) < PLATFORM / 2 && Math.abs(p.s.position.z) < PLATFORM / 2) {
      p.s.position.y = PLATFORM_H + 0.02;
      p.vel.set(0, 0, 0);
    }
    const k = p.life / p.max;
    p.size += p.grow * dt;
    p.s.scale.setScalar(p.size);
    p.s.material.opacity = p.alpha * Math.min(1, k * 2.5);
  }
}

// =====================================================================================
// Sound: everything synthesised (taiko, wooden clappers, thuds, whooshes, the crowd).
// =====================================================================================
let audio = null;
export function ac() {
  if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (audio.state === 'suspended') audio.resume();
  return audio;
}
function noiseBuffer(a, secs) {
  const b = a.createBuffer(1, a.sampleRate * secs, a.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function noise(secs, { type = 'lowpass', freq = 800, q = 1, vol = 0.4, attack = 0.005, sweep = null, delay = 0 } = {}) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const src = a.createBufferSource();
  src.buffer = noiseBuffer(a, secs);
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + secs);
  f.Q.value = q;
  const gain = a.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + secs);
  src.connect(f).connect(gain).connect(a.destination);
  src.start(t);
}
function tone(freq, secs, { type = 'sine', vol = 0.4, to = null, delay = 0 } = {}) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + secs);
  const gain = a.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + secs);
  o.connect(gain).connect(a.destination);
  o.start(t);
  o.stop(t + secs);
}
export const sfx = {
  taiko(delay = 0) { tone(110, 0.6, { vol: 0.7, to: 48, delay }); noise(0.2, { freq: 300, vol: 0.35, delay }); },
  clack(delay = 0) { noise(0.06, { type: 'bandpass', freq: 2600, q: 6, vol: 0.9, delay }); },
  thud(k = 1) { tone(90, 0.25, { vol: 0.35 * k, to: 45 }); noise(0.18, { freq: 500, vol: 0.4 * k }); },
  slap() { noise(0.09, { type: 'bandpass', freq: 1400, q: 1.5, vol: 0.55 }); tone(160, 0.08, { vol: 0.2, to: 90 }); },
  whoosh() { noise(0.4, { type: 'bandpass', freq: 400, sweep: 1800, q: 1.2, vol: 0.25, attack: 0.08 }); },
  crowd(vol = 0.35) { noise(2.4, { type: 'bandpass', freq: 700, q: 0.6, vol, attack: 0.3 }); },
  salt() { noise(0.35, { type: 'highpass', freq: 3500, vol: 0.18, attack: 0.02 }); },
};
