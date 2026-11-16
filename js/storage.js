// Versioned localStorage save. Every read goes through migrate(), so old saves keep working.
import { CONFIG } from './config.js';

function blank() {
  return {
    version: CONFIG.STORAGE_VERSION,
    settings: { muted: false, seenHelp: false },
    stats: {
      played: 0,
      wins: 0,
      currentStreak: 0,
      bestStreak: 0,
      perfect: 0,             // wins that matched par
      dist: { 1: 0, 2: 0, 3: 0, fail: 0 }, // which life you won on
      lastWonDay: null,       // puzzle number of the last daily win (for streaks)
      lastPlayedDay: null,
    },
    days: {},                 // puzzleNumber -> { status, livesUsed, history, moves, attempts:[...] }
  };
}

// Add a case per version bump: v1 -> v2, v2 -> v3 ...
const MIGRATIONS = {
  // 1: (s) => { s.newField = ...; s.version = 2; return s; },
};

function migrate(save) {
  if (!save || typeof save !== 'object' || typeof save.version !== 'number') return blank();
  let s = save;
  while (s.version < CONFIG.STORAGE_VERSION && MIGRATIONS[s.version]) s = MIGRATIONS[s.version](s);
  if (s.version !== CONFIG.STORAGE_VERSION) return blank(); // unknown future/old format
  const b = blank();
  return { ...b, ...s, settings: { ...b.settings, ...s.settings }, stats: { ...b.stats, ...s.stats, dist: { ...b.stats.dist, ...(s.stats || {}).dist } } };
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
export function resetAll() { cache = blank(); save(); }

// Called once when a *daily* puzzle ends (win or loss).
export function recordDailyResult(num, { won, lifeNumber, perfect }) {
  const s = load().stats;
  s.played++;
  if (won) {
    s.wins++;
    s.dist[lifeNumber]++;
    if (perfect) s.perfect++;
    s.currentStreak = s.lastWonDay === num - 1 ? s.currentStreak + 1 : 1;
    s.lastWonDay = num;
    s.bestStreak = Math.max(s.bestStreak, s.currentStreak);
  } else {
    s.dist.fail++;
    s.currentStreak = 0;
  }
  s.lastPlayedDay = num;
  save();
}

// A streak is broken if you skipped yesterday.
export function liveStreak(todayNum) {
  const s = load().stats;
  if (s.lastWonDay === todayNum || s.lastWonDay === todayNum - 1) return s.currentStreak;
  return 0;
}
