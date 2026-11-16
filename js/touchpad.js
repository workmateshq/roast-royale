// Roast Royale: the on-screen gamepad for phones and tablets. A floating stick on the left (it
// appears where your thumb lands), the moves on the right, and a one-finger drag on the open view
// turns the camera. Pointer events, one per finger, so the stick and a button work together.
import { touch, pressed, camDrag, inputState } from './input.js';
import { canvas } from './scene.js';

const STICK_R = 55;     // how far the knob travels, in px
const DEAD = 0.12;
const buzz = () => { if (navigator.vibrate) try { navigator.vibrate(10); } catch { /* not allowed */ } };

const ICON = {
  charge: '<svg viewBox="0 0 24 24"><path d="M13 2 5 13h6l-1 9 8-11h-6z" fill="currentColor"/></svg>',
  push: '<svg viewBox="0 0 24 24"><path d="M4 12h11M11 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 5v14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
  brace: '<svg viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4.5 3 8.2 7 10 4-1.8 7-5.5 7-10V6z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/></svg>',
};
const BUTTONS = [
  { act: 'charge', label: 'CHARGE', icon: ICON.charge },
  { act: 'push', label: 'PUSH', icon: ICON.push },
  { act: 'brace', label: 'BRACE', icon: ICON.brace },
  { act: 'dodgeL', label: 'DODGE', icon: '<b>◀</b>' },
  { act: 'dodgeR', label: 'DODGE', icon: '<b>▶</b>' },
];

const root = document.createElement('div');
root.id = 'gamepad';
root.className = 'gamepad ui';
root.hidden = true;
root.innerHTML = `<div class="stick-zone" id="stick-zone"><div class="stick-base"><div class="stick-knob"></div></div></div>
  <div class="pad-buttons">${BUTTONS.map((b) => `<button type="button" class="pad-btn pad-${b.act}" data-act="${b.act}" aria-label="${b.label}">${b.icon}<span>${b.label}</span></button>`).join('')}</div>`;
document.body.append(root);

// ---------- The stick ----------
const zone = root.querySelector('.stick-zone');
const base = root.querySelector('.stick-base');
const knob = root.querySelector('.stick-knob');
let stick = null;   // { id, x, y } while a thumb's on it
function restStick() {
  stick = null;
  touch.move.set(0, 0);
  base.classList.remove('on');
  base.style.left = base.style.top = '';
  knob.style.transform = '';
}
zone.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (stick) return;
  const r = zone.getBoundingClientRect();
  // The base sits where the thumb lands (kept clear of the zone's edges).
  const x = Math.min(Math.max(e.clientX - r.left, STICK_R), r.width - STICK_R);
  const y = Math.min(Math.max(e.clientY - r.top, STICK_R), r.height - STICK_R);
  stick = { id: e.pointerId, x: r.left + x, y: r.top + y };
  base.style.left = `${x}px`;
  base.style.top = `${y}px`;
  base.classList.add('on');
  try { zone.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
  moveStick(e);
});
function moveStick(e) {
  if (!stick || e.pointerId !== stick.id) return;
  let dx = e.clientX - stick.x, dy = e.clientY - stick.y;
  const d = Math.hypot(dx, dy);
  if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  const k = Math.min(1, d / STICK_R);
  if (k < DEAD) touch.move.set(0, 0);
  else touch.move.set(dx / STICK_R, dy / STICK_R).setLength((k - DEAD) / (1 - DEAD));
}
zone.addEventListener('pointermove', moveStick);
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  zone.addEventListener(ev, (e) => { if (stick && e.pointerId === stick.id) restStick(); });
}

// ---------- The buttons ----------
const held = new Map();   // pointerId -> button
function press(btn) {
  const act = btn.dataset.act;
  btn.classList.add('on');
  buzz();
  if (act === 'charge') touch.charge = true;
  else if (act === 'brace') touch.brace = true;
  else if (act === 'push') pressed.push = true;
  else { pressed.dodge = true; pressed.dodgeSide = act === 'dodgeL' ? -1 : 1; }
}
function release(btn) {
  if ([...held.values()].includes(btn)) return;   // another finger's still on it
  btn.classList.remove('on');
  if (btn.dataset.act === 'charge') touch.charge = false;
  if (btn.dataset.act === 'brace') touch.brace = false;
}
root.querySelectorAll('.pad-btn').forEach((btn) => {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    held.set(e.pointerId, btn);
    try { btn.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    press(btn);
  });
  const up = (e) => { if (held.get(e.pointerId) === btn) { held.delete(e.pointerId); release(btn); } };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, up);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
});
root.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- Camera: drag the open view ----------
let look = null;   // { id, x, y, dragging }
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch' || look || !inputState.inGame) return;
  e.preventDefault();   // (and no made-up mouse click, so no Breast Push)
  look = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, dragging: false };
  try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
});
canvas.addEventListener('pointermove', (e) => {
  if (!look || e.pointerId !== look.id) return;
  if (!look.dragging && Math.hypot(e.clientX - look.sx, e.clientY - look.sy) > 6) look.dragging = camDrag.active = true;
  if (look.dragging) {
    camDrag.yaw -= (e.clientX - look.x) * 0.008;
    camDrag.pitch = Math.max(-0.22, Math.min(0.9, camDrag.pitch + (e.clientY - look.y) * 0.005));
  }
  look.x = e.clientX;
  look.y = e.clientY;
});
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(ev, (e) => { if (look && e.pointerId === look.id) { look = null; camDrag.active = false; } });
}

/** Shown while you've a chicken to control on a touch screen; hiding it lets go of everything. */
export function showGamepad(on) {
  if (root.hidden === !on) return;
  root.hidden = !on;
  if (on) return;
  restStick();
  held.clear();
  root.querySelectorAll('.pad-btn.on').forEach((b) => b.classList.remove('on'));
  touch.charge = touch.brace = false;
}
