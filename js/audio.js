// BATTLE ON THE LAKE — tiny procedural WebAudio sounds. No audio files.
// Everything is synthesized: a splash for a miss, a thud for a hit, a
// foghorn when a vessel goes down, fanfares for the end of the war.

const LS_MUTED = 'battle-on-the-lake-muted';

let ctx = null;
let muted = localStorage.getItem(LS_MUTED) === '1';

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, start, dur, { type = 'sine', gain = 0.16, slide = 0 } = {}) {
  const a = ac();
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

// A burst of filtered noise — the watery part of a splash.
function noise(start, dur, { gain = 0.12, freq = 900 } = {}) {
  const a = ac();
  const t = a.currentTime + start;
  const frames = Math.ceil(a.sampleRate * dur);
  const buf = a.createBuffer(1, frames, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(freq, t);
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  src.connect(filter).connect(g).connect(a.destination);
  src.start(t);
}

export const sound = {
  get muted() {
    return muted;
  },
  toggleMuted() {
    muted = !muted;
    localStorage.setItem(LS_MUTED, muted ? '1' : '0');
    return muted;
  },
  /** A vessel snaps onto the grid. */
  place() {
    if (muted) return;
    tone(340, 0, 0.08, { type: 'triangle', gain: 0.14, slide: -120 });
  },
  /** The whole fleet re-scatters. */
  scatter() {
    if (muted) return;
    [420, 340, 380, 300, 460].forEach((f, i) => tone(f, i * 0.05, 0.07, { type: 'triangle', gain: 0.1, slide: -90 }));
  },
  /** A shot that finds only lake. */
  miss() {
    if (muted) return;
    noise(0, 0.3, { gain: 0.14, freq: 1100 });
    tone(240, 0, 0.16, { type: 'sine', gain: 0.14, slide: -130 });
  },
  /** A shot that finds a hull. */
  hit() {
    if (muted) return;
    tone(110, 0, 0.22, { type: 'square', gain: 0.16, slide: -55 });
    noise(0.02, 0.14, { gain: 0.1, freq: 500 });
  },
  /** A vessel goes down: low foghorn. */
  sunk() {
    if (muted) return;
    tone(98, 0, 0.7, { type: 'sawtooth', gain: 0.11, slide: -18 });
    tone(101, 0, 0.7, { type: 'sawtooth', gain: 0.11, slide: -18 });
    noise(0.12, 0.5, { gain: 0.08, freq: 420 });
  },
  win() {
    if (muted) return;
    [392, 494, 587, 784].forEach((f, i) => tone(f, i * 0.11, 0.24, { type: 'triangle', gain: 0.18 }));
    tone(784, 0.44, 0.5, { type: 'triangle', gain: 0.14 });
  },
  lose() {
    if (muted) return;
    [330, 262, 196].forEach((f, i) => tone(f, i * 0.14, 0.26, { type: 'triangle', gain: 0.15 }));
  },
};
