// Roast Royale: the announcer. Spoken words (the referee's calls, the winning technique, the
// chickens' names) played over the music, compressed so they sit up front, with a little of the
// hall's reverb. Words queue up so two never talk over each other.
import { ac, hallReverb } from './effects.js';

const FILES = {
  hakkeyoi: 'hakkeyoi', nokotta: 'nokotta',
  'YORIKIRI!': 'yorikiri', 'ISAMIASHI!': 'isamiashi', 'KOPPORI!': 'koppori', 'YŪSHŌ': 'yusho',
  rosuto: 'rosuto', yakitori: 'yakitori', reito: 'reito', katsu: 'katsu', kogeta: 'kogeta', funiku: 'funiku', rappu: 'rappu', megarosuto: 'megarosuto',
};
const LOUDNESS = 0.7;    // a little above the music (0.22-0.4) without shouting over it
const GAP = 0.12;        // seconds between queued words

const buffers = {};
let chain = null, playing = null, queue = [], muted = false, level = null;
export function setVoiceMuted(m) { muted = m; if (level) level.gain.value = m ? 0 : LOUDNESS; }

// 'RŌSUTO' -> 'rosuto'
export const voiceKey = (name) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function load(a, key) {
  const file = FILES[key];
  if (!file) return null;
  if (!buffers[key]) {
    buffers[key] = fetch(`assets/words/${file}.mp3`)
      .then((r) => r.arrayBuffer())
      .then((b) => a.decodeAudioData(b))
      .catch(() => null);
  }
  return buffers[key];
}

function output(a) {
  if (chain) return chain;
  const comp = a.createDynamicsCompressor();
  comp.threshold.value = -24;
  comp.knee.value = 10;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;
  const gain = a.createGain();
  gain.gain.value = muted ? 0 : LOUDNESS;
  level = gain;
  comp.connect(gain);
  gain.connect(a.destination);
  gain.connect(hallReverb(a, 0.2));
  chain = comp;
  return chain;
}

async function next() {
  if (playing || !queue.length) return;
  const a = ac();
  if (!a) { queue = []; return; }
  const key = queue.shift();
  const buf = await load(a, key);
  if (!buf) { next(); return; }
  const src = a.createBufferSource();
  src.buffer = buf;
  src.connect(output(a));
  playing = src;
  src.onended = () => { if (playing === src) playing = null; setTimeout(next, GAP * 1000); };
  src.start();
}

/**
 * Say a word: a key from FILES ('hakkeyoi', 'YORIKIRI!', a chicken's voiceKey...). Words without a
 * recording are skipped. interrupt: stop whatever's being said and drop the queue first.
 */
export function say(key, { interrupt = false } = {}) {
  if (!FILES[key]) return;
  if (interrupt) {
    queue = [];
    if (playing) { const p = playing; playing = null; try { p.stop(); } catch { /* already ended */ } }
  }
  queue.push(key);
  next();
}

// Fetch and decode everything up front so the first word isn't late (once audio is allowed).
export function preloadVoices() {
  const a = ac();
  if (a) for (const key of Object.keys(FILES)) load(a, key);
}
