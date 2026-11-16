// Tiny synthesised sound kit (WebAudio, no files). Mutable; the AudioContext is created on first gesture.
let ctx = null;
let muted = false;

export function setMuted(m) { muted = m; }
export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function tone({ freq = 440, to = null, type = 'sine', dur = 0.15, vol = 0.2, delay = 0 }) {
  if (muted || !ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.25, vol = 0.08, freq = 900, delay = 0 }) {
  if (muted || !ctx) return;
  const t = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t);
}

export const sfx = {
  roll(dist) { noise({ dur: 0.06 + dist * 0.045, vol: 0.06, freq: 500 }); },
  clack(delay = 0) { tone({ freq: 1400, to: 700, type: 'triangle', dur: 0.05, vol: 0.12, delay }); },
  sink(delay = 0) {
    tone({ freq: 660, to: 220, type: 'sine', dur: 0.22, vol: 0.22, delay });
    tone({ freq: 990, type: 'sine', dur: 0.12, vol: 0.08, delay: delay + 0.08 });
  },
  wrong(delay = 0) {
    tone({ freq: 180, to: 90, type: 'sawtooth', dur: 0.35, vol: 0.12, delay });
    tone({ freq: 140, to: 70, type: 'square', dur: 0.35, vol: 0.06, delay });
  },
  win() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.25, vol: 0.14, delay: i * 0.09 }));
    tone({ freq: 1568, type: 'sine', dur: 0.6, vol: 0.08, delay: 0.5 });
  },
  lose() { [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.3, vol: 0.12, delay: i * 0.14 })); },
  star(i) { tone({ freq: [784, 988, 1319][i] || 1319, type: 'triangle', dur: 0.28, vol: 0.16 }); tone({ freq: ([784, 988, 1319][i] || 1319) * 2, type: 'sine', dur: 0.18, vol: 0.05, delay: 0.03 }); },
  tap() { tone({ freq: 880, type: 'sine', dur: 0.05, vol: 0.06 }); },
};
