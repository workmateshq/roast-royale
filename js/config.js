// Roast Royale: tunables and small shared helpers.
import * as THREE from 'three';

// =====================================================================================
// Tunables. World units are metres; the ring sits on a raised platform. Positions are
// kept as Vector2(x, z) on the ground plane.
// =====================================================================================
export const RING_R = 4.2;          // inside edge of the straw bales
export const OUT_R = RING_R + 0.14; // centre of mass past this = ring-out
export const BODY_R = 0.5;          // each chicken's collision circle
export const PLATFORM = 11;         // the square dohyō platform's side
export const PLATFORM_H = 0.6;
export const FIXED_DT = 1 / 120;    // physics step (deterministic, independent of frame rate)
export const WINS_NEEDED = 2;
export const BOUT_NAMES = ['Initial Bash', 'The Second Basting', 'The Final Roast'];

export const MOVE = {
  walkSpeed: 2.6,   // top waddling speed (m/s)
  accel: 5.4,       // how hard a chicken can push itself along (m/s²)
  friction: 1.3,    // constant ground friction (m/s²), so a coasting chicken stops
  turnRate: 2.5,    // fastest turn (rad/s)
  turnAccel: 9,     // how quickly a turn builds up (rad/s²): the "turning lag"
};

export const V2 = THREE.Vector2;
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const faceVec = (h) => new V2(Math.sin(h), Math.cos(h));
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
