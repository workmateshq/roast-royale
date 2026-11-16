// Roast Royale: wrestlers and the arcade physics (momentum, turning lag, the four moves,
// balance, collisions and the straw-bale edge). Runs at a fixed step for determinism.
import { cheer } from './music.js';
import * as THREE from 'three';
import { RING_R, BODY_R, PLATFORM, PLATFORM_H, FIXED_DT, MOVE, V2, wrap, clamp, faceVec } from './config.js';
import { emit, sfx, shake, view, excite } from './effects.js';
import { makeVisual } from './chicken.js';

// =====================================================================================
// Wrestlers and the arcade physics
// =====================================================================================
// The simulation clock (seconds of fight time) and how long the two have been locked together.
export const clock = { t: 0 };
export const contact = { t: 0 };

export class Wrestler {
  constructor(name, belt) {
    this.kind = { stats: { mass: 1, speed: 1, turn: 1, take: 1, power: 1 } };   // set from the roster (roster.js)
    this.name = name;
    this.vis = makeVisual(belt);
    this.reset(0, 0);
  }
  reset(x, heading) {
    this.pos = new V2(x, 0);
    this.vel = new V2();
    this.heading = heading;
    this.turnVel = 0;
    this.y = PLATFORM_H;
    this.vy = 0;
    this.balance = 0;          // 0 steady .. 100 toppled
    this.braceStamina = 1;
    this.state = 'idle';       // idle windup charge recover push brace dodge stagger down out
    this.t = 0;                // time in this state
    this.charge = 0;           // wind-up 0..1
    this.cd = { charge: 0, push: 0, dodge: 0 };
    this.sinceHit = 9;
    this.lastHit = null;       // { by, kind, at }
    this.teeter = 0;           // 0..1 while digging in at the straw
    this.ghost = 0;            // dodge invulnerability
    this.dodgeDir = 1;
    this.struck = false;       // this charge or push has already connected
    this.staggerFor = 0;
  }
  get facing() { return faceVec(this.heading); }
  // How big it is (the boss is twice the size): scales its body and its collision circle.
  get size() { return this.kind.size || 1; }
  get done() { return this.state === 'down' || this.state === 'out'; }
  // Heavier while braced: knockback is divided by this.
  get mass() { return (this.state === 'brace' ? 3.2 : this.state === 'windup' ? 1.3 : 1) * this.kind.stats.mass; }
  set(state) { this.state = state; this.t = 0; this.struck = false; }
}

// Something hit `target`. Bracing (facing the attacker) soaks most of it; recovering from a
// missed charge makes it worse.
function hit(target, attacker, kind, impulse, balanceDamage, stagger = 0) {
  if (target.done) return false;
  const toAttacker = attacker.pos.clone().sub(target.pos).normalize();
  const braced = target.state === 'brace' && target.facing.dot(toAttacker) > 0.2;
  let k = 1 / target.mass;
  let dmg = balanceDamage * target.kind.stats.take;
  if (braced) dmg *= 0.35;
  if (target.state === 'recover') { k *= 1.25; dmg *= 1.5; }
  if (target.state === 'windup') dmg *= 1.25;
  target.vel.addScaledVector(impulse, k);
  target.balance = Math.min(100, target.balance + dmg);
  target.sinceHit = 0;
  target.lastHit = { by: attacker, kind, at: clock.t };
  if (stagger && !braced && target.state !== 'stagger') { target.set('stagger'); target.staggerFor = stagger; }
  return braced;
}

function startCharge(w) {
  const k = w.charge;
  w.set('charge');
  const f = w.facing;
  const along = Math.max(0, w.vel.dot(f));
  w.vel.copy(f).multiplyScalar(along + (5.2 + 3.8 * k) * Math.sqrt(w.kind.stats.speed));
  w.cd.charge = 1.4;
  sfx.whoosh();
  emit(new THREE.Vector3(w.pos.x, PLATFORM_H + 0.05, w.pos.y), 14, { colour: 0xd2b07a, speed: 1.6, up: 0.6, life: 0.7, grav: 2, size: 0.18, grow: 0.5, alpha: 0.5, dir: new THREE.Vector3(-f.x, 0, -f.y) });
}

