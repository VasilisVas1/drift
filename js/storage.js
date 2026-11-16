// Versioned localStorage save. Every read goes through migrate(), so old saves keep working.
import { CONFIG } from './config.js';

function blank() {
  return {
    version: CONFIG.STORAGE_VERSION,
    settings: { muted: false, seenHelp: false, hasMoved: false },
    progress: {
      unlocked: 1,     // highest level you may play
      current: 1,      // level shown when the game opens
      levels: {},      // n -> { stars, best }  (best = fewest moves)
    },
    inProgress: null,  // { n, history:[dirs] } so a reload restores the board
  };
}

// One step per version bump.
const MIGRATIONS = {
  // v1 was the daily-puzzle version: keep settings, drop daily stats.
  1: (s) => ({ ...blank(), settings: { ...blank().settings, ...s.settings }, version: 2 }),
};

function migrate(save) {
  if (!save || typeof save !== 'object' || typeof save.version !== 'number') return blank();
  let s = save;
  while (s.version < CONFIG.STORAGE_VERSION && MIGRATIONS[s.version]) s = MIGRATIONS[s.version](s);
  if (s.version !== CONFIG.STORAGE_VERSION) return blank();
  const b = blank();
  return { ...b, ...s, settings: { ...b.settings, ...s.settings }, progress: { ...b.progress, ...s.progress } };
}

let cache = null;
export function load() {
  if (cache) return cache;
  try { cache = migrate(JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY))); }
  catch { cache = blank(); }
  return cache;
}
export function save() {
  try { localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(cache)); } catch { /* private mode / quota */ }
}

// Records a solve. Returns { newBest, improvedStars }.
export function recordWin(n, stars, moves) {
  const p = load().progress;
  const prev = p.levels[n];
  const rec = { stars: Math.max(stars, prev?.stars ?? 0), best: Math.min(moves, prev?.best ?? Infinity) };
  p.levels[n] = rec;
  p.unlocked = Math.max(p.unlocked, n + 1);
  save();
  return { newBest: !prev || moves < prev.best, improvedStars: !prev || stars > prev.stars, firstClear: !prev };
}

export function totals() {
  const lv = Object.values(load().progress.levels);
  return { cleared: lv.length, stars: lv.reduce((a, l) => a + l.stars, 0), perfect: lv.filter((l) => l.stars === 3).length };
}
