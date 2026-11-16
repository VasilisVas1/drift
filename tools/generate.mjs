// Freeze generated puzzles into puzzles/puzzles.json, and verify hand-written ones.
//
//   node tools/generate.mjs            → (re)generate days 1–60, keep any hand-written entries
//   node tools/generate.mjs 1 365      → generate days 1–365
//   node tools/generate.mjs --check    → only verify every puzzle in the file (solvable, par correct)
//
// Why freeze? The game can generate any day on the fly, but if you ever tweak the generator,
// unfrozen days would change. Frozen days stay identical forever (important for an archive).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, solve, parseLevel, hashSeed, DIFFICULTY } from '../js/engine.js';
import { CONFIG } from '../js/config.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const file = path.join(root, 'puzzles', 'puzzles.json');
const LAUNCH = Date.parse(CONFIG.LAUNCH_DATE_UTC + 'T00:00:00Z');
const diffFor = (n) => (new Date(LAUNCH + (n - 1) * 86400000).getUTCDay() + 6) % 7;

const args = process.argv.slice(2);
const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { puzzles: [] };
const byDay = new Map(existing.puzzles.map((p) => [p.day, p]));

function verify(p) {
  const sol = solve(parseLevel(p.rows), { maxStates: 500000, maxDepth: 40 });
  if (!sol) throw new Error(`Day ${p.day}: NOT SOLVABLE`);
  if (p.par && p.par !== sol.par) throw new Error(`Day ${p.day}: par says ${p.par} but optimum is ${sol.par}`);
  return sol;
}

if (args[0] === '--check') {
  for (const p of existing.puzzles) { const s = verify(p); console.log(`day ${p.day}: ok, par ${s.par}`); }
  process.exit(0);
}

const from = +(args[0] || 1), to = +(args[1] || 60);
for (let n = from; n <= to; n++) {
  const prev = byDay.get(n);
  if (prev && prev.handmade) { verify(prev); continue; }
  const di = diffFor(n);
  const g = generate(hashSeed(n), di);
  byDay.set(n, { day: n, difficulty: di, par: g.par, limit: g.limit, rows: g.rows, solution: g.solution.map((d) => d[0].toUpperCase()).join('') });
  console.log(`day ${String(n).padStart(3)} ${DIFFICULTY[di].name} par ${g.par} limit ${g.limit}${g.fallback ? ' (fallback)' : ''}`);
}
const puzzles = [...byDay.values()].sort((a, b) => a.day - b.day);
fs.mkdirSync(path.dirname(file), { recursive: true });
const body = puzzles.map((p) => '    ' + JSON.stringify(p)).join(',\n');
fs.writeFileSync(file, `{\n  "_readme": "Puzzles by day number. rows: . floor  # wall  x drain  R G B Y marbles  r g b y holes  C crate. 'solution' is a spoiler (U/D/L/R). Set handmade:true to protect an entry from regeneration.",\n  "puzzles": [\n${body}\n  ]\n}\n`);
console.log(`wrote ${puzzles.length} puzzles → ${path.relative(root, file)}`);
