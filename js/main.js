// Roast Royale: camera, animation, HUD, the tournament flow and the main loop.
import * as THREE from 'three';
import { RING_R, OUT_R, PLATFORM, PLATFORM_H, FIXED_DT, WINS_NEEDED, BOUT_NAMES, V2, rand, wrap, clamp, smoothstep } from './config.js';
import { renderer, scene, camera, canvas, updateBanners, BANNER_R } from './scene.js';
import { emit, updateParticles, sfx, shake, view, updateFlashes, excite } from './effects.js';
import { loadModel, poseChicken, debugRig, setSkin, renderPortraits } from './chicken.js';
import { ROSTER } from './roster.js';
import { buildRoster, setPortraits, renderSelect } from './select.js';
import { createOnline, groupRoom } from './online.js';
import { Wrestler, stepWrestler, collide, clock, contact } from './physics.js';
import { Brain } from './ai.js';
import { updateMusic, cheer, applause } from './music.js';
import { keys, pressed, pollPad, playerIntent, inputState, camDrag } from './input.js';

// =====================================================================================
// Camera: orbits behind your shoulder, framing both wrestlers; pulls back for charges,
// leans in for close shoves, shakes on impacts.
// =====================================================================================
const cam = { az: 0.6, dist: 13, el: 0.6, target: new THREE.Vector3(0, PLATFORM_H + 0.4, 0), chargeK: 0 };
function updateCamera(dt) {
  let wantDist = 12, wantEl = 0.42;
  const wantTarget = new THREE.Vector3(0, PLATFORM_H + 0.4, 0);
  if (game.phase === 'title' || game.phase === 'online') {
    cam.az += dt * 0.12;
  } else if (game.phase === 'select') {
    // Front-on to the two contenders standing in the ring.
    camera.position.set(0, PLATFORM_H + 1.5, 7.4);
    camera.lookAt(0, PLATFORM_H + 0.72, 0);
    cam.az = 0; cam.dist = 7.4; cam.target.set(0, PLATFORM_H + 0.72, 0);
    return;
  } else {
    const you = me(), rival = them();
    const mid = you.pos.clone().add(rival.pos).multiplyScalar(0.5).clampLength(0, RING_R);
    const sep = you.pos.distanceTo(rival.pos);
    const d = you.pos.clone().sub(rival.pos);
    if (sep > 0.8 && !you.done && !rival.done) {
      const wantAz = Math.atan2(d.x, d.y) + 1.05 + camDrag.yaw;   // three-quarters side-on to the clash, plus where you've dragged it
      cam.az = wrap(cam.az + wrap(wantAz - cam.az) * Math.min(1, dt * (camDrag.active ? 14 : game.phase === 'ready' ? 3 : 0.8)));
    }
    const charging = [player, cpu].some((w) => w.state === 'windup' || w.state === 'charge');
    cam.chargeK += ((charging ? 1 : 0) - cam.chargeK) * Math.min(1, dt * 2.5);
    const shoving = sep < 2.1 && [player, cpu].some((w) => w.state === 'push' || w.state === 'brace');
    wantDist = clamp(5.6 + sep * 0.85 + cam.chargeK * 2.2 - (shoving ? 0.8 : 0) - view.zoomPunch * 0.5, 5.2, 13);
    wantEl = clamp(0.3 + camDrag.pitch, 0.08, 1.2);   // low, side-on, so you can see their legs working
    wantTarget.set(mid.x, PLATFORM_H + 0.6, mid.y);
  }
  view.zoomPunch = Math.max(0, view.zoomPunch - dt * 2);
  cam.dist += (wantDist - cam.dist) * Math.min(1, dt * 2.2);
  cam.el += (wantEl - cam.el) * Math.min(1, dt * (camDrag.active ? 14 : 2));
  cam.target.lerp(wantTarget, Math.min(1, dt * 3));
  camera.position.set(
    cam.target.x + Math.sin(cam.az) * Math.cos(cam.el) * cam.dist,
    cam.target.y + Math.sin(cam.el) * cam.dist,
    cam.target.z + Math.cos(cam.az) * Math.cos(cam.el) * cam.dist,
  );
  // Never out among the banners: the camera stays well inside their ring.
  const out = Math.hypot(camera.position.x, camera.position.z), maxR = BANNER_R - 2;
  if (out > maxR) { camera.position.x *= maxR / out; camera.position.z *= maxR / out; }
  if (view.shake > 0.001) {
    camera.position.x += rand(-1, 1) * view.shake;
    camera.position.y += rand(-1, 1) * view.shake * 0.6;
    view.shake *= Math.exp(-dt * 9);
  }
  camera.lookAt(cam.target);
}

