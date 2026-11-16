// Roast Royale: the "Choose your chicken" screen. Builds the roster tiles, shows each side's
// chicken in its fighter panel, and marks the cursors (blue for the left wrestler, red for the right).
import { ROSTER, statBars } from './roster.js';

const $ = (id) => document.getElementById(id);
// Flat colours for the tiles until the portraits have been rendered.
const SWATCH = ['#b8732a', '#1e1712', '#e6c98e', '#f2c4bd', '#d9902f'];
let tiles = [];

export function buildRoster(onClick) {
  const box = $('roster');
  box.replaceChildren();
  tiles = ROSTER.map((c, i) => {
    const t = document.createElement('button');
    t.type = 'button';
    t.className = 'tile';
    t.style.setProperty('--swatch', SWATCH[c.skin]);
    t.innerHTML = `<div class="pic"></div><div class="tname"></div><span class="badge b-p"></span><span class="badge b-a"></span>`;
    t.querySelector('.tname').textContent = c.name;
    t.addEventListener('click', () => onClick(i));
    box.append(t);
    return t;
  });
}

export function setPortraits(urls) {
  tiles.forEach((t, i) => { t.querySelector('.pic').style.backgroundImage = `url(${urls[i]})`; });
}

/**
 * sides: { p: { i, locked, tag, waiting }, a: { ... } }. `i` null hides that side's cursor.
 * tag is what the badge and panel call them (YOU, CPU, YOUR MATE); waiting is shown instead of a
 * chicken when nobody's there yet.
 */
export function renderSelect(sides) {
  tiles.forEach((t, i) => {
    for (const s of ['p', 'a']) {
      const d = sides[s];
      const here = d.i === i && !d.waiting;
      t.classList.toggle(`cur-${s}`, here);
      t.classList.toggle(`lock-${s}`, here && d.locked);
      t.querySelector(`.b-${s}`).textContent = d.badge || d.tag;
    }
  });
  for (const s of ['p', 'a']) {
    const d = sides[s];
    $(`ftag-${s}`).textContent = d.tag;
    if (d.waiting) {
      $(`fname-${s}`).textContent = d.waiting;
      $(`fcook-${s}`).textContent = '';
      $(`fblurb-${s}`).textContent = '';
      $(`fstats-${s}`).replaceChildren();
      $(`flock-${s}`).textContent = '';
      continue;
    }
    const c = ROSTER[d.i];
    $(`fname-${s}`).textContent = c.name;
    $(`fcook-${s}`).textContent = `${c.cook.toUpperCase()} · ${c.rank}`;
    $(`fblurb-${s}`).textContent = c.blurb;
    $(`fstats-${s}`).replaceChildren(...statBars(c).flatMap(([label, v]) => {
      const l = document.createElement('span');
      l.textContent = label;
      const b = document.createElement('span');
      b.className = 'sbar';
      b.innerHTML = `<i style="width:${Math.round(v * 100)}%"></i>`;
      return [l, b];
    }));
    $(`flock-${s}`).textContent = d.locked ? 'READY' : '';
  }
}
