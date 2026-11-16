// Freeze generated levels into puzzles/puzzles.json, and verify hand-written ones.
//
//   node tools/generate.mjs            → (re)generate levels 1–200, keep hand-made entries
//   node tools/generate.mjs 1 500      → generate levels 1–500
//   node tools/generate.mjs --check    → only verify every level in the file (solvable, par correct)
//
// Why freeze? Any level number can be generated on the fly, but if you tweak the generator
// later, unfrozen levels change. Frozen levels stay identical (players keep their stars).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, solve, parseLevel, hashSeed, TIERS, tierForLevel } from '../js/engine.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const file = path.join(root, 'puzzles', 'puzzles.json');
const args = process.argv.slice(2);
const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
const byLevel = new Map((existing.levels || []).map((p) => [p.level, p]));

function verify(p) {
  const sol = solve(parseLevel(p.rows), { maxStates: 500000, maxDepth: 40 });
  if (!sol) throw new Error(`Level ${p.level}: NOT SOLVABLE`);
  if (p.par && p.par !== sol.par) throw new Error(`Level ${p.level}: par says ${p.par} but optimum is ${sol.par}`);
  return sol;
}

if (args[0] === '--check') {
  for (const p of byLevel.values()) { const s = verify(p); console.log(`level ${p.level}: ok, par ${s.par}`); }
  process.exit(0);
}

const from = +(args[0] || 1), to = +(args[1] || 200);
for (let n = from; n <= to; n++) {
  const prev = byLevel.get(n);
  if (prev && prev.handmade) { verify(prev); continue; }
  const tier = tierForLevel(n);
  const g = generate(hashSeed(n), tier);
  byLevel.set(n, { level: n, tier, par: g.par, limit: g.limit, rows: g.rows, solution: g.solution.map((d) => d[0].toUpperCase()).join('') });
  console.log(`level ${String(n).padStart(3)} ${TIERS[tier].name.padEnd(7)} par ${g.par} limit ${g.limit}${g.fallback ? ' (fallback)' : ''}`);
}
const levels = [...byLevel.values()].sort((a, b) => a.level - b.level);
fs.mkdirSync(path.dirname(file), { recursive: true });
const body = levels.map((p) => '    ' + JSON.stringify(p)).join(',\n');
fs.writeFileSync(file, `{\n  "_readme": "Levels in play order. rows: . floor  # wall  x drain  R G B Y marbles  r g b y holes  C crate. 'solution' is a spoiler (U/D/L/R). Set handmade:true to protect an entry from regeneration.",\n  "levels": [\n${body}\n  ]\n}\n`);
console.log(`wrote ${levels.length} levels → ${path.relative(root, file)}`);
