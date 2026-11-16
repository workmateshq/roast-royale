// Roast Royale: the home screen's lobby card. Four slots, P1 to P4, each in its mawashi colour,
// showing who's in the ring (you, your mates, the host) or an empty, dashed spot.
import { SLOTS } from './roster.js';

const $ = (id) => document.getElementById(id);

export function buildSlots() {
  $('slots').replaceChildren(...SLOTS.map((c, s) => {
    const el = document.createElement('div');
    el.className = 'slot';
    el.style.setProperty('--slot-glow', c.glow);
    el.style.setProperty('--slot-tag', c.tag);
    el.innerHTML = `<div class="slot-label">P${s + 1}</div><div class="slot-icon"></div><div class="slot-name"></div><div class="slot-tag"></div>`;
    return el;
  }));
}

/** entries: one per slot, null for an empty spot, else { you, tag }. */
export function renderSlots(entries) {
  [...$('slots').children].forEach((el, s) => {
    const e = entries[s];
    el.classList.toggle('filled', !!e);
    el.classList.toggle('you', !!(e && e.you));
    // Just the slot's number above (P1 is the host); yours says (YOU), empty ones EMPTY.
    el.querySelector('.slot-name').textContent = e ? (e.you ? '(YOU)' : '') : 'EMPTY';
    el.querySelector('.slot-tag').textContent = (e && e.tag) || '';
  });
}
