// Level source: puzzles.json if the level is listed there, otherwise the seeded generator.
import { CONFIG } from './config.js';
import { generate, solve, parseLevel, hashSeed, tierForLevel, limitFor } from './engine.js';

let bank = {};
export async function loadBank() {
  try {
    const res = await fetch(CONFIG.PUZZLE_FILE, { cache: 'no-cache' });
    const data = await res.json();
    for (const p of data.levels || []) bank[p.level] = p;
  } catch (e) {
    console.warn('Puzzle file not loaded, generating every level.', e);
  }
}

const cache = new Map();

// The one entry point for any level: same number → same board for every player.
export function getLevel(n) {
  if (cache.has(n)) return cache.get(n);
  let p;
  const b = bank[n];
  if (b) {
    const par = b.par ?? solve(parseLevel(b.rows)).par;
    p = { rows: b.rows, par, limit: b.limit ?? limitFor(par), tier: b.tier ?? tierForLevel(n) };
  } else {
    const tier = tierForLevel(n);
    const g = generate(hashSeed(n), tier);
    p = { rows: g.rows, par: g.par, limit: g.limit, tier };
  }
  p.n = n;
  cache.set(n, p);
  return p;
}
