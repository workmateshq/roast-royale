// Roast Royale: the CPU opponent, a small state machine driving the same controls as the player.
import { RING_R, V2, rand, clamp } from './config.js';

// =====================================================================================
// The CPU opponent: a small state machine (stalk, wind up, charge, shove, recover, react),
// driving the same controls the player has.
// =====================================================================================
export class Brain {
  constructor(me, opp) {
    this.me = me;
    this.opp = opp;
    this.level = 0.6;          // 0..1, rises each bout
    this.reset();
  }
  reset() {
    this.state = 'stalk';
    this.t = 0;
    this.circle = Math.random() < 0.5 ? -1 : 1;
    this.nextFlip = rand(1.5, 3);
    this.pushIn = rand(0.3, 0.7);
    this.windFor = 0.5;
    this.reaction = null;
    this.keepDist = 2.5;
    this.noticeIn = 0;
    this.wander = 0;
  }
  go(state) { this.state = state; this.t = 0; }

  think(dt) {
    const me = this.me, op = this.opp;
    const it = { move: new V2(), face: null, charge: false, push: false, brace: false, dodge: false };
    if (me.done) return it;
    this.t += dt;
    const to = op.pos.clone().sub(me.pos);
    const dist = to.length();
    const dirTo = to.clone().divideScalar(dist || 1);
    const myR = me.pos.length(), opR = op.pos.length();
    const inward = me.pos.clone().multiplyScalar(-1 / (myR || 1));
    const edgePull = inward.multiplyScalar(Math.max(0, myR - (RING_R - 1.4)) * 1.4);
    const aimedAtMe = op.facing.dot(dirTo.clone().negate()) > 0.9;
    const lvl = this.level;
    // Low levels aim sloppily: their facing drifts a little off you, so their shoves and charges miss more.
    this.wander += (rand(-1, 1) * (1 - lvl) * 1.4 - this.wander) * Math.min(1, dt * 1.5);
    const sway = this.wander * (1 - lvl);
    it.face = new V2(dirTo.x * Math.cos(sway) - dirTo.y * Math.sin(sway), dirTo.x * Math.sin(sway) + dirTo.y * Math.cos(sway));

    // An incoming charge: dodge it or brace for it, decided once.
    const threat = dist < 5.5 && ((op.state === 'charge' && op.vel.dot(dirTo) < -3) || (op.state === 'windup' && aimedAtMe && op.charge > 0.45));
    // Easier opponents are slow to notice an incoming charge (and sometimes don't react at all).
    if (!threat) this.noticeIn = (1 - lvl) * rand(0.25, 0.6);
    else this.noticeIn -= dt;
    if (threat && this.noticeIn <= 0 && this.state !== 'react' && this.state !== 'windup') {
      const r = Math.random();
      this.reaction = r < 0.45 * (1 - lvl) ? 'none' : me.cd.dodge <= 0 && r < 0.35 + 0.35 * lvl ? 'dodge' : 'brace';
      this.go('react');
    }

    switch (this.state) {
      case 'react': {
        if (this.reaction === 'dodge') {
          // Wait until they're committed and close, then sidestep.
          if (op.state === 'charge' && dist < 3.2) { it.dodge = true; this.reaction = 'done'; }
        } else if (this.reaction === 'brace') it.brace = true;
        if ((op.state !== 'charge' && op.state !== 'windup') || this.t > 1.6) this.go('stalk');
        break;
      }
      case 'stalk': {
        if ((this.nextFlip -= dt) <= 0) { this.circle *= -1; this.nextFlip = rand(1.2, 3); this.keepDist = Math.random() < 0.4 + 0.3 * lvl ? 1.4 : 2.6; }
        const radial = dirTo.clone().multiplyScalar(clamp((dist - this.keepDist) * 0.9, -1, 1));
        const tangent = new V2(-dirTo.y, dirTo.x).multiplyScalar(this.circle * 0.5);
        it.move.copy(radial).add(tangent).add(edgePull);
        const aligned = me.facing.dot(dirTo) > 0.97;
        // Charge more eagerly when they're near the edge and you're on the inside.
        const keen = (opR > RING_R - 1.6 && myR < opR ? 1 + 2 * lvl : 1) * (0.08 + 0.67 * lvl);
        if (aligned && dist > 2 && dist < 5.2 && me.cd.charge <= 0 && myR < RING_R - 0.9 && Math.random() < keen * dt) {
          this.windFor = rand(0.3, 0.8);
          this.go('windup');
        } else if (dist < 1.8) this.go('shove');
        if (me.balance > 62) this.go('recover');
        break;
      }
      case 'windup':
        it.charge = this.t < this.windFor;
        if (this.t > this.windFor + 0.1) this.go('stalk');
        break;
      case 'shove': {
        it.move.copy(dirTo).multiplyScalar(0.45).add(edgePull);
        if ((this.pushIn -= dt) <= 0 && dist < 2 && me.facing.dot(dirTo) > 0.7) {
          it.push = true;
          this.pushIn = rand(0.45, 0.9) / (0.3 + 1.0 * lvl);
        }
        // Backed up to the straw and being pressed: plant yourself.
        if (myR > RING_R - 0.9 && op.facing.dot(dirTo.clone().negate()) > 0.7 && dist < 1.8 && Math.random() < 0.25 + 0.75 * lvl) it.brace = true;
        if (op.state === 'brace' && Math.random() < 0.8 * dt) { this.keepDist = 3; this.go('stalk'); }
        if (dist > 2.4) this.go('stalk');
        if (me.balance > 65) this.go('recover');
        break;
      }
      case 'recover': {
        it.move.copy(dirTo).multiplyScalar(-0.7).add(edgePull.multiplyScalar(1.5));
        if (dist < 2 && op.facing.dot(dirTo.clone().negate()) > 0.6) it.brace = true;
        if (me.balance < 30 || this.t > 4) this.go('stalk');
        break;
      }
    }
    if (it.move.length() > 1) it.move.normalize();
    it.move.multiplyScalar(0.6 + 0.4 * lvl);   // easier opponents waddle about more slowly
    // Push away from the straw when idling near it, even mid-plan.
    if (myR > RING_R - 0.8 && !it.brace) it.move.add(inward.normalize().multiplyScalar(0.6)).clampLength(0, 1);
    return it;
  }
}
