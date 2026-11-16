// Roast Royale: background music. A gentle Japanese track on the menus, taiko drums in the ring,
// each looping, with a short crossfade between them. Browsers only allow audio once you've
// clicked or pressed a key, so the music waits for that.
const TRACKS = {
  menu: { src: 'assets/music/hitslab-japan-japanese-music.mp3', vol: 0.22 },
  fight: { src: 'assets/music/sonican-taiko-energy.mp3', vol: 0.4 },
};
const FADE = 1.2;   // seconds to fade a track fully in or out

const players = {};
for (const [name, t] of Object.entries(TRACKS)) {
  const el = new Audio(t.src);
  el.loop = true;
  el.preload = 'auto';
  el.volume = 0;
  players[name] = { el, level: 0, max: t.vol };
}

let unlocked = false;
let want = 'menu';
function unlock() {
  if (unlocked) return;
  unlocked = true;
  removeEventListener('pointerdown', unlock, true);
  removeEventListener('keydown', unlock, true);
}
addEventListener('pointerdown', unlock, true);
addEventListener('keydown', unlock, true);

const MENU_PHASES = ['title', 'online', 'select'];

// Call every frame with the game phase and the real time passed.
export function updateMusic(phase, dt) {
  want = MENU_PHASES.includes(phase) ? 'menu' : 'fight';
  if (!unlocked) return;
  for (const [name, p] of Object.entries(players)) {
    const target = name === want ? 1 : 0;
    p.level += Math.sign(target - p.level) * Math.min(Math.abs(target - p.level), dt / FADE);
    p.el.volume = p.level * p.max;
    if (p.level > 0 && p.el.paused) {
      if (name === want && p.level <= dt / FADE + 1e-6) p.el.currentTime = 0;   // a fresh start each time it comes back in
      p.el.play().catch(() => {});
    } else if (p.level === 0 && !p.el.paused) {
      p.el.pause();
    }
  }
}
