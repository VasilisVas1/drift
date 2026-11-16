// DRIFT — UI, input, animation and game flow.
import { CONFIG } from './config.js';
import { parseLevel, initialState, tilt, DIFFICULTY } from './engine.js';
import { loadBank, getPuzzle, dayNumberFromDate, dateFromDayNumber, difficultyIndexFor, msUntilNextPuzzle, isoDate } from './puzzles.js';
import * as store from './storage.js';
import { sfx, unlock, setMuted } from './audio.js';

// ---------- environment ----------
const params = new URLSearchParams(location.search);
const TEST = params.has('test') ? params.get('test') !== '0' : CONFIG.TEST_MODE;
const DEBUG_DATE = /^\d{4}-\d{2}-\d{2}$/.test(params.get('debug') || '') ? params.get('debug') : null;
const todayNum = () => Math.max(1, dayNumberFromDate(new Date())); // before launch day → puzzle No. 1

// Future paid features hang off this one object. Today it is just "is test mode on".
// Later: replace with a check of a server-verified purchase token (see README → Monetization).
const entitlements = { canPractice: TEST, canArchive: TEST };

const GLYPH = { R: '●', G: '▲', B: '■', Y: '◆' };
const EMOJI = { R: '🔴', G: '🟢', B: '🔵', Y: '🟡' };
const $ = (id) => document.getElementById(id);
const save = store.load();
setMuted(save.settings.muted);

// ---------- session ----------
// mode: 'daily' (today's puzzle, recorded) | 'archive' (another day, not recorded) | 'practice' (random seed)
let S = null;
let busy = false;

function startPuzzle({ mode, n, diffIndex, fresh = false }) {
  const puzzle = mode === 'practice' ? getPuzzle({ kind: 'seed', n, diffIndex }) : getPuzzle({ kind: 'day', n });
  const level = parseLevel(puzzle.rows);
  S = {
    mode, n, puzzle, level,
    pieces: initialState(level),
    life: 1, moves: 0, history: [], attempts: [], sunk: [],
    status: 'playing',
    record: null,
  };
  if (mode === 'daily') {
    const days = save.days;
    if (fresh && days[n]) days[n] = { recorded: days[n].recorded, status: 'playing', life: 1, history: [], attempts: [], sunk: [] };
    if (!days[n]) days[n] = { recorded: false, status: 'playing', life: 1, history: [], attempts: [], sunk: [] };
    S.record = days[n];
    restoreFrom(S.record);
    store.save();
  }
  busy = false;
  buildBoard();
  renderHud();
  renderMeta();
  if (S.status !== 'playing') setTimeout(() => openStats(true), 250);
}

// Re-applies a saved in-progress or finished game without animation.
function restoreFrom(rec) {
  S.life = rec.life;
  S.attempts = rec.attempts.slice();
  S.status = rec.status;
  for (const dir of rec.history) {
    const r = tilt(S.level, S.pieces, dir);
    if (!r.moved) continue;
    if (r.failed) break; // defensive: a saved history should never contain a failing move
    S.pieces = r.state;
    S.moves++;
    S.history.push(dir);
    for (const m of r.moves) if (m.fell === 'ok') S.sunk.push(pieceById(m.id).color);
  }
}

function persist() {
  if (!S.record) return;
  Object.assign(S.record, { status: S.status, life: S.life, history: S.history.slice(), attempts: S.attempts.slice(), sunk: S.sunk.slice() });
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
  const availH = window.innerHeight - 330;
  return Math.max(30, Math.floor(Math.min(availW / w, Math.max(availH, 240) / h, 64)));
}

function buildBoard() {
  const { w, h, cells } = S.level;
  const app = $('app');
  app.style.setProperty('--cell', cellSize() + 'px');
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
  const hint = $('swipe-hint');
  hint.classList.toggle('gone', save.settings.hasMoved || S.moves > 0 || S.status !== 'playing');
}