// A shove lands on the nearest opponent in front of you and within reach.
function resolvePush(w, opps) {
  const f = w.facing;
  let opp = null, to = null, dist = Infinity;
  for (const o of opps) {
    const d = o.pos.clone().sub(w.pos);
    const l = d.length();
    d.divideScalar(l || 1);
    if (!o.done && o.ghost <= 0 && l < BODY_R * (w.size + o.size) + 0.6 && f.dot(d) > 0.45 && l < dist) { opp = o; to = d; dist = l; }
  }
  if (opp) {
    // Mostly where you're facing, a little straight at them.
    const dir = f.clone().multiplyScalar(0.7).addScaledVector(to, 0.3).normalize();
    const braced = hit(opp, w, 'push', dir.multiplyScalar((3.5 + Math.max(0, w.vel.dot(f)) * 0.6) * w.kind.stats.power), 9 * w.kind.stats.power, 0.16);
    w.vel.addScaledVector(f, braced ? -1.2 : -0.5);
    if (braced) w.balance += 4;
    sfx.slap();
    shake(0.08);
    const at = new THREE.Vector3((w.pos.x + opp.pos.x) / 2, PLATFORM_H + 0.45, (w.pos.y + opp.pos.y) / 2);
    emit(at, 8, { colour: 0xc8842c, speed: 2, up: 1.6, life: 0.6, size: 0.05 });
  } else {
    // A whiff: you lurch forward, overextended.
    w.vel.addScaledVector(f, 1.2);
    w.balance = Math.min(100, w.balance + 4);
  }
}

// The opponent to square up to: the nearest one still standing (or the nearest at all).
function nearest(w, opps) {
  let best = null, bestD = Infinity;
  for (const pass of [true, false]) {
    for (const o of opps) {
      if (pass && o.done) continue;
      const d = o.pos.distanceToSquared(w.pos);
      if (d < bestD) { best = o; bestD = d; }
    }
    if (best) return best;
  }
  return null;
}

