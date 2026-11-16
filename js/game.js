// DRIFT — UI, input, animation and level flow.
import { CONFIG } from './config.js';
import { parseLevel, initialState, tilt, TIERS, tierForLevel, starsFor, twoStarMax } from './engine.js';
import { loadBank, getLevel } from './puzzles.js';
import * as store from './storage.js';
import { sfx, unlock, setMuted } from './audio.js';

// ---------- dev switches ----------
//   ?level=N  open level N directly (ignores locks)
//   ?dev=1    every level unlocked in the level select (not saved)
const params = new URLSearchParams(location.search);
const URL_LEVEL = parseInt(params.get('level'), 10) || null;
const DEV = params.get('dev') === '1' || !!URL_LEVEL;

const GLYPH = { R: '●', G: '▲', B: '■', Y: '◆' };
const $ = (id) => document.getElementById(id);
const save = store.load();
setMuted(save.settings.muted);

const canPlay = (n) => n >= 1 && (DEV || n <= save.progress.unlocked);

// ---------- session ----------
let S = null;
let busy = false;

function startLevel(n, { restoreHistory = null } = {}) {
  const puzzle = getLevel(n);
  const level = parseLevel(puzzle.rows);
  S = { n, puzzle, level, pieces: initialState(level), moves: 0, history: [], sunk: [], tries: 1, status: 'playing' };
  if (restoreHistory) replay(restoreHistory);
  save.progress.current = n;
  persist();
  busy = false;
  closeModals();
  buildBoard();
  renderHud();
  renderMeta();
}

// Re-applies a saved in-progress board without animation (after a reload).
function replay(history) {
  for (const dir of history) {
    const r = tilt(S.level, S.pieces, dir);
    if (!r.moved) continue;
    if (r.failed || r.won) break;
    S.pieces = r.state;
    S.moves++;
    S.history.push(dir);
    for (const m of r.moves) if (m.fell === 'ok') S.sunk.push(pieceById(m.id).color);
  }
}

function persist() {
  save.inProgress = S && S.status === 'playing' ? { n: S.n, history: S.history.slice() } : null;
  store.save();
}

const pieceById = (id) => S.pieces.find((p) => p.id === id);

// ---------- board rendering ----------
const boardEl = $('board');
const wrapEl = $('board-wrap');
let pieceEls = new Map();
let holeEls = new Map(); // color -> el

function cellSize() {
  const { w, h } = S.level;
  const availW = Math.min(window.innerWidth, 480) - 28 - 22 - 6;
  const availH = window.innerHeight - 300;
  return Math.max(30, Math.floor(Math.min(availW / w, Math.max(availH, 240) / h, 64)));
}

function buildBoard() {
  const { w, h, cells } = S.level;
  $('app').style.setProperty('--cell', cellSize() + 'px');
  boardEl.style.setProperty('--w', w);
  boardEl.style.setProperty('--h', h);
  boardEl.innerHTML = '';
  pieceEls = new Map();
  holeEls = new Map();
  cells.forEach((c, i) => {
    if (c === '.') return;
    const t = document.createElement('div');
    t.style.setProperty('--x', i % w);
    t.style.setProperty('--y', Math.floor(i / w));
    if (c === '#') t.className = 'tile wall';
    else if (c === 'x') t.className = 'tile pit';
    else {
      const col = c.toUpperCase();
      t.className = 'tile hole c-' + col;
      t.innerHTML = `<span class="glyph">${GLYPH[col]}</span>`;
      if (S.sunk.includes(col)) t.classList.add('filled');
      holeEls.set(col, t);
    }
    boardEl.appendChild(t);
  });
  for (const p of S.pieces) {
    if (!p.alive) continue;
    const el = document.createElement('div');
    el.className = 'piece';
    el.style.setProperty('--x', p.x);
    el.style.setProperty('--y', p.y);
    el.innerHTML = p.type === 'marble'
      ? `<div class="marble c-${p.color}"><span class="glyph">${GLYPH[p.color]}</span></div>`
      : `<div class="crate"></div>`;
    boardEl.appendChild(el);
    pieceEls.set(p.id, el);
  }
  $('swipe-hint').classList.toggle('gone', save.settings.hasMoved || S.moves > 0);
}

let lastLiveStars = 3;
function renderHud() {
  const live = S.status === 'won' ? S.stars : liveStars();
  const meter = $('star-meter');
  meter.innerHTML = [0, 1, 2].map((i) => `<i class="${i < live ? '' : 'off'}${i === live && live < lastLiveStars ? ' drop' : ''}"></i>`).join('');
  lastLiveStars = live;
  $('moves').textContent = S.moves;
  $('limit').textContent = S.puzzle.limit;
  $('par').textContent = S.puzzle.par;
  const frac = S.moves / S.puzzle.limit;
  const bar = $('movebar');
  bar.style.width = Math.min(100, frac * 100) + '%';
  bar.className = 'movebar-fill' + (S.puzzle.limit - S.moves <= 1 ? ' danger' : live < 3 ? ' warn' : '');
  $('btn-prev').disabled = S.n <= 1;
  $('btn-next').disabled = !canPlay(S.n + 1);
  $('total-stars').textContent = store.totals().stars;
}

