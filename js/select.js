// Roast Royale: the "Choose your chicken" screen. Builds the roster tiles, shows each wrestler's
// chicken in its fighter panel, and marks the cursors in each slot's colour (blue, red, green, gold).
import { ROSTER, SLOTS, statBars } from './roster.js';

const $ = (id) => document.getElementById(id);
// Flat colours for the tiles until the portraits have been rendered.
export const SWATCH = ['#b8732a', '#c4552a', '#c9955a', '#f2c4bd', '#d9902f', '#5f7a52', '#9fb6c4'];
let tiles = [];
let panels = [];

const slotVars = (el, s) => {
  el.style.setProperty('--slot-belt', SLOTS[s].belt);
  el.style.setProperty('--slot-glow', SLOTS[s].glow);
  el.style.setProperty('--slot-tag', SLOTS[s].tag);
};

export function buildRoster(onClick) {
  const box = $('roster');
  box.replaceChildren();
  tiles = ROSTER.map((c, i) => {
    const t = document.createElement('button');
    t.type = 'button';
    t.className = 'tile';
    t.style.setProperty('--swatch', SWATCH[c.skin]);
    t.innerHTML = `<div class="pic"></div><div class="tname"></div><div class="badges">${SLOTS.map((_, s) => `<span class="badge b-${s}"></span>`).join('')}</div>`;
    t.querySelector('.tname').textContent = c.name;
    t.addEventListener('click', () => onClick(i));
    box.append(t);
    return t;
  });
  // One fighter panel per slot; renderSelect puts them in the left or right column.
  panels = SLOTS.map((_, s) => {
    const p = document.createElement('div');
    p.className = 'fighter';
    p.hidden = true;
    slotVars(p, s);
    p.innerHTML = '<div class="ftag"></div><div class="fname"></div><div class="fcook"></div><div class="fstats"></div><div class="flock"></div>';
    return p;
  });
}

export function setPortraits(urls) {
  tiles.forEach((t, i) => { t.querySelector('.pic').style.backgroundImage = `url(${urls[i]})`; });
}

/**
 * list: one entry per wrestler in the ring, left to right: { slot, i, locked, tag, badge, waiting }.
 * `slot` is 0..3 (blue, red, green, gold). tag is what the panel calls them (YOU, CPU, YOUR MATE),
 * badge what the tile's badge says (defaults to tag); waiting is shown instead of a chicken when
 * nobody's there yet. With two wrestlers the panels sit left and right; with three or four they
 * stack, compact, two to a side.
 */
export function renderSelect(list) {
  tiles.forEach((t, i) => {
    let here = 0;
    for (let s = 0; s < SLOTS.length; s++) {
      const d = list.find((e) => e.slot === s);
      const on = !!d && d.i === i && !d.waiting;
      here += on;
      t.classList.toggle(`cur-${s}`, on);
      t.classList.toggle(`lock-${s}`, on && d.locked);
      t.querySelector(`.b-${s}`).textContent = d ? d.badge || d.tag : '';
    }
    t.classList.toggle('multi', here > 1);
  });
  const compact = list.length > 2;
  const cols = [$('fighters-l'), $('fighters-r')];
  panels.forEach((p) => { p.hidden = true; });
  list.forEach((d, k) => {
    const p = panels[d.slot];
    const side = k % 2;
    p.hidden = false;
    p.className = `fighter ${side ? 'right' : 'left'}${compact ? ' compact' : ''}`;
    cols[side].append(p);
    const q = (c) => p.querySelector(c);
    q('.ftag').textContent = d.tag;
    if (d.waiting) {
      q('.fname').textContent = d.waiting;
      q('.fcook').textContent = '';
      q('.fstats').replaceChildren();
      q('.flock').textContent = '';
      return;
    }
    const c = ROSTER[d.i];
    q('.fname').textContent = c.name;
    q('.fcook').textContent = `${c.cook.toUpperCase()} · ${c.rank}`;
    q('.fstats').replaceChildren(...statBars(c).flatMap(([label, v]) => {
      const l = document.createElement('span');
      l.textContent = label;
      const b = document.createElement('span');
      b.className = 'sbar';
      b.innerHTML = `<i style="width:${Math.round(v * 100)}%"></i>`;
      return [l, b];
    }));
    q('.flock').textContent = d.locked ? 'READY' : '';
  });
}