// =====================================================================================
// Animation: squash, lean, lunge, waddle and wobble from each wrestler's state.
// =====================================================================================
const SHIKO_LEG = 1.15;   // seconds per stamp
function animate(w, t, dt) {
  const v = w.vis, a = v.anim;
  let pitch = 0, roll = 0, lunge = 0, crouch = 0, squash = 1 + Math.sin(t * 2.1) * 0.012;   // breathing
  let armPose = w.vel.length() > 0.3 ? 'walk' : 'idle';
  let canWalk = true;
  switch (w.state) {
    case 'windup': crouch = 0.6 + 0.3 * w.charge; pitch = 0.12; squash = 0.94; armPose = 'windup'; break;
    case 'charge': pitch = 0.32; armPose = 'charge'; break;
    case 'recover': pitch = 0.18 + Math.sin(t * 14) * 0.06; roll = Math.sin(t * 10) * 0.08; armPose = 'flail'; break;
    case 'push': lunge = w.t < 0.12 ? (w.t / 0.12) * 0.22 : Math.max(0, 0.22 - (w.t - 0.12) * 1.3); pitch = 0.16; armPose = 'push'; break;
    case 'brace': crouch = 1; pitch = 0.1; squash = 0.95; roll = Math.sin(t * 30) * 0.01; armPose = 'brace'; break;
    case 'dodge': crouch = 0.3; roll = -w.dodgeDir * 0.35 * Math.sin(Math.min(1, w.t / 0.34) * Math.PI); armPose = 'dodge'; break;
    case 'stagger': pitch = -0.12; roll = Math.sin(t * 16) * 0.22 * Math.max(0, 1 - w.t / w.staggerFor); armPose = 'flail'; break;
    case 'down': roll = 1.45 * w.fallSign; pitch = -0.2; armPose = 'down'; canWalk = false; break;   // keeled over on its side
    case 'out': {
      // Tripped over the straw: a stumble back, then flat on its back, drumsticks and wings flapping.
      const ft = clock.t - w.doneAt;
      const tip = smoothstep(0.08, 0.5, ft);
      pitch = -0.25 * Math.sin(Math.min(1, ft / 0.12) * Math.PI) - 1.62 * tip;   // a lurch, then over backwards
      roll = 0.15 * w.fallSign * tip + (ft > 0.5 ? Math.sin(ft * 9) * 0.06 : 0);   // rocking on its back
      armPose = ft > 0.35 ? 'flap' : 'flail';
      canWalk = false;
      break;
    }
  }
  if (w.teeter > 0 && !w.done) { pitch += Math.sin(t * 12) * 0.12 * w.teeter; roll += Math.sin(t * 9) * 0.1 * w.teeter; armPose = 'flail'; }   // windmilling at the straw
  let shiko = null;
  if (game.phase === 'select' && w.shikoT !== undefined && w.shikoT < SHIKO_LEG * 2) {
    // Shiko: throw the weight over one leg, raise the other high out to the side, then stamp it down.
    const prevT = w.shikoT;
    w.shikoT += dt;
    const leg = w.shikoT < SHIKO_LEG ? 0 : 1;          // the chicken's right leg first, then its left
    const u = (w.shikoT % SHIKO_LEG) / SHIKO_LEG;
    const lift = u < 0.5 ? smoothstep(0, 0.5, u) : u < 0.6 ? 1 - (u - 0.5) / 0.1 : 0;
    const landing = u >= 0.6 ? Math.max(0, 1 - (u - 0.6) / 0.4) : 0;
    shiko = { leg, lift };
    roll = (leg ? 1 : -1) * 0.2 * lift;                 // lean away from the raised leg
    crouch = 0.25 * lift + 0.8 * landing;               // sink as it lands
    squash = 1 - 0.06 * landing;
    armPose = 'shiko';
    // The stamp itself: a thud and a puff of sand under the foot.
    if ((prevT % SHIKO_LEG) / SHIKO_LEG < 0.6 && u >= 0.6) {
      const side = (leg ? 1 : -1) * 0.32, h = w.heading;
      emit(new THREE.Vector3(w.pos.x + Math.cos(h) * side, PLATFORM_H + 0.05, w.pos.y - Math.sin(h) * side), 12,
        { colour: 0xd2b07a, speed: 1.4, up: 0.5, life: 0.6, grav: 2, size: 0.16, grow: 0.5, alpha: 0.5 });
      sfx.thud(0.7);
    }
  }
  if (game.phase === 'ready' && game.phaseT > 1.9) { crouch = 0.8; pitch = 0.12; armPose = 'brace'; }                                       // the crouch before the clash
  if (game.winner === w && (game.phase === 'decision' || game.phase === 'screen' || game.phase === 'champion')) {
    roll = Math.sin(game.realT * 3.2) * 0.12;                                                                                           // a victory shiko stomp
    armPose = 'victory';
  }
  const k = 1 - Math.exp(-dt * (w.done ? 5 : 14));
  a.pitch += (pitch - a.pitch) * k; a.roll += (roll - a.roll) * k; a.lunge += (lunge - a.lunge) * k;
  a.crouch += (crouch - a.crouch) * Math.min(1, dt * 10); a.squash += (squash - a.squash) * k;
  v.root.position.set(w.pos.x, w.y, w.pos.y);
  v.root.rotation.y = w.heading;
  // Top-heavy: when standing it balances leaning a little forward over its feet.
  v.body.rotation.set(a.pitch + (w.done ? 0 : 0.14), 0, a.roll);
  const onBack = Math.max(0, -a.pitch);   // how far it's gone over backwards
  // Tipping over pivots on the feet; lifted a little as it goes so it rolls onto its side, not into the sand.
  v.body.position.set(0, Math.abs(Math.sin(a.roll)) * 0.2 + Math.sin(Math.min(Math.PI / 2, onBack)) * 0.55, a.lunge - Math.sin(Math.min(Math.PI / 2, onBack)) * 0.5);
  poseChicken(v, w, dt, { crouch: a.crouch, squash: a.squash, armPose, canWalk, shiko });
  const ground = Math.abs(w.pos.x) < PLATFORM / 2 && Math.abs(w.pos.y) < PLATFORM / 2 ? PLATFORM_H : 0;
  v.blob.position.set(w.pos.x, ground + 0.012, w.pos.y);
  v.blob.material.opacity = 0.45 * clamp(1 - (w.y - ground) / 2, 0, 1);
  // Freshly roasted: a wisp of steam now and then.
  if ((v.steamIn = (v.steamIn ?? rand(0, 0.4)) - dt) <= 0) {
    v.steamIn = rand(0.25, 0.45);
    emit(new THREE.Vector3(w.pos.x + rand(-0.2, 0.2), w.y + 0.75, w.pos.y + rand(-0.2, 0.2)), 1,
      { colour: 0xffffff, speed: 0.08, up: 0.3, life: 2.2, grav: -0.05, drag: 0.3, size: 0.22, grow: 0.28, alpha: 0.13 });
  }
}