// Best stars still reachable: the earliest you can now finish is on your next move.
function liveStars() { return starsFor(S.moves + 1, S.puzzle.par); }

function renderMeta() {
  const tier = TIERS[S.puzzle.tier];
  const boss = S.n > 5 && S.n % 5 === 0;
  $('subline').textContent = `Level ${S.n} · ${tier.name}${boss ? ' · boss' : ''}`;
  const banner = $('mode-banner');
  banner.hidden = !DEV;
  banner.textContent = 'dev mode · all levels open';
}

// ---------- moves ----------
const SLIDE_MS = 52; // per cell — constant speed so pieces never overlap mid-slide

function px(cells) { return cells * parseFloat(getComputedStyle($('app')).getPropertyValue('--cell')); }

function animateMoves(moves) {
  const anims = [];
  let maxDist = 0;
  for (const m of moves) {
    if (m.dist === 0) continue;
    maxDist = Math.max(maxDist, m.dist);
    const el = pieceEls.get(m.id);
    const p = pieceById(m.id);
    const dur = m.dist * SLIDE_MS + 40;
    const from = `translate(${px(m.from.x)}px, ${px(m.from.y)}px)`;
    const to = `translate(${px(m.to.x)}px, ${px(m.to.y)}px)`;
    const a = el.animate([{ transform: from }, { transform: to }], { duration: dur, easing: 'cubic-bezier(.35,.05,.6,1)', fill: 'forwards' });
    anims.push(a.finished.then(() => {
      el.style.setProperty('--x', m.to.x);
      el.style.setProperty('--y', m.to.y);
      if (!m.fell) {
        sfx.clack();
        const dx = m.to.x - m.from.x, dy = m.to.y - m.from.y;
        const sx = dx ? 0.82 : 1.12, sy = dy ? 0.82 : 1.12;
        el.firstElementChild.animate([{ transform: 'scale(1)' }, { transform: `scale(${sx}, ${sy})` }, { transform: 'scale(1)' }], { duration: 160, easing: 'ease-out' });
        a.cancel();
        return;
      }
      return fallInto(el, m, p);
    }));
  }
  if (maxDist) sfx.roll(maxDist);
  return Promise.all(anims);
}

function fallInto(el, m, p) {
  const inner = el.firstElementChild;
  if (m.fell === 'ok') {
    sfx.sink();
    if (navigator.vibrate) navigator.vibrate(12);
    S.sunk.push(p.color);
    return inner.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.35)', opacity: 0.2 }], { duration: 260, easing: 'ease-in', fill: 'forwards' })
      .finished.then(() => { el.remove(); pieceEls.delete(m.id); holeEls.get(p.color)?.classList.add('filled'); });
  }
  sfx.wrong();
  if (navigator.vibrate) navigator.vibrate([40, 40, 60]);
  return inner.animate([{ transform: 'scale(1)', filter: 'none' }, { transform: 'scale(1.15)', filter: 'brightness(1.4)' }, { transform: 'scale(0)', opacity: 0 }], { duration: 480, easing: 'ease-in', fill: 'forwards' })
    .finished.then(() => { el.remove(); pieceEls.delete(m.id); });
}

function tiltBoard(dir) {
  const k = 6;
  const t = { left: `rotateY(${-k}deg)`, right: `rotateY(${k}deg)`, up: `rotateX(${k}deg)`, down: `rotateX(${-k}deg)` }[dir];
  wrapEl.animate([{ transform: 'none' }, { transform: t, offset: 0.35 }, { transform: 'none' }], { duration: 420, easing: 'ease-out' });
}

function nudge(dir) {
  const d = { left: [-4, 0], right: [4, 0], up: [0, -4], down: [0, 4] }[dir];
  wrapEl.animate([{ transform: 'none' }, { transform: `translate(${d[0]}px, ${d[1]}px)` }, { transform: 'none' }], { duration: 160 });
}

async function doMove(dir) {
  unlock();
  flashPad(dir);
  if (busy || !S || S.status !== 'playing') return;
  const r = tilt(S.level, S.pieces, dir);
  if (!r.moved) { nudge(dir); return; }
  busy = true;
  hideHint();
  S.moves++;
  S.history.push(dir);
  renderHud();
  tiltBoard(dir);
  if (!r.failed && !r.won) persist();
  await animateMoves(r.moves);
  S.pieces = r.state;
  if (r.failed) {
    const wrongMove = r.moves.find((m) => m.fell === 'wrong');
    if (wrongMove) {
      const holeCol = S.level.cells[wrongMove.to.y * S.level.w + wrongMove.to.x].toUpperCase();
      holeEls.get(holeCol)?.classList.add('flash');
    }
    await fail(wrongMove ? 'Wrong hole!' : 'Down the drain!');
  } else if (r.won) {
    win();
  } else if (S.moves >= S.puzzle.limit) {
    await fail('Out of moves!');
  }
  busy = false;
}

