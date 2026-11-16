// DRIFT — pure game engine: parsing, tilt simulation, BFS solver, generator.
// No DOM access here, so the same file runs in the browser and in Node (tools/generate.mjs).
//
// Level map legend (one string per row):
//   .  floor        #  wall          x  pit (swallows any marble)
//   R G B Y  marble (coral, teal/green, blue, yellow)
//   r g b y  hole for the marble of that colour
//   C  crate — slides like a marble but never falls; it can cover a hole

export const COLORS = ['R', 'G', 'B', 'Y'];
export const DIRS = {
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
};
export const DIR_NAMES = ['up', 'right', 'down', 'left'];

// ---------- seeded RNG ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashSeed(n, salt = 0x9e3779b9) {
  let h = (n ^ salt) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

// ---------- parsing ----------
export function parseLevel(rows) {
  const h = rows.length;
  const w = rows[0].length;
  const cells = new Array(w * h).fill('.'); // static layer: . # x r g b y
  const pieces = [];
  let id = 0;
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) throw new Error(`Row ${y} has wrong length`);
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      const i = y * w + x;
      if (ch === '#' || ch === 'x' || ch === '.') cells[i] = ch;
      else if ('rgby'.includes(ch)) cells[i] = ch;
      else if ('RGBY'.includes(ch)) pieces.push({ id: id++, type: 'marble', color: ch, x, y });
      else if (ch === 'C') pieces.push({ id: id++, type: 'crate', color: null, x, y });
      else throw new Error(`Unknown map char "${ch}"`);
    }
  }
  return { w, h, cells, pieces };
}

export function initialState(level) {
  return level.pieces.map((p) => ({ ...p, alive: true }));
}

// ---------- simulation ----------
// Returns { state, moves:[{id, from:{x,y}, to:{x,y}, dist, fell:null|'ok'|'wrong'|'pit'}], moved, failed, won }
export function tilt(level, state, dirName) {
  const { dx, dy } = DIRS[dirName];
  const { w, h, cells } = level;
  const next = state.map((p) => ({ ...p }));
  const occ = new Map(); // cell index -> piece id (settled pieces)
  // pieces furthest in the direction of travel move first
  const order = next
    .filter((p) => p.alive)
    .sort((a, b) => (b.x * dx + b.y * dy) - (a.x * dx + a.y * dy));
  // pre-occupy every live piece; each piece frees its own cell when it moves
  for (const p of order) occ.set(p.y * w + p.x, p.id);

  const moves = [];
  let failed = false;
  for (const p of order) {
    const from = { x: p.x, y: p.y };
    occ.delete(p.y * w + p.x);
    let fell = null;
    let dist = 0;
    while (true) {
      const nx = p.x + dx, ny = p.y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) break;
      const ni = ny * w + nx;
      if (cells[ni] === '#' || occ.has(ni)) break;
      p.x = nx; p.y = ny; dist++;
      if (p.type === 'marble') {
        const c = cells[ni];
        if (c === 'x') { fell = 'pit'; break; }
        if ('rgby'.includes(c)) { fell = c.toUpperCase() === p.color ? 'ok' : 'wrong'; break; }
      }
    }
    if (fell) {
      p.alive = false;
      if (fell !== 'ok') failed = true;
    } else {
      occ.set(p.y * w + p.x, p.id);
    }
    moves.push({ id: p.id, from, to: { x: p.x, y: p.y }, dist, fell });
  }
  const moved = moves.some((m) => m.dist > 0);
  const won = !failed && next.every((p) => p.type !== 'marble' || !p.alive);
  return { state: next, moves, moved, failed, won };
}

function keyOf(state) {
  let k = '';
  for (const p of state) k += p.alive ? p.x + ',' + p.y + ';' : '-;';
  return k;
}

// ---------- solver (BFS, shortest solution) ----------
export function solve(level, { maxStates = 60000, maxDepth = 30 } = {}) {
  const start = initialState(level);
  const seen = new Map([[keyOf(start), null]]);
  let frontier = [{ state: start, path: [] }];
  let explored = 0;
  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    const nextFrontier = [];
    for (const node of frontier) {
      for (const d of DIR_NAMES) {
        const r = tilt(level, node.state, d);
        if (!r.moved || r.failed) continue;
        const path = node.path.concat(d);
        if (r.won) return { par: path.length, solution: path, explored };
        const k = keyOf(r.state);
        if (seen.has(k)) continue;
        seen.set(k, null);
        if (++explored > maxStates) return null;
        nextFrontier.push({ state: r.state, path });
      }
    }
    frontier = nextFrontier;
  }
  return null;
}

// Fraction of random swipe sequences (within the move limit) that win — used to reject "mash-able" boards.
export function randomWinRate(level, limit, trials, rng) {
  let wins = 0;
  for (let t = 0; t < trials; t++) {
    let s = initialState(level);
    for (let m = 0; m < limit; m++) {
      const r = tilt(level, s, DIR_NAMES[(rng() * 4) | 0]);
      if (r.failed) break;
      s = r.state;
      if (r.won) { wins++; break; }
    }
  }
  return wins / trials;
}