function renderHud() {
  const livesEl = $('lives');
  livesEl.innerHTML = '';
  for (let i = 1; i <= CONFIG.LIVES; i++) {
    const d = document.createElement('i');
    d.className = 'life' + (i < S.life || (S.status === 'lost' && i <= S.life) ? ' lost' : '');
    livesEl.appendChild(d);
  }
  $('moves').textContent = S.moves;
  $('limit').textContent = S.puzzle.limit;
  $('par').textContent = S.puzzle.par;
  const frac = S.moves / S.puzzle.limit;
  const bar = $('movebar');
  bar.style.width = Math.min(100, frac * 100) + '%';
  bar.className = 'movebar-fill' + (S.puzzle.limit - S.moves <= 1 ? ' danger' : frac > 0.6 ? ' warn' : '');
  const rb = $('btn-restart');
  rb.disabled = S.status !== 'playing' || S.moves === 0 || S.life >= CONFIG.LIVES;
  rb.textContent = 'Restart · costs a life';
}

function renderMeta() {
  const di = S.puzzle.diffIndex;
  const d = DIFFICULTY[di];
  const banner = $('mode-banner');
  if (S.mode === 'practice') {
    $('subline').textContent = `Practice · ${d.label}`;
    banner.hidden = false;
    banner.textContent = `practice board · ${d.name}-level · not counted`;
  } else {
    const date = dateFromDayNumber(S.n);
    const ds = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    $('subline').textContent = `No. ${S.n} · ${ds} · ${d.label}`;
    banner.hidden = S.mode === 'daily';
    banner.textContent = DEBUG_DATE ? `debug · ${isoDate(date)} · not counted` : `archive · No. ${S.n} · not counted`;
  }
  $('testbar').hidden = !TEST;
  $('btn-archive').textContent = entitlements.canPractice ? 'Archive / Practice — unlocked (test)' : 'Archive / Practice — coming soon';
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
        const inner = el.firstElementChild;
        const dx = m.to.x - m.from.x, dy = m.to.y - m.from.y;
        const sx = dx ? 0.82 : 1.12, sy = dy ? 0.82 : 1.12;
        inner.animate([{ transform: 'scale(1)' }, { transform: `scale(${sx}, ${sy})` }, { transform: 'scale(1)' }], { duration: 160, easing: 'ease-out' });
        a.cancel();
        return;
      }
      return fallInto(el, a, m, p);
    }));
  }
  if (maxDist) sfx.roll(maxDist);
  return Promise.all(anims);
}

function fallInto(el, slideAnim, m, p) {
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
  persist();
  renderHud();
  tiltBoard(dir);
  await animateMoves(r.moves);
  S.pieces = r.state;
  if (r.failed) {
    const pit = r.moves.some((m) => m.fell === 'pit');
    const wrongMove = r.moves.find((m) => m.fell === 'wrong');
    if (wrongMove) {
      const holeCol = S.level.cells[wrongMove.to.y * S.level.w + wrongMove.to.x].toUpperCase();
      holeEls.get(holeCol)?.classList.add('flash');
    }
    await loseLife(pit ? 'Down the drain!' : 'Wrong hole!');
  } else if (r.won) {
    finish(true);
  } else if (S.moves >= S.puzzle.limit) {
    await loseLife('Out of moves!');
  }
  persist();
  busy = false;
}

function hideHint() {
  $('swipe-hint').classList.add('gone');
  if (!save.settings.hasMoved) { save.settings.hasMoved = true; store.save(); }
}

async function loseLife(msg) {
  S.attempts.push({ won: false, moves: S.moves });
  wrapEl.classList.remove('shake'); void wrapEl.offsetWidth; wrapEl.classList.add('shake');
  const lifeDot = $('lives').children[S.life - 1];
  lifeDot?.classList.add('lost', 'pop');
  if (S.life >= CONFIG.LIVES) {
    toast(msg);
    await wait(700);
    finish(false);
    return;
  }
  toast(`${msg} ${CONFIG.LIVES - S.life} ${CONFIG.LIVES - S.life === 1 ? 'life' : 'lives'} left`);
  // Commit the reset to storage *before* the pause, so a reload mid-animation can't resurrect the failed board.
  S.life++;
  S.moves = 0;
  S.history = [];
  S.sunk = [];
  S.pieces = initialState(S.level);
  persist();
  await wait(1100);
  resetBoardVisuals();
}

function resetBoardVisuals() {
  buildBoard();
  renderHud();
  boardEl.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
}