// One physics step for one wrestler. `it` is what they're trying to do (player input or AI):
// { move: V2 (ground direction, length <= 1), face: V2|null, charge, push, brace, dodge }.
// `opps` is everyone else in the ring (an array, or a single opponent).
export function stepWrestler(w, it, opps, dt) {
  opps = Array.isArray(opps) ? opps : opps ? [opps] : [];
  w.t += dt;
  for (const k in w.cd) w.cd[k] = Math.max(0, w.cd[k] - dt);
  w.ghost = Math.max(0, w.ghost - dt);
  w.sinceHit += dt;

  if (!w.done) {
    // ---- what you're doing ----
    const free = w.state === 'idle' || w.state === 'brace';
    if (free && it.dodge && w.cd.dodge <= 0) {
      w.set('dodge');
      const side = new V2(w.facing.y, -w.facing.x);   // to your right
      const s = it.move.lengthSq() > 0.04 ? Math.sign(side.dot(it.move)) || 1 : (Math.random() < 0.5 ? -1 : 1);
      w.dodgeDir = s;
      w.vel.addScaledVector(side, 6.2 * s);
      w.ghost = 0.26;
      w.cd.dodge = 1.1;
      w.balance = Math.min(100, w.balance + 3);
      sfx.whoosh();
    } else if (free && it.push && w.cd.push <= 0) {
      w.set('push');
      w.cd.push = 0.5;
      w.vel.addScaledVector(w.facing, 0.9);
    } else if (free && it.charge && w.cd.charge <= 0) {
      w.set('windup');
      w.charge = 0;
    } else if (w.state === 'idle' && it.brace && w.braceStamina > 0.2) {
      w.set('brace');
    } else if (w.state === 'brace' && (!it.brace || w.braceStamina <= 0)) {
      w.set('idle');
    }
    switch (w.state) {
      case 'windup':
        w.charge = Math.min(1, w.t / 0.8);
        if (!it.charge || w.t > 1.1) startCharge(w);
        break;
      case 'charge':
        if (w.t > 0.6 || w.vel.length() < 1.6) w.set('recover');
        break;
      case 'recover':
        if (w.t > 0.45) w.set('idle');
        break;
      case 'push':
        if (!w.struck && w.t >= 0.09) { w.struck = true; resolvePush(w, opps); }
        if (w.t > 0.3) w.set('idle');
        break;
      case 'dodge':
        if (w.t > 0.34) w.set('idle');
        break;
      case 'stagger':
        if (w.t > w.staggerFor) w.set('idle');
        break;
    }
    w.braceStamina = clamp(w.braceStamina + (w.state === 'brace' ? -0.42 : 0.28) * dt, 0, 1);

    // ---- turning, with lag ----
    const turnScale = { idle: 1, windup: 0.55, charge: 0, recover: 0.3, push: 0.4, brace: 0.5, dodge: 0.2, stagger: 0 }[w.state];
    let target = null;
    if (w.state === 'idle' && it.move.lengthSq() > 0.04) target = Math.atan2(it.move.x, it.move.y);
    else if (it.face) target = Math.atan2(it.face.x, it.face.y);
    else if (w.state !== 'charge') {   // standing still: square up to your (nearest) opponent
      const opp = nearest(w, opps);
      const to = opp ? opp.pos.clone().sub(w.pos) : new V2();
      if (to.lengthSq() > 0.01) target = Math.atan2(to.x, to.y);
    }
    const maxTurn = MOVE.turnRate * turnScale * w.kind.stats.turn;
    const want = target === null ? 0 : clamp(wrap(target - w.heading) * 5, -maxTurn, maxTurn);
    w.turnVel += clamp(want - w.turnVel, -MOVE.turnAccel * dt, MOVE.turnAccel * dt);
    w.heading = wrap(w.heading + w.turnVel * dt);

    // ---- moving, with momentum ----
    const speed = w.vel.length();
    if (w.state === 'idle' && it.move.lengthSq() > 0.0004) {
      // You push best in the direction you're facing: walking backwards or sideways is slow.
      const m = it.move.clone();
      const align = m.lengthSq() > 0 ? w.facing.dot(m.clone().normalize()) : 0;
      w.vel.addScaledVector(m, MOVE.accel * w.kind.stats.speed * (0.35 + 0.65 * Math.max(0, align)) * dt);
    }
    const drag = { idle: MOVE.accel / MOVE.walkSpeed, windup: 4, charge: 0.6, recover: 3.2, push: 2.5, brace: 11, dodge: 2.2, stagger: 1.6 }[w.state];
    w.vel.multiplyScalar(Math.max(0, 1 - drag * dt));
    if (speed > 0) w.vel.multiplyScalar(Math.max(0, speed - MOVE.friction * dt) / speed);

    // ---- the straw bales: at the edge you dig in your heels, unless you're going too fast ----
    const r = w.pos.length();
    w.teeter = 0;
    if (r > RING_R - BODY_R * 0.7 && w.state !== 'charge') {
      const outward = w.pos.clone().divideScalar(r || 1);
      const vr = w.vel.dot(outward);
      if (vr < 2.3) {
        const grip = w.state === 'brace' ? 7.5 : 4;
        w.vel.addScaledVector(outward, -grip * dt);
        if (vr > 0) w.vel.addScaledVector(outward, -vr * 4 * dt);
      }
      w.teeter = clamp((r - (RING_R - BODY_R * 0.7)) / (BODY_R * 0.7), 0, 1);
      w.balance = Math.min(100, w.balance + 5 * w.teeter * dt);
    }

    // ---- getting your balance back ----
    if (w.sinceHit > 0.8 && w.teeter === 0) w.balance = Math.max(0, w.balance - (w.state === 'brace' ? 15 : 8) * dt);
  } else {
    // Down or out: coming to a stop (quickly: it's stumbling and falling, not sliding on ice).
    const speed = w.vel.length();
    w.vel.multiplyScalar(Math.max(0, 1 - 2.6 * dt));
    if (speed > 0) w.vel.multiplyScalar(Math.max(0, speed - 3 * dt) / speed);
    // Lying down takes up more room than standing: keep the fallen body clear of the straw bales.
    // Toppled inside the ring, it settles a little further in; out of the ring, a little further out,
    // turned to face the middle so it falls backwards away from the bales.
    const r = w.pos.length();
    if (r > 0.01) {
      // Out of the ring there's no room to lie between the straw and the platform's edge, so it
      // staggers on over the edge and drops to the hall floor (gravity below takes it down).
      const edge = Math.max(Math.abs(w.pos.x), Math.abs(w.pos.y)) / r;    // square platform: distance to its edge along this line
      const target = w.state === 'down' ? Math.min(r, RING_R - 0.9) : Math.max(r, (PLATFORM / 2 + 0.45) / edge);
      w.pos.multiplyScalar(1 + (target / r - 1) * Math.min(1, dt * (w.state === 'down' ? 6 : 5)));
      if (w.state === 'out') {
        const face = Math.atan2(-w.pos.x, -w.pos.y);
        w.heading = wrap(w.heading + wrap(face - w.heading) * Math.min(1, dt * 9));   // turned to the ring, so it goes over backwards away from it
      }
    }
  }

  w.pos.addScaledVector(w.vel, dt);
  // Off the edge of the platform: fall to the hall floor.
  const onPlatform = Math.abs(w.pos.x) < PLATFORM / 2 - 0.1 && Math.abs(w.pos.y) < PLATFORM / 2 - 0.1;
  if (!onPlatform || w.y < PLATFORM_H) {
    w.vy -= 18 * dt;
    w.y = Math.max(0, w.y + w.vy * dt);
    if (w.y === 0 && w.vy < -3) { sfx.thud(0.6); w.vy = -w.vy * 0.2; } else if (w.y === 0) w.vy = 0;
  }
  // The hall's walls (well beyond the banners) stop anything flying off for ever.
  if (w.pos.length() > 12) w.pos.setLength(12);
}

