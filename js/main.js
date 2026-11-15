// Roast Royale: camera, animation, HUD, the tournament flow and the main loop.
import * as THREE from 'three';
import { RING_R, OUT_R, PLATFORM, PLATFORM_H, FIXED_DT, WINS_NEEDED, BOUT_NAMES, V2, rand, wrap, clamp, smoothstep } from './config.js';
import { renderer, scene, camera, canvas } from './scene.js';
import { emit, updateParticles, sfx, shake, view, updateFlashes, excite } from './effects.js';
import { loadModel, poseChicken, debugRig } from './chicken.js';
import { Wrestler, stepWrestler, collide, clock, contact } from './physics.js';
import { Brain } from './ai.js';
import { keys, pressed, pollPad, playerIntent, inputState, camDrag } from './input.js';

// =====================================================================================
// Camera: orbits behind your shoulder, framing both wrestlers; pulls back for charges,
// leans in for close shoves, shakes on impacts.
// =====================================================================================
const cam = { az: 0.6, dist: 13, el: 0.6, target: new THREE.Vector3(0, PLATFORM_H + 0.4, 0), chargeK: 0 };
function updateCamera(dt) {
  let wantDist = 12, wantEl = 0.42;
  const wantTarget = new THREE.Vector3(0, PLATFORM_H + 0.4, 0);
  if (game.phase === 'title') {
    cam.az += dt * 0.12;
  } else {
    const mid = player.pos.clone().add(cpu.pos).multiplyScalar(0.5).clampLength(0, RING_R);
    const sep = player.pos.distanceTo(cpu.pos);
    const d = player.pos.clone().sub(cpu.pos);
    if (sep > 0.8 && !player.done && !cpu.done) {
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
  poseChicken(v, w, dt, { crouch: a.crouch, squash: a.squash, armPose, canWalk });
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
    // Bout record as sumo stars: white for a win, black for a loss.
    $('stars-' + s).textContent = game.results.map((r) => (r === s ? '○' : '●')).join(' ');
  }
  if ((calloutTimer -= dt) <= 0) $('callout').classList.remove('show');
  if ((gyojiTimer -= dt) <= 0) $('gyoji').classList.remove('show');
}

// =====================================================================================
// The tournament: title, bouts (best of three), decisions, champion
// =====================================================================================
loadModel((text) => { $('load-note').textContent = text; });
$('load-note').textContent = 'Preheating the oven...';
const player = new Wrestler('PLAYER', 0x1d2f6b);
const cpu = new Wrestler('CHICKOZUNA', 0x7a1a2a);
const brain = new Brain(cpu, player);
const game = { phase: 'title', bout: 1, wins: { p: 0, a: 0 }, results: [], phaseT: 0, realT: 0, timeScale: 1, pending: null, winner: null, cues: [], rematch: false, lastNokotta: 0 };

const FLAVOUR = {
  YORIKIRI: ['Escorted from the ring with the full dignity of a Sunday roast.', 'The straw bales could not save them. Few things can.', 'A textbook expulsion. The elders nod gravely.'],
  KOPPORI: ['Toppled like an over-stuffed centrepiece.', 'The legs have gone. Both of them. Drumsticks to the sky.', 'Balance, once lost, is rarely re-basted.'],
  ISAMIASHI: ['Stepped out under their own enthusiasm. A lesson in restraint.', 'Overcommitted, overcooked, over the line.', 'The ring is small. Their ambition was not.'],
};
const pick = (a) => a[(Math.random() * a.length) | 0];

function boutTitle() {
  return `Round ${game.bout}: ${BOUT_NAMES[Math.min(game.bout, BOUT_NAMES.length) - 1]}${game.rematch ? ' (Rematch)' : ''}`;
}

function startBout() {
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
  excite(12);
  const fallen = [player, cpu].filter((w) => w.done).sort((a, b) => a.doneAt - b.doneAt);
  game.phase = 'decision';
  game.phaseT = 0;
  game.timeScale = 0.28;   // the slow, solemn replay of the moment it ended
  sfx.crowd(0.45);
  if (fallen.length === 2 && fallen[1].doneAt - fallen[0].doneAt < 0.12) {
    game.decision = { kimarite: 'MONO-II!', gloss: 'THE JUDGES CONFER', winner: 'NO DECISION', flavour: 'Both athletes left the contest at the same instant. Torn between them, the judges order the round fought again.' };
    game.winner = null;
    game.rematch = true;
    return;
  }
  const loser = fallen[0];
  const winner = loser === player ? cpu : player;
  game.winner = winner;
  const key = winner === player ? 'p' : 'a';
  game.wins[key]++;
  game.results.push(key);
  const gloss = { YORIKIRI: 'FORCED OUT OF THE RING', KOPPORI: 'TOPPLED · BALANCE LOST', ISAMIASHI: 'STEPPED OUT UNASSISTED' }[loser.how];
  game.decision = { kimarite: `${loser.how}!`, gloss, winner: `WINNER: ${winner.name}`, flavour: pick(FLAVOUR[loser.how]) };
}

function showDecision() {
  const d = game.decision;
  $('dec-gloss').textContent = d.gloss;
  $('dec-kimarite').textContent = d.kimarite;
  $('dec-winner').textContent = d.winner;
  $('dec-flavour').textContent = d.flavour;
  $('dec-tally').textContent = `YOU ${game.wins.p} · ${game.wins.a} CHICKOZUNA`;
  $('dec-cta').textContent = 'PRESS ENTER TO CONTINUE';
  $('decision').hidden = false;
}

function showChampion() {
  const won = game.wins.p > game.wins.a;
  $('dec-gloss').textContent = 'THE TOURNAMENT IS DECIDED';
  $('dec-kimarite').textContent = 'YŪSHŌ';
  $('dec-winner').textContent = won ? 'CHAMPION: PLAYER' : 'CHAMPION: CHICKOZUNA';
  $('dec-flavour').textContent = won
    ? 'The Emperor\'s Cup is presented, with gravy. A new yokozuna of the rotisserie is crowned.'
    : 'Chickozuna retains the title, as is tradition. Return when you are better seasoned.';
  $('dec-tally').textContent = `YOU ${game.wins.p} · ${game.wins.a} CHICKOZUNA`;
  $('dec-cta').textContent = 'PRESS ENTER FOR A NEW TOURNAMENT';
  $('decision').hidden = false;
  game.winner = won ? player : cpu;
}

function updateFlow(real) {
  game.phaseT += real;
  switch (game.phase) {
    case 'title':
      if (pressed.start) {
        $('title').hidden = true;
        inputState.inGame = true;
        $('hud').hidden = false;
        canvas.focus();
        startBout();
      }
      break;
    case 'ready':
      for (const c of game.cues) if (!c.done && game.phaseT >= c.at) { c.done = true; c.fn(); }
      break;
    case 'fight':
      for (const c of game.cues) if (!c.done && game.phaseT >= c.at) { c.done = true; c.fn(); }
      // The referee urges them on when they're locked together.
      if (contact.t > 0.9 && game.realT - game.lastNokotta > 3) { gyoji('Nokotta, nokotta!'); game.lastNokotta = game.realT; }
      contact.t = Math.max(0, contact.t - real * 0.4);
      if (game.pending && clock.t - game.pending.at >= 0.15) decide();
      break;
    case 'decision':
      if (game.phaseT > 1.4) { game.timeScale = 1; showDecision(); game.phase = 'screen'; game.phaseT = 0; }
      break;
    case 'screen':
      if (pressed.start && game.phaseT > 0.5) {
        $('decision').hidden = true;
        if (game.wins.p >= WINS_NEEDED || game.wins.a >= WINS_NEEDED) { showChampion(); game.phase = 'champion'; game.phaseT = 0; sfx.taiko(); sfx.taiko(0.25); sfx.taiko(0.5); }
        else { if (!game.rematch) game.bout++; startBout(); }
      }
      break;
    case 'champion':
      if (pressed.start && game.phaseT > 0.5) {
        $('decision').hidden = true;
        Object.assign(game, { bout: 1, wins: { p: 0, a: 0 }, results: [], rematch: false });
        startBout();
      }
      break;
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
  const real = Math.min(0.1, (now - last) / 1000);
  last = now;
  game.realT += real;
  pollPad();
  updateFlow(real);

  // ?pose=push (or brace, windup, charge, dodge, idle...): a close-up of your chicken holding that pose.
  if (POSE) {
    player.pos.set(0, 0); player.vel.set(0, 0); player.heading = 0.6;
    if (POSE.state === 'out') {
      // Replays the ring-out fall every 3 seconds.
      if (player.state !== 'out' || clock.t - player.doneAt > 3) { player.set('out'); player.doneAt = clock.t; player.fallSign = 1; }
    } else if (player.state !== POSE.state || player.t > 0.2) { player.set(POSE.state); player.t = 0.1; player.charge = 1; }
    cpu.pos.set(0, 9); cpu.vel.set(0, 0);
  }
  const simulate = game.phase === 'fight' || game.phase === 'decision' || game.phase === 'screen' || game.phase === 'title';
  if (simulate) {
    acc += real * game.timeScale;
    let steps = 0;
    while (acc >= FIXED_DT && steps < 24) {
      const fighting = game.phase === 'fight';
      const pi = fighting ? playerIntent(cam.az) : idle();
      const ci = fighting ? brain.think(FIXED_DT) : idle();
      if (steps > 0) pi.push = pi.dodge = false;   // a click or tap counts once
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
  if (game.phase !== 'fight') pressed.push = pressed.dodge = false;
  pressed.start = false;

  animate(player, game.realT, real);
  animate(cpu, game.realT + 1.7, real);
  updateParticles(real * Math.max(0.35, game.timeScale));
  // More cameras going off when it's tense (locked together, or a big moment).
  updateFlashes(real, game.phase === 'fight' ? 1 + Math.min(2, contact.t) : 0.6);
  updateCamera(real);
  if (POSE) { camera.position.set(Math.sin(POSE.az) * 2.6, PLATFORM_H + 1.1, Math.cos(POSE.az) * 2.6); camera.lookAt(0, PLATFORM_H + 0.7, 0); }
  updateHud(real);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// For testing in the console: window.roast.game, .player, .cpu
window.roast = { game, player, cpu, brain, startBout, debugRig };