// =====================================================================================
// HUD
// =====================================================================================
const $ = (id) => document.getElementById(id);
const _q = new URLSearchParams(location.search);
const POSE = _q.has('pose') ? { state: _q.get('pose') || 'idle', az: Number(_q.get('az') || 0.6) } : null;
let calloutTimer = 0, gyojiTimer = 0;
function callout(html, secs = 1.4) { $('callout').innerHTML = html; $('callout').classList.add('show'); calloutTimer = secs; }
function gyoji(text, secs = 1.6) { $('gyoji').textContent = text; $('gyoji').classList.add('show'); gyojiTimer = secs; }
function updateHud(dt) {
  for (const [w, s] of [[player, 'p'], [cpu, 'a']]) {
    const b = Math.round(w.balance);
    $('fill-' + s).style.width = `${b}%`;
    $('pct-' + s).textContent = `${b}%`;
    $('meter-' + s).classList.toggle('danger', b > 75 && !w.done);
    $('brace-' + s).style.width = `${Math.round(w.braceStamina * 100)}%`;
    // Round record as sumo stars: white for a win, black for a loss.
    $('stars-' + s).textContent = game.results.map((r) => (r === s ? '○' : '●')).join(' ');
  }
  if ((calloutTimer -= dt) <= 0) $('callout').classList.remove('show');
  if ((gyojiTimer -= dt) <= 0) $('gyoji').classList.remove('show');
}

// =====================================================================================
// Who's wrestling whom. Blue (left meter) is you against the CPU, or the host online; red is the
// CPU, or the guest online. `me()` is whichever one this browser controls.
// =====================================================================================
const player = new Wrestler('BLUE', 0x1d2f6b);
const cpu = new Wrestler('RED', 0x7a1a2a);
const brain = new Brain(cpu, player);
const game = { phase: 'title', bout: 1, wins: { p: 0, a: 0 }, results: [], phaseT: 0, realT: 0, timeScale: 1, pending: null, winner: null, cues: [], rematch: false, lastNokotta: 0, decision: null };
const match = { mode: 'cpu', side: 'p', picks: [0, 1], room: null };
const me = () => (match.side === 'a' ? cpu : player);
const them = () => (match.side === 'a' ? player : cpu);
const sideOf = (w) => (w === player ? 'p' : 'a');
const online = { net: null, players: [], remote: { move: new V2(), charge: false, brace: false, push: false, dodge: false }, sendIn: 0 };
const isGuest = () => match.mode === 'online' && online.net && !online.net.isHost;
const label = (w) => (w === me() ? 'YOU' : w.kind.name);
const who = (w) => (w === me() ? 'YOU' : match.mode === 'online' ? 'YOUR MATE' : 'CPU');

function setKinds(blue, red) {
  match.picks = [blue, red];
  player.kind = ROSTER[blue];
  cpu.kind = ROSTER[red];
  setSkin(player.vis, player.kind.skin);
  setSkin(cpu.vis, cpu.kind.skin);
  for (const [w, s] of [[player, 'p'], [cpu, 'a']]) {
    $('name-' + s).textContent = w.kind.name;
    $('rank-' + s).textContent = `${who(w)} · ${w.kind.rank}`;
  }
}
setKinds(0, 1);

loadModel((text) => { $('load-note').textContent = text; }, () => {
  setPortraits(renderPortraits(ROSTER.map((c) => c.skin)));
});
$('load-note').textContent = 'Preheating the oven...';

// =====================================================================================
// Screens: title (choose a mode), online (create or join a ring), select (choose a chicken)
// =====================================================================================
const SCREENS = ['title', 'online', 'select', 'decision'];
function showScreen(id) {
  SCREENS.forEach((s) => { $(s).hidden = s !== id; });
  $('hud').hidden = !!id;
  inputState.inGame = !id;
}

let titleFocus = 0;
function focusTitle(i) {
  titleFocus = (i + 2) % 2;
  $('mode-cpu').classList.toggle('focus', titleFocus === 0);
  $('mode-online').classList.toggle('focus', titleFocus === 1);
}
focusTitle(0);

function goTitle(note = '') {
  if (match.mode === 'online' && online.net) online.net.leave();
  match.mode = 'cpu';
  match.side = 'p';
  game.phase = 'title';
  showScreen('title');
  $('load-note').textContent = note;
  history.replaceState(null, '', basePath());
}

function basePath() { return location.pathname.replace(/[^/]*$/, ''); }

// ---------- Choose your chicken ----------
const sel = { i: 0, locked: false, cpuI: 1, cpuLocked: false, cpuT: 0, startIn: 0 };
// Clicking a chicken chooses it; READY (or Enter) confirms. Changing your mind un-readies you.
buildRoster((i) => {
  if (game.phase !== 'select' || i === sel.i) return;
  sel.i = i;
  sel.locked = false;
  sfx.clack();
  sendPick();
  drawSelect();
});
$('select-back').addEventListener('click', () => { if (game.phase === 'select') goTitle(); });
$('ready-btn').addEventListener('click', () => { if (game.phase === 'select') (sel.locked ? unlock : lockIn)(); });