// Two chickens meeting: charges land, pushes are already handled; everything else is a heavy
// bump that shares out momentum by weight.
export function collide(a, b) {
  if (a.y < PLATFORM_H - 0.2 || b.y < PLATFORM_H - 0.2) return;
  const d = b.pos.clone().sub(a.pos);
  const dist = d.length();
  const reach = BODY_R * (a.size + b.size);   // the two collision circles touching
  if (dist >= reach || dist < 1e-4) return;
  if (a.ghost > 0 || b.ghost > 0) return;   // a wing dodge slips past
  const n = d.divideScalar(dist);

  const charging = (w, nOut) => w.state === 'charge' && !w.struck && w.vel.dot(nOut) > 2.5;
  const aC = charging(a, n), bC = charging(b, n.clone().negate());
  if (aC && bC) {
    // Head-on tachiai clash: both bounce off, both rattled.
    const s = a.vel.dot(n) - b.vel.dot(n);
    a.struck = b.struck = true;
    a.vel.copy(n).multiplyScalar(-s * 0.35);
    b.vel.copy(n).multiplyScalar(s * 0.35);
    hit(a, b, 'charge', new V2(), 14 + s * 1.6, 0.4);
    hit(b, a, 'charge', new V2(), 14 + s * 1.6, 0.4);
    impactFx(a, b, s);
  } else if (aC || bC) {
    const [c, t, nn] = aC ? [a, b, n] : [b, a, n.clone().negate()];
    const s = c.vel.dot(nn);
    c.struck = true;
    const braced = hit(t, c, 'charge', nn.clone().multiplyScalar(s * 0.95 * c.kind.stats.power), (10 + s * 4.2) * c.kind.stats.power, 0.45);
    if (braced) {
      // Like charging a wall: you bounce off and wobble.
      c.vel.copy(nn).multiplyScalar(-s * 0.32);
      hit(c, t, 'brace', new V2(), 16 + s * 2.2, 0.5);
    } else {
      c.vel.copy(nn).multiplyScalar(s * 0.18);
    }
    impactFx(c, t, s);
  }

  // Separate them, and share out momentum along the line between them.
  const overlap = reach - a.pos.distanceTo(b.pos);
  if (overlap > 0) {
    const ma = a.mass, mb = b.mass;
    a.pos.addScaledVector(n, (-overlap * mb) / (ma + mb));
    b.pos.addScaledVector(n, (overlap * ma) / (ma + mb));
    const closing = a.vel.dot(n) - b.vel.dot(n);
    if (closing > 0) {
      const j = (1.25 * closing) / (1 / ma + 1 / mb);
      a.vel.addScaledVector(n, -j / ma);
      b.vel.addScaledVector(n, j / mb);
      if (closing > 1.6) {
        a.balance = Math.min(100, a.balance + (closing - 1.6) * 4 / ma);
        b.balance = Math.min(100, b.balance + (closing - 1.6) * 4 / mb);
      }
      if (closing > 0.4) {
        // Grappling contact: whoever goes out next was forced out.
        a.lastHit = { by: b, kind: 'grapple', at: clock.t };
        b.lastHit = { by: a, kind: 'grapple', at: clock.t };
      }
    }
    contact.t += FIXED_DT;
  }
}

function impactFx(a, b, s) {
  const at = new THREE.Vector3((a.pos.x + b.pos.x) / 2, PLATFORM_H + 0.5, (a.pos.y + b.pos.y) / 2);
  emit(at, 18, { colour: 0xc8842c, speed: 3.2, up: 2.6, life: 0.9, size: 0.06 });
  emit(at, 6, { colour: 0xfff0d0, speed: 1.4, up: 1, life: 0.5, size: 0.2, grow: 1.2, grav: 0, alpha: 0.5 });
  sfx.thud(Math.min(1.4, s / 6));
  shake(Math.min(0.35, s * 0.04));
  view.zoomPunch = 1;
  if (s > 5) { excite(3); cheer(); }
}