function hideHint() {
  $('swipe-hint').classList.add('gone');
  if (!save.settings.hasMoved) { save.settings.hasMoved = true; store.save(); }
}

// Failing just resets the board — no lives, retries are free.
async function fail(msg) {
  wrapEl.classList.remove('shake'); void wrapEl.offsetWidth; wrapEl.classList.add('shake');
  toast(`${msg} Try again.`);
  S.history = [];
  persist(); // commit the reset first so a reload mid-animation can't restore the failed board
  await wait(1000);
  resetBoard();
}

function resetBoard() {
  S.tries++;
  S.moves = 0;
  S.history = [];
  S.sunk = [];
  S.pieces = initialState(S.level);
  persist();
  buildBoard();
  renderHud();
  boardEl.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
}

function win() {
  S.status = 'won';
  S.stars = starsFor(S.moves, S.puzzle.par);
  const res = store.recordWin(S.n, S.stars, S.moves);
  persist();
  renderHud();
  sfx.win();
  confetti(S.stars);
  toast(S.stars === 3 ? 'Perfect — you matched par!' : 'Sunk them all!');
  setTimeout(() => openWin(res), 1100);
}

// ---------- win sheet ----------
function openWin(res) {
  const par = S.puzzle.par;
  const rec = save.progress.levels[S.n];
  $('win-banner').textContent = `Level ${S.n} cleared`;
  $('win-title').textContent = ['', 'Cleared!', 'Smooth!', 'Perfect!'][S.stars];
  $('win-sub').textContent = `${S.moves} moves · par ${par}${S.tries > 1 ? ` · try ${S.tries}` : ''}`;
  $('win-best').textContent = `${'★'.repeat(rec.stars)}${'☆'.repeat(3 - rec.stars)}  ${rec.best} moves${res.newBest && !res.firstClear ? ' · new best!' : ''}`;
  $('win-needs').textContent = `${par} / ≤ ${twoStarMax(par)} moves`;
  $('win-total').textContent = store.totals().stars;
  $('win-retry').hidden = S.stars === 3;
  const stars = [...$('big-stars').children];
  stars.forEach((s) => (s.className = 'off'));
  $('modal-win').hidden = false;
  stars.forEach((s, i) => {
    if (i >= S.stars) return;
    setTimeout(() => { s.className = 'on'; sfx.star(i); }, 250 + i * 330);
  });
}

function shareText() {
  const tier = TIERS[S.puzzle.tier];
  return [
    `DRIFT · Level ${S.n} (${tier.name})`,
    `${'⭐'.repeat(S.stars)}${'▫️'.repeat(3 - S.stars)}  ${S.moves} moves · par ${S.puzzle.par}`,
    `${store.totals().stars} ★ total`,
    CONFIG.SITE_URL || location.origin + location.pathname,
  ].join('\n');
}

async function share() {
  const text = shareText();
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
  }
  toast(ok ? 'Copied — paste it anywhere' : 'Could not copy, sorry');
}

// ---------- level select ----------
function openLevels() {
  const t = store.totals();
  $('lv-cleared').textContent = t.cleared;
  $('lv-stars').textContent = t.stars;
  $('lv-perfect').textContent = t.perfect;
  const unlocked = save.progress.unlocked;
  const shown = Math.ceil((Math.max(unlocked, S?.n ?? 1) + 10) / 5) * 5;
  const grid = $('level-grid');
  grid.innerHTML = '';
  for (let n = 1; n <= shown; n++) {
    const b = document.createElement('button');
    const rec = save.progress.levels[n];
    const open = canPlay(n);
    b.className = 'lv' + (n > 5 && n % 5 === 0 ? ' boss' : '') + (open ? '' : ' locked') + (S && S.n === n ? ' current' : '');
    b.setAttribute('aria-label', open ? `Level ${n}${rec ? `, ${rec.stars} stars` : ''}` : `Level ${n}, locked`);
    b.innerHTML = open
      ? `<span>${n}</span><span class="lv-stars">${[0, 1, 2].map((i) => `<i class="${rec && i < rec.stars ? '' : 'off'}"></i>`).join('')}</span>`
      : `<span>🔒</span>`;
    if (open) b.onclick = () => { sfx.tap(); startLevel(n); };
    grid.appendChild(b);
  }
  $('modal-levels').hidden = false;
  grid.querySelector('.current')?.scrollIntoView({ block: 'center' });
}