function goSelect() {
  game.phase = 'select';
  game.phaseT = 0;
  Object.assign(sel, { locked: false, cpuLocked: false, cpuT: 0, startIn: 0 });
  if (match.mode === 'cpu') sel.cpuI = 1 + ((Math.random() * (ROSTER.length - 1)) | 0);
  showScreen('select');
  $('room-bar').hidden = match.mode !== 'online';
  // The two contenders stand side by side in the ring, facing you.
  player.reset(-0.85, 0.35);
  cpu.reset(0.85, -0.35);
  for (const w of [player, cpu]) w.fallSign = 1;
  game.winner = null;
  game.results = [];
  sendPick();
  drawSelect();
}

function moveCursor(d) {
  sel.locked = false;
  sel.i = (sel.i + d + ROSTER.length) % ROSTER.length;
  sfx.clack();
  sendPick();
  drawSelect();
}

function lockIn() {
  if (sel.locked) return;
  if (match.mode === 'online' && online.players.length < 2) { $('room-status').textContent = 'Waiting for your mate to arrive...'; }
  sel.locked = true;
  sfx.taiko();
  if (match.mode === 'cpu') { sel.cpuT = 0; if (sel.cpuLocked) sel.startIn = 1.3; }
  sendPick();
  drawSelect();
}

function unlock() {
  if (!sel.locked) return false;
  sel.locked = false;
  sendPick();
  drawSelect();
  return true;
}

function sendPick() {
  if (match.mode === 'online' && online.net) online.net.send({ type: 'pick', pick: sel.i, locked: sel.locked });
}

function drawSelect() {
  const mine = { i: sel.i, locked: sel.locked, tag: 'YOU' };
  let other;
  if (match.mode === 'cpu') {
    other = { i: sel.cpuI, locked: sel.cpuLocked, tag: 'CPU' };
  } else {
    const o = online.players.find((p) => p.id !== online.net.id);
    other = o ? { i: o.pick, locked: o.locked, tag: 'YOUR MATE' } : { i: null, locked: false, tag: 'YOUR MATE', waiting: 'WAITING...' };
  }
  const sides = match.side === 'p' ? { p: mine, a: other } : { p: other, a: mine };
  renderSelect(sides);
  $('ready-btn').classList.toggle('on', sel.locked);

  // The two chickens in the ring wear the picks (and crouch once locked in).
  const blue = sides.p.waiting ? player.kind : ROSTER[sides.p.i];
  const red = sides.a.waiting ? cpu.kind : ROSTER[sides.a.i];
  const was = [player.kind, cpu.kind];
  setKinds(ROSTER.indexOf(blue), ROSTER.indexOf(red));
  // A newly chosen chicken shows itself off with a shiko: right leg, then left.
  if (player.kind !== was[0] || game.phaseT < 0.05) player.shikoT = 0;
  if (cpu.kind !== was[1] || game.phaseT < 0.05) cpu.shikoT = 0;
  player.set(sides.p.locked ? 'brace' : 'idle');
  cpu.set(sides.a.locked ? 'brace' : 'idle');
  if (match.mode === 'online') {
    const n = online.players.length;
    $('room-status').textContent = n < 2 ? 'Waiting for your mate. Send them the code or link.'
      : sel.locked && !other.locked ? 'Waiting for your mate to choose...'
        : !sel.locked ? 'Your mate is here. Choose your chicken.' : 'Both ready!';
  }
}

function updateSelect(real) {
  if (match.mode !== 'cpu') return;
  // The CPU waits on its rival until you've chosen, then locks in (picking someone else if you took it).
  if (!sel.locked) return;
  if (!sel.cpuLocked) {
    sel.cpuT += real;
    if (sel.cpuT > 0.7) {
      if (sel.cpuI === sel.i) {
        const others = ROSTER.map((_, i) => i).filter((i) => i !== sel.i);
        sel.cpuI = others[(Math.random() * others.length) | 0];
      }
      sel.cpuLocked = true;
      sel.startIn = 1.3;
      sfx.taiko(0.05);
      drawSelect();
    }
    return;
  }
  if ((sel.startIn -= real) <= 0) beginTournament();
}

// =====================================================================================
// The tournament: best of three rounds, then the champion. The CPU game and the online host decide
// everything; an online guest is told what happened ('flow') and draws the host's fight ('snap').
// =====================================================================================
const FLAVOUR = {
  YORIKIRI: ['Escorted from the ring with the full dignity of a Sunday roast.', 'The straw bales could not save them. Few things can.', 'A textbook expulsion. The elders nod gravely.'],
  KOPPORI: ['Toppled like an over-stuffed centrepiece.', 'The legs have gone. Both of them. Drumsticks to the sky.', 'Balance, once lost, is rarely re-basted.'],
  ISAMIASHI: ['Stepped out under their own enthusiasm. A lesson in restraint.', 'Overcommitted, overcooked, over the line.', 'The ring is small. Their ambition was not.'],
};
const pick = (a) => a[(Math.random() * a.length) | 0];
const flow = (msg) => { if (match.mode === 'online' && online.net && online.net.isHost) online.net.send({ type: 'flow', ...msg }); };

function boutTitle() {
  return `Round ${game.bout}${game.rematch ? ' (Rematch)' : ''}`;
}

function beginTournament() {
  Object.assign(game, { bout: 1, wins: { p: 0, a: 0 }, results: [], rematch: false });
  startBout();
}