// ---------- difficulty tiers ----------
// Levels climb through these tiers (see tierForLevel). size = board width/height.
export const TIERS = [
  { name: 'Intro',   size: 5, marbles: [1, 1], crates: [0, 0], pits: [0, 0], par: [2, 3],  walls: [3, 5]  },
  { name: 'Breezy',  size: 6, marbles: [1, 2], crates: [0, 0], pits: [0, 1], par: [4, 5],  walls: [5, 8]  },
  { name: 'Easy',    size: 6, marbles: [2, 2], crates: [0, 0], pits: [0, 1], par: [5, 6],  walls: [5, 8]  },
  { name: 'Medium',  size: 7, marbles: [2, 2], crates: [0, 1], pits: [1, 2], par: [6, 7],  walls: [6, 10] },
  { name: 'Tricky',  size: 7, marbles: [2, 3], crates: [0, 1], pits: [1, 2], par: [7, 8],  walls: [6, 10] },
  { name: 'Hard',    size: 7, marbles: [3, 3], crates: [0, 2], pits: [1, 2], par: [8, 10], walls: [6, 10] },
  { name: 'Expert',  size: 7, marbles: [3, 3], crates: [0, 2], pits: [1, 3], par: [9, 11], walls: [6, 10] },
  { name: 'Brutal',  size: 7, marbles: [3, 3], crates: [1, 2], pits: [1, 3], par: [10, 13], walls: [6, 10] },
];

// Level number -> tier index. Every 5th level is a "boss" one tier above its neighbours.
const TIER_STARTS = [1, 4, 11, 21, 33, 46, 61, 81];
export function tierForLevel(n) {
  let t = 0;
  for (let i = 0; i < TIER_STARTS.length; i++) if (n >= TIER_STARTS[i]) t = i;
  if (n > 5 && n % 5 === 0) t = Math.min(TIERS.length - 1, t + 1);
  return t;
}

// ---------- move limit & stars ----------
// 3★ = par (optimal). 2★ = a little over par. 1★ = solved within the move limit.
export function limitFor(par) { return par + Math.max(3, Math.ceil(par * 0.75)); }
export function twoStarMax(par) { return par + Math.max(1, Math.ceil(par * 0.3)); }
export function starsFor(moves, par) {
  if (moves <= par) return 3;
  if (moves <= twoStarMax(par)) return 2;
  return 1;
}

// ---------- generator ----------
function randInt(rng, [lo, hi]) { return lo + Math.floor(rng() * (hi - lo + 1)); }

function randomBoard(rng, diff) {
  const n = diff.size;
  const grid = Array.from({ length: n }, () => new Array(n).fill('.'));
  const free = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) free.push([x, y]);
  // shuffle
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [free[i], free[j]] = [free[j], free[i]];
  }
  const take = () => free.pop();
  const put = (ch) => { const [x, y] = take(); grid[y][x] = ch; };
  const nM = randInt(rng, diff.marbles);
  const colors = COLORS.slice(0, 3);
  // shuffle colours so the palette varies day to day
  for (let i = colors.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [colors[i], colors[j]] = [colors[j], colors[i]];
  }
  for (let i = 0; i < nM; i++) { put(colors[i]); put(colors[i].toLowerCase()); }
  for (let i = randInt(rng, diff.crates); i > 0; i--) put('C');
  for (let i = randInt(rng, diff.pits); i > 0; i--) put('x');
  for (let i = randInt(rng, diff.walls); i > 0; i--) put('#');
  return grid.map((r) => r.join(''));
}

// Tries random boards until one meets the difficulty band. Deterministic for a given seed.
export function generate(seed, tierIndex, { maxTries = 4000 } = {}) {
  const diff = TIERS[tierIndex];
  const rng = mulberry32(seed);
  let best = null;
  for (let t = 0; t < maxTries; t++) {
    const rows = randomBoard(rng, diff);
    const level = parseLevel(rows);
    const sol = solve(level, { maxStates: 40000, maxDepth: diff.par[1] + 1 });
    if (!sol) continue;
    if (sol.par < diff.par[0] || sol.par > diff.par[1]) {
      if (!best || sol.par > best.par) best = { rows, par: sol.par, solution: sol.solution };
      continue;
    }
    const limit = limitFor(sol.par);
    // reject boards that random swiping solves too often (intro boards are allowed to be easy)
    if (tierIndex > 0 && randomWinRate(level, limit, 300, rng) > 0.03) continue;
    return { rows, par: sol.par, solution: sol.solution, limit, tries: t + 1 };
  }
  if (best) return { ...best, limit: limitFor(best.par), fallback: true };
  return null;
}
