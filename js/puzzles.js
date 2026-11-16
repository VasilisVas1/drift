// Puzzle source: day number <-> date, and "get puzzle #N" from the JSON bank or the generator.
import { CONFIG } from './config.js';
import { generate, solve, parseLevel, hashSeed, DIFFICULTY } from './engine.js';

const DAY_MS = 86400000;
const launchMs = Date.parse(CONFIG.LAUNCH_DATE_UTC + 'T00:00:00Z');

export function dayNumberFromDate(date) {
  return Math.floor((date.getTime() - launchMs) / DAY_MS) + 1;
}
export function dateFromDayNumber(n) {
  return new Date(launchMs + (n - 1) * DAY_MS);
}
export function isoDate(d) { return d.toISOString().slice(0, 10); }

// Monday = 0 … Sunday = 6, using the UTC date of the puzzle
export function difficultyIndexFor(n) {
  return (dateFromDayNumber(n).getUTCDay() + 6) % 7;
}

export function msUntilNextPuzzle(now = new Date()) {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return next - now.getTime();
}

let bank = {};
export async function loadBank() {
  try {
    const res = await fetch(CONFIG.PUZZLE_FILE, { cache: 'no-cache' });
    const data = await res.json();
    for (const p of data.puzzles || []) bank[p.day] = p;
  } catch (e) {
    console.warn('Puzzle file not loaded, using the generator for every day.', e);
  }
}

const cache = new Map();

// Every mode goes through here: daily (#today), archive (#N), practice (random seed).
// kind 'day' → puzzle number N; kind 'seed' → practice board from an arbitrary seed.
export function getPuzzle({ kind = 'day', n, diffIndex }) {
  const key = kind + ':' + n + ':' + diffIndex;
  if (cache.has(key)) return cache.get(key);
  let p;
  if (kind === 'day' && bank[n]) {
    const b = bank[n];
    const di = b.difficulty ?? difficultyIndexFor(n);
    const sol = b.par ? null : solve(parseLevel(b.rows));
    const par = b.par ?? sol.par;
    p = { rows: b.rows, par, limit: b.limit ?? par + DIFFICULTY[di].slack, diffIndex: di, source: 'bank' };
  } else {
    const di = diffIndex ?? (kind === 'day' ? difficultyIndexFor(n) : 2);
    const seed = kind === 'day' ? hashSeed(n) : hashSeed(n, 0x51ced);
    const g = generate(seed, di);
    p = { rows: g.rows, par: g.par, limit: g.limit, diffIndex: di, source: 'generated' };
  }
  p.kind = kind;
  p.n = n;
  cache.set(key, p);
  return p;
}