function startBout() {
  flow({ kind: 'bout', bout: game.bout, wins: game.wins, results: game.results, rematch: game.rematch, picks: match.picks });
  showScreen(null);
  canvas.focus();
  player.reset(-1.45, Math.PI / 2);
  cpu.reset(1.45, -Math.PI / 2);
  player.fallSign = cpu.fallSign = 1;
  brain.reset();
  brain.level = clamp(0.55 + 0.22 * (game.bout - 1), 0, 1);
  game.phase = 'ready';
  game.phaseT = 0;
  game.pending = null;
  game.winner = null;
  game.timeScale = 1;
  $('bout-name').textContent = boutTitle();
  const throwSalt = (w) => {
    sfx.salt();
    const dir = new THREE.Vector3(-w.pos.x, 0, -w.pos.y).normalize().multiplyScalar(0.6);
    emit(new THREE.Vector3(w.pos.x, PLATFORM_H + 1.1, w.pos.y), 40, { colour: 0xffffff, speed: 1.2, up: 2.4, life: 1.4, grav: 5, drag: 0.6, size: 0.045, dir });
  };
  game.cues = [
    { at: 0.05, fn: () => { sfx.clack(); sfx.clack(0.18); callout(`ROUND ${game.bout}<small>${BOUT_NAMES[Math.min(game.bout, 3) - 1].toUpperCase()}${game.rematch ? ' · REMATCH' : ''}</small>`, 1.6); } },
    { at: 1.0, fn: () => { throwSalt(player); throwSalt(cpu); gyoji('The ring is purified with salt.', 1.2); } },
    { at: 2.0, fn: () => { callout('HAKKEYOI!', 1.0); sfx.taiko(); } },
    { at: 3.1, fn: () => { excite(5); callout('NOKOTTA!', 0.9); sfx.taiko(); sfx.taiko(0.12); sfx.crowd(0.25); game.phase = 'fight'; } },
  ];
  game.rematch = false;
}

const idle = () => ({ move: new V2(), face: null, charge: false, push: false, brace: false, dodge: false });

// After each physics step: has anyone toppled or left the ring?
function checkEvents() {
  for (const w of [player, cpu]) {
    if (w.done) continue;
    if (w.balance >= 100) {
      w.set('down');
      w.fallSign = Math.random() < 0.5 ? -1 : 1;
      w.doneAt = clock.t;
      w.how = 'KOPPORI';
      sfx.thud(1.2);
      shake(0.25);
    } else if (w.pos.length() > OUT_R) {
      w.set('out');
      w.fallSign = Math.random() < 0.5 ? -1 : 1;
      w.doneAt = clock.t;
      const lh = w.lastHit;
      w.how = lh && clock.t - lh.at < 1.6 ? 'YORIKIRI' : 'ISAMIASHI';
    }
    if (w.done && !game.pending) game.pending = { at: clock.t };
  }
}

function decide() {
  const fallen = [player, cpu].filter((w) => w.done).sort((a, b) => a.doneAt - b.doneAt);
  if (fallen.length === 2 && fallen[1].doneAt - fallen[0].doneAt < 0.12) {
    game.decision = { kimarite: 'MONO-II!', gloss: 'THE JUDGES CONFER', winner: null, flavour: 'Both athletes left the contest at the same instant. Torn between them, the judges order the round fought again.' };
    game.rematch = true;
  } else {
    const loser = fallen[0];
    const winner = loser === player ? cpu : player;
    const key = sideOf(winner);
    game.wins[key]++;
    game.results.push(key);
    const gloss = { YORIKIRI: 'FORCED OUT OF THE RING', KOPPORI: 'TOPPLED · BALANCE LOST', ISAMIASHI: 'STEPPED OUT UNASSISTED' }[loser.how];
    game.decision = { kimarite: `${loser.how}!`, gloss, winner: key, flavour: pick(FLAVOUR[loser.how]) };
  }
  flow({ kind: 'decision', decision: game.decision, wins: game.wins, results: game.results, rematch: game.rematch });
  enterDecision();
}

function enterDecision() {
  excite(12);
  cheer(true);
  game.winner = game.decision.winner ? (game.decision.winner === 'p' ? player : cpu) : null;
  game.phase = 'decision';
  game.phaseT = 0;
  game.timeScale = 0.28;   // the slow, solemn replay of the moment it ended
  sfx.crowd(0.45);
}

const tally = () => `${label(player)} ${game.wins.p} · ${game.wins.a} ${label(cpu)}`;
const waitCta = () => (isGuest() ? 'WAITING FOR YOUR MATE TO CONTINUE...' : null);

// The winning technique, written as it would be on the banzuke.
const KANJI = { 'YORIKIRI!': '寄り切り', 'KOPPORI!': 'こっぽり', 'ISAMIASHI!': '勇み足', 'MONO-II!': '物言い', 'YŪSHŌ': '優勝' };
function showDecision() {
  const d = game.decision;
  $('dec-gloss').textContent = d.gloss;
  $('dec-kimarite').textContent = d.kimarite;
  $('dec-kanji').textContent = KANJI[d.kimarite] || '';
  $('dec-winner').textContent = d.winner ? `WINNER: ${label(d.winner === 'p' ? player : cpu)}` : 'NO DECISION';
  $('dec-flavour').textContent = '';
  $('dec-tally').textContent = tally();
  $('dec-cta').textContent = waitCta() || 'PRESS ENTER TO CONTINUE';
  showScreen('decision');
}