// ---------- effects ----------
let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function confetti(stars = 3) {
  const box = $('confetti');
  const colors = ['#f2aaa3', '#9fd8c6', '#f1b52e', '#f8eee7', '#3b6db3', '#e5654e'];
  for (let i = 0; i < 25 * stars; i++) {
    const c = document.createElement('i');
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[i % colors.length];
    box.appendChild(c);
    const drift = (Math.random() - 0.5) * 200;
    const rot = (Math.random() - 0.5) * 1080;
    c.animate([
      { transform: 'translate(0,0) rotate(0deg)' },
      { transform: `translate(${drift}px, ${window.innerHeight + 40}px) rotate(${rot}deg)` },
    ], { duration: 1600 + Math.random() * 1400, delay: Math.random() * 300, easing: 'cubic-bezier(.2,.6,.4,1)' })
      .finished.then(() => c.remove());
  }
}

function flashPad(dir) {
  const b = document.querySelector(`.pad[data-dir="${dir}"]`);
  if (!b) return;
  b.classList.add('pressed');
  setTimeout(() => b.classList.remove('pressed'), 120);
}

// ---------- input ----------
const anyModalOpen = () => [...document.querySelectorAll('.modal')].some((m) => !m.hidden);

function setupInput() {
  const stage = $('stage');
  stage.style.touchAction = 'none';
  let start = null;
  stage.addEventListener('pointerdown', (e) => { start = { x: e.clientX, y: e.clientY, fired: false }; });
  stage.addEventListener('pointermove', (e) => {
    if (!start || start.fired) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) < 26) return;
    start.fired = true;
    doMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });
  const end = () => { start = null; };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);

  window.addEventListener('keydown', (e) => {
    if (anyModalOpen()) {
      if (e.key === 'Escape') closeModals();
      if (e.key === 'Enter' && !$('modal-win').hidden) $('win-next').click();
      return;
    }
    if (e.key === 'r' || e.key === 'R') return restart();
    const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' };
    const dir = map[e.key];
    if (dir) { e.preventDefault(); doMove(dir); }
  });
  document.querySelectorAll('.pad').forEach((b) => b.addEventListener('click', () => doMove(b.dataset.dir)));
}

function closeModals() { document.querySelectorAll('.modal').forEach((m) => (m.hidden = true)); }

function restart() {
  if (busy || !S) return;
  if (S.status === 'won') return startLevel(S.n);
  if (S.moves === 0) return;
  sfx.tap();
  resetBoard();
}

function setupButtons() {
  $('btn-help').onclick = () => { sfx.tap(); $('modal-help').hidden = false; };
  $('help-close').onclick = () => {
    unlock(); sfx.tap();
    $('modal-help').hidden = true;
    save.settings.seenHelp = true; store.save();
  };
  $('btn-levels').onclick = () => { sfx.tap(); openLevels(); };
  $('btn-levels2').onclick = () => { sfx.tap(); openLevels(); };
  $('levels-close').onclick = () => { $('modal-levels').hidden = true; };
  $('btn-restart').onclick = restart;
  $('btn-prev').onclick = () => { if (S.n > 1) startLevel(S.n - 1); };
  $('btn-next').onclick = () => { if (canPlay(S.n + 1)) startLevel(S.n + 1); };
  $('win-next').onclick = () => { sfx.tap(); startLevel(S.n + 1); };
  $('win-retry').onclick = () => { sfx.tap(); startLevel(S.n); };
  $('win-levels').onclick = () => { closeModals(); openLevels(); };
  $('btn-share').onclick = share;
  document.querySelectorAll('.modal').forEach((m) => m.addEventListener('click', (e) => {
    if (e.target === m && m.id !== 'modal-win') m.hidden = true;
  }));

  const paintSound = () => {
    $('ico-waves').style.display = save.settings.muted ? 'none' : '';
    $('ico-mute').style.display = save.settings.muted ? '' : 'none';
  };
  paintSound();
  $('btn-sound').onclick = () => {
    unlock();
    save.settings.muted = !save.settings.muted;
    setMuted(save.settings.muted);
    store.save();
    paintSound();
    sfx.tap();
    toast(save.settings.muted ? 'Sound off' : 'Sound on');
  };
}

// ---------- boot ----------
async function boot() {
  setupInput();
  setupButtons();
  await loadBank();
  if (URL_LEVEL && URL_LEVEL >= 1) {
    startLevel(URL_LEVEL);
  } else {
    const ip = save.inProgress;
    const n = Math.min(save.progress.current || 1, save.progress.unlocked);
    startLevel(n, { restoreHistory: ip && ip.n === n ? ip.history : null });
  }
  if (!save.settings.seenHelp) $('modal-help').hidden = false;

  let rt = null;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (!busy) buildBoard(); }, 150); });
}

boot();
