// Roast Royale: player input from keyboard, mouse and gamepad. Movement is relative to the camera.
import { V2 } from './config.js';
import { ac } from './effects.js';
import { canvas } from './scene.js';

// Right-click is the brace in a bout; on menus the browser's own menu is left alone.
export const inputState = { inGame: false };

// =====================================================================================
// Player input: keyboard + mouse, or a gamepad. Movement is relative to the camera.
// =====================================================================================
export const keys = new Set();
export const pressed = { push: false, dodge: false, start: false };
let braceHeld = false;
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') pressed.dodge = true;
  if (e.code === 'Enter') pressed.start = true;
  ac();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); braceHeld = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('contextmenu', (e) => { if (inputState.inGame) e.preventDefault(); });
// Left button: a quick click is the Breast Push; click and drag turns the camera instead.
// (So the push fires on release, once we know it wasn't a drag.)
export const camDrag = { yaw: 0, pitch: 0, active: false };
let down = null;
addEventListener('mousedown', (e) => {
  ac();
  // Clicks on menus and buttons are theirs, not the game's.
  if (e.button === 0 && e.target.closest && e.target.closest('.ui, button, input, a')) return;
  if (e.button === 0) { down = { x: e.clientX, y: e.clientY, dragging: false }; pressed.start = true; }
  if (e.button === 2) braceHeld = true;
});
addEventListener('mousemove', (e) => {
  if (!down) return;
  if (!down.dragging && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.dragging = camDrag.active = true;
  if (down.dragging) {
    camDrag.yaw -= e.movementX * 0.006;
    camDrag.pitch = Math.max(-0.22, Math.min(0.9, camDrag.pitch + e.movementY * 0.004));
  }
});
addEventListener('mouseup', (e) => {
  if (e.button === 2) braceHeld = false;
  if (e.button === 0 && down) {
    if (!down.dragging && inputState.inGame) pressed.push = true;
    down = null;
    camDrag.active = false;
  }
});

const pad = { move: new V2(), charge: false, brace: false, push: false, dodge: false, start: false, prev: {} };
export function pollPad() {
  const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(Boolean);
  pad.move.set(0, 0);
  pad.charge = pad.brace = false;
  if (!gp) return;
  const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
  pad.move.set(dz(gp.axes[0] || 0), dz(gp.axes[1] || 0));
  const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
  pad.charge = b(0);                               // A / Cross
  pad.brace = b(6) || b(7) || b(4);                // triggers / left bumper
  const edge = (i) => b(i) && !pad.prev[i];
  if (edge(2) || edge(5)) pressed.push = true;     // X / Square, right bumper
  if (edge(1)) pressed.dodge = true;               // B / Circle
  if (edge(9) || edge(0)) pressed.start = true;    // Start, or A on menus
  for (const i of [0, 1, 2, 5, 9]) pad.prev[i] = b(i);
}

export function playerIntent(camAz) {
  // Camera-relative: W is "away from the camera".
  const fwd = new V2(-Math.sin(camAz), -Math.cos(camAz));
  const right = new V2(-fwd.y, fwd.x);
  let x = 0, y = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  x += pad.move.x;
  y -= pad.move.y;
  const move = fwd.multiplyScalar(y).add(right.multiplyScalar(x)).clampLength(0, 1);
  return {
    move, face: null,
    charge: keys.has('Space') || pad.charge,
    brace: braceHeld || pad.brace,
    push: pressed.push, dodge: pressed.dodge,
  };
}