const CHAMPION_WAIT = 10;   // seconds on the champion screen
function showChampion() {
  const champ = game.wins.p > game.wins.a ? player : cpu;
  game.winner = champ;
  const youWon = champ === me();
  $('dec-gloss').textContent = 'THE TOURNAMENT IS DECIDED';
  $('dec-kimarite').textContent = 'YŪSHŌ';
  $('dec-kanji').textContent = KANJI['YŪSHŌ'];
  $('dec-winner').textContent = `CHAMPION: ${label(champ)}`;
  $('dec-flavour').textContent = youWon
    ? 'The Emperor\'s Cup is presented, with gravy. A new yokozuna of the rotisserie is crowned.'
    : `${champ.kind.name} takes the Emperor's Cup, as is tradition. Return when you are better seasoned.`;
  $('dec-tally').textContent = tally();
  showScreen('decision');
  game.phase = 'champion';
  game.phaseT = 0;
  sfx.taiko(); sfx.taiko(0.25); sfx.taiko(0.5);
  applause();
}

function updateFlow(real) {
  game.phaseT += real;
  switch (game.phase) {
    case 'select':
      updateSelect(real);
      break;
    case 'ready':
    case 'fight':
      for (const c of game.cues) if (!c.done && game.phaseT >= c.at) { c.done = true; c.fn(); }
      if (game.phase !== 'fight') break;
      // The referee urges them on when they're locked together.
      if (contact.t > 0.9 && game.realT - game.lastNokotta > 3) { gyoji('Nokotta, nokotta!'); game.lastNokotta = game.realT; }
      contact.t = Math.max(0, contact.t - real * 0.4);
      if (!isGuest() && game.pending && clock.t - game.pending.at >= 0.15) decide();
      break;
    case 'decision':
      if (game.phaseT > 1.4) { game.timeScale = 1; showDecision(); game.phase = 'screen'; game.phaseT = 0; }
      break;
    case 'screen':
      if (pressed.start && game.phaseT > 0.5 && !isGuest()) {
        if (game.wins.p >= WINS_NEEDED || game.wins.a >= WINS_NEEDED) { flow({ kind: 'champion', wins: game.wins, results: game.results }); showChampion(); }
        else { if (!game.rematch) game.bout++; startBout(); }
      }
      break;
    case 'champion': {
      // Back to choosing a chicken after 10 seconds (or sooner, with Enter).
      const left = Math.max(0, Math.ceil(CHAMPION_WAIT - game.phaseT));
      $('dec-cta').textContent = isGuest() ? `CHOOSE YOUR CHICKEN IN ${left}` : `PRESS ENTER TO CHOOSE AGAIN · ${left}`;
      if (!isGuest() && ((pressed.start && game.phaseT > 0.5) || game.phaseT >= CHAMPION_WAIT)) { flow({ kind: 'select' }); goSelect(); }
    }
      break;
  }
}

// =====================================================================================
// Online
// =====================================================================================
const STATES = ['idle', 'windup', 'charge', 'recover', 'push', 'brace', 'dodge', 'stagger', 'down', 'out'];
const r3 = (v) => Math.round(v * 1000) / 1000;
function packW(w) {
  return [w.pos.x, w.pos.y, w.vel.x, w.vel.y, w.heading, w.turnVel, w.y, w.vy, w.balance, w.braceStamina, STATES.indexOf(w.state), w.t,
    w.charge, w.teeter, w.dodgeDir, w.staggerFor || 0, w.fallSign, w.doneAt || 0, w.ghost].map(r3);
}
function unpackW(w, a) {
  const was = w.state, bal = w.balance;
  w.pos.set(a[0], a[1]); w.vel.set(a[2], a[3]); w.heading = a[4]; w.turnVel = a[5]; w.y = a[6]; w.vy = a[7];
  w.balance = a[8]; w.braceStamina = a[9]; w.state = STATES[a[10]] || 'idle'; w.t = a[11]; w.charge = a[12]; w.teeter = a[13];
  w.dodgeDir = a[14]; w.staggerFor = a[15]; w.fallSign = a[16]; w.doneAt = a[17]; w.ghost = a[18];
  // The host's sounds and dust, worked out from what changed.
  if (w.state !== was) {
    if (w.state === 'charge') sfx.whoosh();
    else if (w.state === 'dodge') sfx.whoosh();
    else if (w.state === 'down' || w.state === 'out') { sfx.thud(1); shake(0.2); }
  }
  if (w.balance - bal > 6) {
    sfx.thud(Math.min(1.3, (w.balance - bal) / 14));
    shake(Math.min(0.3, (w.balance - bal) * 0.015));
    emit(new THREE.Vector3(w.pos.x, PLATFORM_H + 0.5, w.pos.y), 10, { colour: 0xc8842c, speed: 2.4, up: 2, life: 0.7, size: 0.05 });
    if (w.balance - bal > 14) { excite(3); cheer(); }
  }
}

function onLobby(payload) {
  online.players = payload.players;
  const mine = payload.players.find((p) => p.id === online.net.id);
  if (mine) match.side = mine.slot === 2 ? 'a' : 'p';
  match.room = payload.roomCode;
  $('room-code').textContent = payload.roomCode;
  history.replaceState(null, '', `${basePath()}?room=${encodeURIComponent(payload.roomCode.toLowerCase())}`);
  const inMatch = !['title', 'online', 'select'].includes(game.phase);
  if (inMatch && payload.players.length < 2) {
    callout('YOUR MATE HAS LEFT<small>THE RING AWAITS A NEW CHALLENGER</small>', 2.4);
    goSelect();
    return;
  }
  if (game.phase === 'select') {
    if (mine) { sel.i = mine.pick; sel.locked = mine.locked; }
    drawSelect();
    // Both locked in: the host starts the tournament.
    if (online.net.isHost && payload.players.length === 2 && payload.players.every((p) => p.locked) && !payload.started) online.net.start();
  }
}

