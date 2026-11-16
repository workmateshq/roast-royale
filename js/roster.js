// Roast Royale: the roster. Each chicken has its own cook (a skin shader mode in chicken.js) and
// its own build. Stats are multipliers on the standard wrestler (1 = Rōsuto):
//   mass  how hard it is to shove around     speed  waddling speed and acceleration
//   turn  how quickly it can turn            take   how much balance a hit costs it
//   power how hard its pushes and charges land
export const ROSTER = [
  {
    id: 'roast', name: 'RŌSUTO', jp: 'ロースト', rank: 'YOKOZUNA', cook: 'Golden Roast', skin: 0,
    blurb: 'Basted every fifteen minutes. The reigning grand champion of the rotisserie.',
    stats: { mass: 1, speed: 1, turn: 1, take: 1, power: 1 },
  },
  {
    id: 'pale', name: 'YAKITORI', jp: '焼き鳥', rank: 'SEKIWAKE', cook: 'Barely Crispy', skin: 2,
    blurb: 'Pulled out early. Soft, forgiving, and a little soggy underneath.',
    stats: { mass: 0.95, speed: 0.98, turn: 1.05, take: 0.8, power: 0.9 },
  },
  {
    id: 'frozen', name: 'REITŌ', jp: '冷凍', rank: 'KOMUSUBI', cook: 'Frozen Chook', skin: 3,
    blurb: 'Straight from the supermarket freezer. Solid as a rock and stiff as a board.',
    stats: { mass: 1.4, speed: 0.8, turn: 0.7, take: 0.9, power: 1.1 },
  },
  {
    id: 'battered', name: 'KATSU', jp: 'カツ', rank: 'MAEGASHIRA', cook: 'Battered', skin: 4,
    blurb: 'Triple-dipped in golden batter. Crunchy armour and a heavy shove.',
    stats: { mass: 1.18, speed: 0.92, turn: 0.9, take: 0.95, power: 1.18 },
  },
  {
    id: 'charred', name: 'KOGETA', jp: '焦げた', rank: 'OZEKI', cook: 'Extra Crispy', skin: 1,
    blurb: 'Left in the oven through two shifts. Light, quick and brittle as charcoal.',
    stats: { mass: 0.82, speed: 1.15, turn: 1.2, take: 1.2, power: 1.05 },
  },
  {
    id: 'rotten', name: 'FUNIKU', jp: '腐肉', rank: 'JŪRYŌ', cook: 'Gone Off', skin: 5,
    blurb: 'Found at the back of the fridge. Nobody wants to grapple with it, which is half the battle.',
    stats: { mass: 1.05, speed: 0.88, turn: 0.95, take: 1.15, power: 1.12 },
  },
  {
    id: 'bagged', name: 'RAPPU', jp: 'ラップ', rank: 'MAKUSHITA', cook: 'Oven Bagged', skin: 6,
    blurb: 'Still sealed in the roasting bag. Slippery, cushioned, and tied off with a jaunty ponytail.',
    stats: { mass: 0.98, speed: 0.96, turn: 1.08, take: 0.82, power: 0.94 },
  },
];

// The solo tournament's final boss: Rōsuto, supersized. Not in the selectable roster. size scales
// its body (and collision circle) in the ring.
export const BOSS = {
  id: 'mega', name: 'MEGARŌSUTO', jp: 'メガロースト', rank: 'YOKOZUNA', cook: 'Golden Roast, Supersized', skin: 0, size: 2,
  blurb: 'Twice the bird, twice the basting. Guardian of the Emperor\'s Cup.',
  stats: { mass: 2.2, speed: 0.78, turn: 0.7, take: 0.55, power: 1.6 },
};

// The four bars shown on the select screen, each 0..1.
export function statBars(c) {
  const s = c.stats;
  const n = (v, lo, hi) => Math.max(0.08, Math.min(1, (v - lo) / (hi - lo)));
  return [
    ['WEIGHT', n(s.mass, 0.6, 1.5)],
    ['SPEED', n((s.speed + s.turn) / 2, 0.6, 1.25)],
    ['POWER', n(s.power, 0.75, 1.25)],
    ['GRIT', n(2 - s.take, 0.6, 1.3)],
  ];
}

// The four mawashi colours, by slot: blue (you against the CPU, or the host), red (the CPU, or the
// first mate), then green and gold for the third and fourth wrestlers in an online ring.
// body is the belt painted on the chicken; belt/glow/tag are the HUD and select-screen colours.
export const SLOTS = [
  { name: 'BLUE', body: 0x1d2f6b, belt: '#2f4fbf', glow: '#4f72ff', tag: '#8fa6ff' },
  { name: 'RED', body: 0x7a1a2a, belt: '#b8283f', glow: '#ff4f6a', tag: '#ff8a9a' },
  { name: 'GREEN', body: 0x1f5a2a, belt: '#2f9a4a', glow: '#4fdc72', tag: '#8fe0a0' },
  { name: 'GOLD', body: 0x7a6a12, belt: '#d9b62f', glow: '#ffd23f', tag: '#ffe08a' },
];