function finish(won) {
  S.status = won ? 'won' : 'lost';
  if (won) S.attempts.push({ won: true, moves: S.moves });
  persist();
  if (S.mode === 'daily' && S.record && !S.record.recorded) {
    store.recordDailyResult(S.n, { won, lifeNumber: S.life, perfect: won && S.moves === S.puzzle.par });
    S.record.recorded = true;
    store.save();
  }
  renderHud();
  if (won) {
    sfx.win();
    confetti();
    toast(S.moves === S.puzzle.par ? '⭐ Perfect — you matched par!' : 'Sunk them all!');
    setTimeout(() => openStats(true), 1300);
  } else {
    sfx.lose();
    setTimeout(() => openStats(true), 900);
  }
}

// ---------- results / stats ----------
function attemptsEmoji(attempts, status) {
  return attempts.map((a) => (a.won ? (a.moves === S.puzzle.par ? '⭐' : '🎯') : '💥')).join('') + (status === 'lost' ? '' : '');
}

function openStats(showResult) {
  const st = store.load().stats;
  const finished = S && S.status !== 'playing';
  const showHead = showResult && finished;
  $('result-head').hidden = !showHead;
  $('stats-banner').textContent = showHead ? (S.mode === 'daily' ? `No. ${S.n} — results` : S.mode === 'practice' ? 'Practice — results' : `No. ${S.n} — archive`) : 'Statistics';
  if (showHead) {
    const perfect = S.status === 'won' && S.moves === S.puzzle.par;
    $('result-title').textContent = S.status === 'won' ? (perfect ? 'Perfect drift!' : 'Sunk it!') : 'Washed out';
    $('result-sub').textContent = S.status === 'won'
      ? `${S.moves} moves · par ${S.puzzle.par} · life ${S.life} of ${CONFIG.LIVES}`
      : `par was ${S.puzzle.par} · better luck tomorrow`;
    $('result-attempts').textContent = attemptsEmoji(S.attempts, S.status);
  }
  $('st-played').textContent = st.played;
  $('st-win').textContent = st.played ? Math.round((st.wins / st.played) * 100) : 0;
  $('st-streak').textContent = store.liveStreak(todayNum());
  $('st-best').textContent = st.bestStreak;
  $('st-perfect').textContent = st.perfect;
  const rows = [['1st life', 1], ['2nd life', 2], ['3rd life', 3], ['Lost', 'fail']];
  const max = Math.max(1, ...rows.map(([, k]) => st.dist[k]));
  const hlKey = S && S.mode === 'daily' && finished ? (S.status === 'won' ? S.life : 'fail') : null;
  $('dist').innerHTML = rows.map(([label, k]) =>
    `<div class="dist-row"><span>${label}</span><div><div class="dist-bar${k === hlKey ? ' hl' : ''}" style="width:${Math.max(8, (st.dist[k] / max) * 100)}%">${st.dist[k]}</div></div></div>`).join('');
  $('btn-share').hidden = !finished;
  $('stats-test-actions').hidden = !TEST;
  $('countdown-row').hidden = false;
  tickCountdown();
  $('modal-stats').hidden = false;
}