function joined(res) {
  if (!res.ok) { $('online-status').textContent = res.error || "Couldn't get into the ring."; $('online-status').classList.add('error'); return; }
  match.mode = 'online';
  $('online-status').textContent = '';
  onLobby(res);
  goSelect();
}

online.net = createOnline({
  lobbyUpdate: (p) => { if (match.mode === 'online') onLobby(p); },
  gameStarted: (p) => {
    const blue = p.players.find((q) => q.slot === 1), red = p.players.find((q) => q.slot === 2);
    setKinds(blue ? blue.pick : 0, red ? red.pick : 0);
    if (online.net.isHost) beginTournament();
  },
  pad: (m) => {
    const r = online.remote;
    r.move.set(m.m[0], m.m[1]).clampLength(0, 1);
    r.charge = !!m.c; r.brace = !!m.b;
    if (m.p) r.push = true;
    if (m.d) r.dodge = true;
  },
  snap: (m) => {
    if (!isGuest()) return;
    clock.t = m.c; contact.t = m.ct; game.timeScale = m.ts;
    unpackW(player, m.w[0]);
    unpackW(cpu, m.w[1]);
    if (m.ph === 'fight' && game.phase === 'ready') { game.phase = 'fight'; game.cues.forEach((c) => { if (!c.done) { c.done = true; c.fn(); } }); }
  },
  flow: (f) => {
    if (!isGuest()) return;
    if (f.kind === 'bout') {
      setKinds(f.picks[0], f.picks[1]);
      Object.assign(game, { bout: f.bout, wins: f.wins, results: f.results, rematch: f.rematch });
      startBout();
    } else if (f.kind === 'decision') {
      Object.assign(game, { decision: f.decision, wins: f.wins, results: f.results, rematch: f.rematch });
      enterDecision();
    } else if (f.kind === 'champion') {
      Object.assign(game, { wins: f.wins, results: f.results });
      showChampion();
    } else if (f.kind === 'select') {
      goSelect();
    }
  },
  status: (text) => { if (game.phase === 'online') $('online-status').textContent = text; },
  reconnecting: () => { callout('THE HOST HAS LEFT<small>RECONNECTING...</small>', 2); },
  rejoined: (res) => { if (res.ok) { onLobby(res); goSelect(); } },
  disconnect: (reason) => { if (match.mode === 'online') goTitle(reason || 'Disconnected from the ring.'); },
});

// Guest: send your controls to the host about 30 times a second (clicks and taps always get through).
function sendPad(real) {
  if (!isGuest() || game.phase !== 'fight') return;
  online.sendIn -= real;
  if (online.sendIn > 0 && !pressed.push && !pressed.dodge) return;
  online.sendIn = 1 / 30;
  const it = playerIntent(cam.az);
  online.net.send({ type: 'pad', m: [r3(it.move.x), r3(it.move.y)], c: it.charge, b: it.brace, p: it.push, d: it.dodge });
  pressed.push = pressed.dodge = false;
}
// Host: send the fight's state to your mate about 30 times a second.
function sendSnap(real) {
  if (match.mode !== 'online' || !online.net || !online.net.isHost || online.players.length < 2) return;
  if (!['ready', 'fight', 'decision', 'screen', 'champion'].includes(game.phase)) return;
  online.sendIn -= real;
  if (online.sendIn > 0) return;
  online.sendIn = 1 / 30;
  online.net.send({ type: 'snap', c: r3(clock.t), ct: r3(contact.t), ts: game.timeScale, ph: game.phase, w: [packW(player), packW(cpu)] });
}

// =====================================================================================
// Menus: keyboard, mouse and gamepad
// =====================================================================================
function chooseCpu() {
  sfx.clack();
  match.mode = 'cpu';
  match.side = 'p';
  goSelect();
}
function chooseOnline() {
  sfx.clack();
  if (!online.net) { $('load-note').textContent = "Online play needs an internet connection (PeerJS couldn't load)."; return; }
  game.phase = 'online';
  showScreen('online');
  $('online-status').textContent = '';
  $('online-status').classList.remove('error');
  setTimeout(() => $('code-input').focus(), 50);
}
function busy(text) { $('online-status').classList.remove('error'); $('online-status').textContent = text; }
$('mode-cpu').addEventListener('click', chooseCpu);
$('mode-online').addEventListener('click', chooseOnline);
$('mode-cpu').addEventListener('mouseenter', () => focusTitle(0));
$('mode-online').addEventListener('mouseenter', () => focusTitle(1));
$('create-btn').addEventListener('click', () => { busy('Building the ring...'); online.net.create(joined); });
$('join-btn').addEventListener('click', () => {
  const code = $('code-input').value.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) { $('online-status').textContent = 'Ring codes are 4 letters.'; $('online-status').classList.add('error'); return; }
  busy('Looking for the ring...');
  online.net.join(code, joined);
});
$('code-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.stopPropagation(); $('join-btn').click(); } });
$('online-back').addEventListener('click', () => goTitle());
$('copy-link').addEventListener('click', async () => {
  const link = `${location.origin}${basePath()}${(match.room || '').toLowerCase()}`;
  try { await navigator.clipboard.writeText(link); } catch { /* copied below */ }
  $('copy-link').querySelector('b').textContent = 'COPIED!';
  setTimeout(() => { $('copy-link').querySelector('b').textContent = 'COPY INVITE LINK'; }, 1500);
});

addEventListener('keydown', (e) => {
  if (POSE || (e.target && e.target.tagName === 'INPUT')) return;
  const k = e.key;
  // Menus handle Enter themselves (so choosing a mode doesn't also lock in a chicken).
  if (k === 'Enter' && ['title', 'online', 'select'].includes(game.phase)) pressed.start = false;   // (input.js's listener runs first)
  if (game.phase === 'title') {
    if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'w' || k === 's' || k === 'ArrowLeft' || k === 'ArrowRight') { focusTitle(titleFocus + 1); e.preventDefault(); }
    if (k === 'Enter') (titleFocus === 0 ? chooseCpu : chooseOnline)();
  } else if (game.phase === 'online') {
    if (k === 'Escape') goTitle();
  } else if (game.phase === 'select') {
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') moveCursor(-1);
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') moveCursor(1);
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); lockIn(); }
    else if (k === 'Escape' && !unlock()) goTitle();
  }
});

