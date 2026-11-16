// Roast Royale: background music. A gentle Japanese track on the menus, taiko drums while a round is fought,
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
const GESTURES = ['pointerdown', 'keydown', 'touchstart', 'click'];
function unlock() {
  if (unlocked) return;
  unlocked = true;
  GESTURES.forEach((ev) => removeEventListener(ev, unlock, true));
}
GESTURES.forEach((ev) => addEventListener(ev, unlock, true));
// Arriving by a ring link (e.g. /mate) there's no click before the menus, so try anyway every few
// seconds: browsers let a site you've played before start its music straight away.
let tryIn = 0;
function tryAutoplay(dt) {
  if ((tryIn -= dt) > 0) return;
  tryIn = 2;
  const p = players.menu;
  p.el.volume = 0;
  p.el.play().then(unlock).catch(() => {});
}
let musicMuted = false;
export function setMusicMuted(m) { musicMuted = m; }

const MENU_PHASES = ['title', 'select', 'plan', 'practice'];   // title is the home lobby; plan the solo battle plan; practice is out on the clifftop, to the gentle track

// Call every frame with the game phase and the real time passed.
export function updateMusic(phase, dt) {
  updateCrowd(phase, dt);
  // Menu music on the menus; the drums only while a round is being fought (not the build-up or the verdict).
  want = MENU_PHASES.includes(phase) ? 'menu' : phase === 'fight' ? 'fight' : null;
  if (!unlocked) { if (want === 'menu' && !musicMuted) tryAutoplay(dt); return; }
  for (const [name, p] of Object.entries(players)) {
    const target = name === want && !musicMuted ? 1 : 0;
    const fade = name === 'fight' && target === 0 ? 0.5 : FADE;   // the drums stop quickly when the round ends
    p.level += Math.sign(target - p.level) * Math.min(Math.abs(target - p.level), dt / fade);
    p.el.volume = Math.min(1, Math.max(0, p.level * p.max));
    if (p.level > 0 && p.el.paused) {
      if (name === want && p.level <= dt / FADE + 1e-6) p.el.currentTime = 0;   // each round's drums start from the top
      p.el.play().catch(() => {});
    } else if (p.level === 0 && !p.el.paused) {
      p.el.pause();
    }
  }
}

// ---------- The crowd ----------
// A random cheer over the music at big moments (a heavy collision, a round won), never too
// often, and a long round of applause for the champion. Kept quiet: it's ambience.
const CHEERS = ['big-cheer01', 'long-cheer', 'oooh-cheer'].map((n) => crowdClip(n, 0.2));
const APPLAUSE = crowdClip('long-applause', 0.3);
function crowdClip(name, vol) {
  const el = new Audio(`assets/cheers/${name}.mp3`);
  el.preload = 'auto';
  return { el, vol, level: 0 };
}
let lastCheer = -1, cheerAt = -1e9;
let crowdMuted = false;
let crowdHere = true;   // no crowd at practice
export function setCrowdHere(on) { crowdHere = on; }
export function setCrowdMuted(m) { crowdMuted = m; if (m) [...CHEERS, APPLAUSE].forEach((c) => c.el.pause()); }
function start(c) {
  if (!unlocked || crowdMuted) return;
  c.level = 1;
  c.el.volume = c.vol;
  c.el.currentTime = 0;
  c.el.play().catch(() => {});
}

// force: always cheer (a round won); otherwise only if the crowd hasn't just cheered.
export function cheer(force = false) {
  if (!crowdHere) return;
  const now = performance.now() / 1000;
  if (!force && now - cheerAt < 6) return;
  cheerAt = now;
  let i = (Math.random() * CHEERS.length) | 0;
  if (i === lastCheer) i = (i + 1) % CHEERS.length;
  lastCheer = i;
  start(CHEERS[i]);
}
export function applause() { start(APPLAUSE); }

// Back on the menus, the crowd fades away.
export function updateCrowd(phase, dt) {
  if (!MENU_PHASES.includes(phase)) return;
  for (const c of [...CHEERS, APPLAUSE]) {
    if (c.el.paused) continue;
    c.level = Math.max(0, c.level - dt / FADE);
    c.el.volume = Math.min(1, Math.max(0, c.level * c.vol));
    if (c.level === 0) c.el.pause();
  }
}

// For checking in the console: roast.musicState()
export function musicState() {
  return { unlocked, want, tracks: Object.fromEntries(Object.entries(players).map(([k, p]) => [k, { playing: !p.el.paused, volume: +p.el.volume.toFixed(2), ready: p.el.readyState, error: p.el.error && p.el.error.code }])) };
}