function shareText() {
  const d = DIFFICULTY[S.puzzle.diffIndex];
  const head = S.mode === 'practice' ? `DRIFT Practice (${d.label})` : `DRIFT No. ${S.n} · ${d.label}`;
  const lines = [head, attemptsEmoji(S.attempts, S.status)];
  if (S.status === 'won') {
    lines.push(`${S.moves} moves · par ${S.puzzle.par}${S.moves === S.puzzle.par ? ' ⭐' : ''}`);
    lines.push(S.sunk.map((c) => EMOJI[c]).join(''));
  } else {
    lines.push(`Washed out · par ${S.puzzle.par}`);
  }
  lines.push(CONFIG.SITE_URL);
  return lines.join('\n');
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

function tickCountdown() {
  const ms = msUntilNextPuzzle();
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  $('countdown').textContent = `${hh}:${mm}:${ss}`;
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

function confetti() {
  const box = $('confetti');
  const colors = ['#f2aaa3', '#9fd8c6', '#f1b52e', '#f8eee7', '#3b6db3', '#e5654e'];
  for (let i = 0; i < 70; i++) {
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
    if (!$('modal-help').hidden || !$('modal-stats').hidden) {
      if (e.key === 'Escape') closeModals();
      return;
    }
    const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' };
    const dir = map[e.key];
    if (dir) { e.preventDefault(); doMove(dir); }
  });
  document.querySelectorAll('.pad').forEach((b) => b.addEventListener('click', () => doMove(b.dataset.dir)));
}

function closeModals() {
  $('modal-help').hidden = true;
  $('modal-stats').hidden = true;
}

let restartArmed = false;
function setupButtons() {
  $('btn-help').onclick = () => { sfx.tap(); $('modal-help').hidden = false; };
  $('help-close').onclick = () => {
    unlock(); sfx.tap();
    $('modal-help').hidden = true;
    save.settings.seenHelp = true; store.save();
  };
  $('btn-stats').onclick = () => { sfx.tap(); openStats(true); };
  $('stats-close').onclick = () => { $('modal-stats').hidden = true; };
  $('btn-share').onclick = share;
  document.querySelectorAll('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) m.hidden = true; }));

  const soundBtn = $('btn-sound');
  const paintSound = () => {
    $('ico-waves').style.display = save.settings.muted ? 'none' : '';
    $('ico-mute').style.display = save.settings.muted ? '' : 'none';
  };
  paintSound();
  soundBtn.onclick = () => {
    unlock();
    save.settings.muted = !save.settings.muted;
    setMuted(save.settings.muted);
    store.save();
    paintSound();
    sfx.tap();
    toast(save.settings.muted ? 'Sound off' : 'Sound on');
  };

  $('btn-restart').onclick = async () => {
    if (busy || S.status !== 'playing' || S.moves === 0) return;
    if (!restartArmed) {
      restartArmed = true;
      $('btn-restart').textContent = 'Tap again to restart';
      setTimeout(() => { restartArmed = false; renderHud(); }, 2200);
      return;
    }
    restartArmed = false;
    busy = true;
    await loseLife('Restarted.');
    busy = false;
  };

  // Paid-feature placeholder. In test mode it opens unlimited practice.
  $('btn-archive').onclick = () => {
    sfx.tap();
    if (entitlements.canPractice) return playRandom();
    toast('Archive & unlimited practice — coming soon');
  };

  // test-mode controls
  const replay = () => { closeModals(); startPuzzle({ mode: S.mode, n: S.n, diffIndex: S.puzzle.diffIndex, fresh: true }); };
  $('t-replay').onclick = replay;
  $('s-replay').onclick = replay;
  $('t-random').onclick = playRandom;
  $('s-random').onclick = playRandom;
  $('t-prev').onclick = () => playDay((S.mode === 'practice' ? todayNum() : S.n) - 1);
  $('t-next').onclick = () => playDay((S.mode === 'practice' ? todayNum() : S.n) + 1);
}

function playDay(n) {
  if (n < 1) return toast('That’s before launch day');
  closeModals();
  const isToday = n === todayNum() && !DEBUG_DATE;
  startPuzzle({ mode: isToday ? 'daily' : 'archive', n });
  toast(isToday ? 'Today’s puzzle' : `Puzzle No. ${n} · ${DIFFICULTY[difficultyIndexFor(n)].name}`);
}

function playRandom() {
  closeModals();
  const seed = (Math.random() * 2 ** 31) | 0;
  const diffIndex = (Math.random() * 7) | 0;
  startPuzzle({ mode: 'practice', n: seed, diffIndex });
  toast(`Random ${DIFFICULTY[diffIndex].label.toLowerCase()} board`);
}

// ---------- boot ----------
async function boot() {
  setupInput();
  setupButtons();
  await loadBank();
  if (DEBUG_DATE) {
    const n = dayNumberFromDate(new Date(DEBUG_DATE + 'T12:00:00Z'));
    if (n < 1) toast('Debug date is before launch — showing No. 1');
    startPuzzle({ mode: 'archive', n: Math.max(1, n) });
  } else {
    startPuzzle({ mode: 'daily', n: todayNum() });
  }
  if (!save.settings.seenHelp) $('modal-help').hidden = false;

  let lastDay = todayNum();
  setInterval(() => {
    tickCountdown();
    const now = todayNum();
    if (now !== lastDay) {
      lastDay = now;
      if (S.mode === 'daily' && S.status !== 'playing') { closeModals(); startPuzzle({ mode: 'daily', n: now }); toast('A fresh puzzle just dropped'); }
    }
  }, 1000);

  let rt = null;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (!busy) buildBoard(); }, 150); });
}

boot();