// A link room (/roast-royale/mate, ?room=mate) or an embedding app's ?group=<id> goes straight in.
{
  const requested = _q.get('room') || groupRoom(_q.get('group'));
  if (requested && online.net && !POSE) {
    if (!online.net.normalise(requested)) $('load-note').textContent = 'Ring names are 2-16 letters, numbers or dashes.';
    else {
      chooseOnline();
      busy('Entering the ring...');
      online.net.enter(requested, joined);
    }
  }
}

// =====================================================================================
// Main loop: fixed-step physics, everything else per frame.
// =====================================================================================
player.reset(-1.45, Math.PI / 2);
cpu.reset(1.45, -Math.PI / 2);
player.fallSign = cpu.fallSign = 1;
let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  tick(now, true);
}
// Browsers stop animation frames in background tabs (and slow their timers to once a second).
// An online match keeps going there on a worker's timer, about 30 a second without drawing,
// so the host tabbing away doesn't freeze the fight.
{
  const beat = () => { if (document.hidden && match.mode === 'online') tick(performance.now(), false); };
  try {
    const src = 'setInterval(() => postMessage(0), 33);';
    new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))).onmessage = beat;
  } catch { setInterval(beat, 33); }
}
function tick(now, draw) {
  const real = Math.min(0.1, (now - last) / 1000);
  last = now;
  game.realT += real;
  pollPad();
  if (game.phase === 'title' && pressed.start && !POSE) { pressed.start = false; (titleFocus === 0 ? chooseCpu : chooseOnline)(); }
  if (game.phase === 'select' && pressed.start) { pressed.start = false; lockIn(); }
  updateFlow(real);
  updateMusic(game.phase, real);

  // ?pose=push (or brace, windup, charge, dodge, idle, out): a close-up of your chicken holding that pose.
  if (POSE) {
    if (game.phase === 'title' && pressed.start) beginTournament();
    player.pos.set(0, 0); player.vel.set(0, 0); player.heading = 0.6;
    if (POSE.state === 'out') {
      if (player.state !== 'out' || clock.t - player.doneAt > 3) { player.set('out'); player.doneAt = clock.t; player.fallSign = 1; }
    } else if (player.state !== POSE.state || player.t > 0.2) { player.set(POSE.state); player.t = 0.1; player.charge = 1; }
    cpu.pos.set(0, 9); cpu.vel.set(0, 0);
  }

  if (isGuest()) {
    // Online guest: no physics here, just the host's state moved on smoothly between updates.
    sendPad(real);
    if (['ready', 'fight', 'decision', 'screen', 'champion'].includes(game.phase)) {
      const k = real * game.timeScale;
      for (const w of [player, cpu]) { w.pos.addScaledVector(w.vel, k); w.t += k; }
      clock.t += k;
    }
  } else {
    const simulate = ['fight', 'decision', 'screen', 'champion', 'title', 'online'].includes(game.phase);
    if (simulate) {
      acc += real * game.timeScale;
      let steps = 0;
      const remote = match.mode === 'online';
      while (acc >= FIXED_DT && steps < 24) {
        const fighting = game.phase === 'fight';
        const pi = fighting ? playerIntent(cam.az) : idle();
        const ci = !fighting ? idle() : remote ? { ...online.remote, face: null } : brain.think(FIXED_DT);
        if (steps > 0) pi.push = pi.dodge = false;   // a click or tap counts once
        if (remote) online.remote.push = online.remote.dodge = false;
        stepWrestler(player, pi, cpu, FIXED_DT);
        stepWrestler(cpu, ci, player, FIXED_DT);
        collide(player, cpu);
        clock.t += FIXED_DT;
        if (fighting && !POSE) checkEvents();
        acc -= FIXED_DT;
        steps++;
      }
      if (steps > 0) pressed.push = pressed.dodge = false;
    } else {
      acc = 0;
    }
    sendSnap(real);
  }
  if (game.phase !== 'fight') pressed.push = pressed.dodge = false;
  pressed.start = false;

  animate(player, game.realT, real);
  animate(cpu, game.realT + 1.7, real);
  updateParticles(real * Math.max(0.35, game.timeScale));
  // More cameras going off when it's tense (locked together, or a big moment).
  updateFlashes(real, game.phase === 'fight' ? 1 + Math.min(2, contact.t) : 0.6);
  updateCamera(real);
  if (POSE) { camera.position.set(Math.sin(POSE.az) * 2.6, PLATFORM_H + 1.1, Math.cos(POSE.az) * 2.6); camera.lookAt(0, PLATFORM_H + 0.7, 0); }
  updateBanners();
  updateHud(real);
  if (draw) renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// For testing in the console: window.roast.game, .player, .cpu
window.roast = { game, player, cpu, brain, match, online, startBout, beginTournament, debugRig };
