// Audio engine.
// - Drum kit (kick, snare, cross-stick, hi-hat, ride, crash, toms): Virtuosity Drums (CC0), close and
//   room microphones blended; percussion: Versilian Community Sample Library (CC0). Velocity layers and
//   round-robin; synthesized fallbacks while samples load (or if they can't).
// - Electronic kick (for trap / house / drum & bass): synthesized (layered body, sub and click).
// - Finger / upright bass and guitar: Karplus-Strong plucked-string physical model.
// - E-piano (TX81Z FM piano) and grand piano (Kawai): samples; synth fallback.
// - Synth bass, 808, organ, pad and leads: subtractive / additive synthesis.
// - Mix: stereo placement, room reverb send, compressor + soft limiter.

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

export const SOUNDS = {
  bass: {
    electric: { label: 'Finger bass', ks: { bright: 0.42, pick: 0.16, decay: 0.997, lp: 1500, sub: 0.35, gain: 1.7, r: 0.07 }, waves: [{ type: 'sawtooth' }, { type: 'sine', gain: 0.8 }], cutoff: 260, cutEnv: 1300, q: 4, a: 0.004, d: 0.2, s: 0.55, r: 0.05, gain: 0.85 },
    synth: { label: 'Synth', waves: [{ type: 'square' }, { type: 'sawtooth', detune: 10 }], cutoff: 300, cutEnv: 2400, q: 9, a: 0.003, d: 0.14, s: 0.45, r: 0.04, gain: 0.6 },
    upright: { label: 'Upright', ks: { bright: 0.22, pick: 0.28, decay: 0.991, lp: 800, sub: 0.45, thump: 0.5, gain: 1.5, r: 0.12 }, waves: [{ type: 'triangle' }, { type: 'sine', gain: 0.7 }], cutoff: 700, cutEnv: 600, q: 1, a: 0.008, d: 0.35, s: 0.15, r: 0.1, gain: 1.1 },
    '808': { label: '808', waves: [{ type: 'sine' }], cutoff: 3000, q: 0.5, a: 0.002, d: 0.8, s: 0.75, r: 0.2, glide: 1.6, drive: true, gain: 0.9 },
  },
  chords: {
    epiano: { label: 'E-piano', sampled: 'ep', r: 0.3, waves: [{ type: 'sine' }, { type: 'sine', mult: 2, gain: 0.4, decay: 0.3 }, { type: 'sine', mult: 7, gain: 0.08, decay: 0.05 }], cutoff: 6000, a: 0.003, d: 0.9, s: 0.25, r: 0.25, gain: 0.45 },
    organ: { label: 'Organ', waves: [{ type: 'sine' }, { type: 'sine', mult: 2, gain: 0.5 }, { type: 'sine', mult: 3, gain: 0.3 }, { type: 'sine', mult: 4, gain: 0.15 }], cutoff: 5000, a: 0.008, d: 0.05, s: 1, r: 0.05, gain: 0.28 },
    piano: { label: 'Piano', sampled: 'piano', r: 0.35, waves: [{ type: 'triangle' }, { type: 'sine', mult: 2, gain: 0.3, decay: 0.4 }], cutoff: 5000, a: 0.002, d: 1.2, s: 0.2, r: 0.3, gain: 0.4 },
    guitar: { label: 'Guitar', ks: { bright: 0.75, pick: 0.13, decay: 0.994, lp: 4200, hp: 140, gain: 2.2, r: 0.06 }, waves: [{ type: 'sawtooth' }], cutoff: 900, cutEnv: 2500, q: 2, a: 0.002, d: 0.14, s: 0.2, r: 0.06, gain: 0.32, strum: 0.009 },
    pad: { label: 'Pad', waves: [{ type: 'sawtooth', detune: -9 }, { type: 'sawtooth', detune: 9 }], cutoff: 1100, q: 1, a: 0.25, d: 0.4, s: 0.8, r: 0.5, gain: 0.3 },
  },
  melody: {
    square: { label: 'Square lead', waves: [{ type: 'square' }], cutoff: 2600, q: 1, a: 0.005, d: 0.15, s: 0.6, r: 0.06, gain: 0.22 },
    saw: { label: 'Saw lead', waves: [{ type: 'sawtooth', detune: -7 }, { type: 'sawtooth', detune: 7 }], cutoff: 2800, cutEnv: 1500, q: 2, a: 0.005, d: 0.2, s: 0.6, r: 0.08, gain: 0.18 },
    brass: { label: 'Brass', waves: [{ type: 'sawtooth' }, { type: 'sawtooth', detune: 6 }], cutoff: 500, cutEnv: 2200, fa: 0.06, q: 1.5, a: 0.03, d: 0.25, s: 0.7, r: 0.08, gain: 0.2 },
    flute: { label: 'Flute', waves: [{ type: 'sine' }, { type: 'triangle', mult: 2, gain: 0.15 }], cutoff: 4000, a: 0.05, d: 0.2, s: 0.85, r: 0.1, vibrato: { rate: 5, depth: 12, delay: 0.15 }, gain: 0.45 },
    bell: { label: 'Bell', waves: [{ type: 'sine' }, { type: 'sine', mult: 2.76, gain: 0.35, decay: 0.4 }, { type: 'sine', mult: 5.4, gain: 0.2, decay: 0.15 }], cutoff: 8000, a: 0.002, d: 1.2, s: 0, r: 0.4, gain: 0.4 },
    pluck: { label: 'Pluck', waves: [{ type: 'sawtooth' }], cutoff: 500, cutEnv: 4000, q: 3, a: 0.002, d: 0.18, s: 0.1, r: 0.1, gain: 0.3 },
  },
};

// Which sample plays for a drum voice at a given velocity, its level and stereo position.
let rr = 0;
const alt = (a, b) => (++rr % 2 ? a : b);
const DRUM_SAMPLES = {
  kick: { pick: (v) => (v < 0.4 ? 'kick-soft' : v >= 0.95 ? 'kick-hard' : alt('kick-1', 'kick-2')), level: 1.4, pan: 0 },
  hhc: { pick: (v) => (v < 0.4 ? 'hhc-soft' : v >= 0.95 ? 'hhc-hard' : alt('hhc-1', 'hhc-2')), level: 1.75, pan: 0.3 },
  hho: { pick: () => 'hho', level: 1.45, pan: 0.3 },
  snare: { pick: (v) => (v < 0.4 ? 'snare-ghost' : v >= 0.95 ? 'snare-hard' : alt('snare-1', 'snare-2')), level: 3.1, pan: 0.05 },
  rim: { pick: () => alt('rim-1', 'rim-2'), level: 1.2, pan: 0.05 },
  clap: { pick: () => alt('clap-1', 'clap-2'), level: 0.85, pan: -0.05 },
  tamb: { pick: (v) => (v >= 0.9 ? 'tamb-hard' : 'tamb-soft'), level: 0.6, pan: 0.45 },
  shaker: { pick: () => alt('shaker-down', 'shaker-up'), level: 0.75, pan: 0.4 },
  clave: { pick: () => 'clave', level: 0.7, pan: -0.25 },
  cowbell: { pick: () => 'cowbell', level: 0.55, pan: 0.25 },
  conga: { pick: () => 'conga', level: 0.65, pan: -0.3 },
  tomH: { pick: () => 'tomH', level: 0.75, pan: 0.2 },
  tomL: { pick: () => 'tomL', level: 0.56, pan: -0.2 },
  crash: { pick: () => 'crash', level: 0.28, pan: -0.35 },
  ride: { pick: (v) => (v >= 0.95 ? 'ride-hard' : alt('ride-1', 'ride-2')), level: 0.45, pan: -0.3 },
};
const REVERB_SEND = { click: 0, drums: 0.1, bass: 0.02, chords: 0.22, melody: 0.2 };

/**
 * Karplus-Strong plucked string. Returns a mono Float32Array.
 * bright: excitation brightness (0..1), pick: pluck position (0..0.5), decay: feedback per period.
 */
export function pluck(sr, freq, seconds, { bright = 0.5, pick = 0.2, decay = 0.996 } = {}) {
  const n = Math.floor(sr * seconds);
  const y = new Float32Array(n);
  const P = sr / freq - 0.5; // the averaging filter adds half a sample of delay
  const N = Math.max(2, Math.floor(P));
  const frac = P - N;
  // excitation: low-passed noise with a pick-position comb, DC removed
  const exc = new Float32Array(N);
  let lp = 0;
  for (let i = 0; i < N; i++) {
    lp += bright * (Math.random() * 2 - 1 - lp);
    exc[i] = lp;
  }
  const d = Math.max(1, Math.floor(pick * N));
  const shaped = exc.map((v, i) => v - (i >= d ? exc[i - d] : 0));
  const mean = shaped.reduce((a, b) => a + b, 0) / N;
  let prev = 0;
  for (let i = 0; i < n; i++) {
    if (i < N) {
      y[i] = shaped[i] - mean;
      continue;
    }
    const s = y[i - N] * (1 - frac) + (i - N - 1 >= 0 ? y[i - N - 1] : 0) * frac;
    y[i] = decay * 0.5 * (s + prev);
    prev = s;
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(y[i]));
  if (peak > 0) for (let i = 0; i < n; i++) y[i] *= 0.9 / peak;
  return y;
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.openHats = [];
  }

  /** Create the audio graph. Pass an (Offline)AudioContext to render somewhere else (tests). */
  init(ctxOverride = null) {
    if (this.ctx) return this.ctx;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    const ctx = (this.ctx = ctxOverride ?? new AC({ latencyHint: 'interactive' }));
    this.samples = {}; // name -> AudioBuffer
    this.keys = { ep: [], piano: [] }; // [{ midi, buffer }]
    this.ksCache = new Map();

    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 3;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    // soft limiter so peaks round off instead of clipping
    const limit = ctx.createWaveShaper();
    const curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(1.1 * x) / Math.tanh(1.1);
    }
    limit.curve = curve;
    limit.oversample = '2x';
    this.master.connect(comp).connect(limit).connect(ctx.destination);

    // room reverb (generated impulse response)
    const verb = ctx.createConvolver();
    verb.buffer = this.impulse(1.7, 3.0);
    const verbIn = ctx.createBiquadFilter();
    verbIn.type = 'lowpass';
    verbIn.frequency.value = 5500;
    const verbHp = this.filter('highpass', 180);
    verbIn.connect(verbHp).connect(verb).connect(this.master);

    this.buses = {};
    for (const name of ['click', 'drums', 'bass', 'chords', 'melody']) {
      const g = ctx.createGain();
      g.connect(this.master);
      const send = ctx.createGain();
      send.gain.value = REVERB_SEND[name];
      g.connect(send).connect(verbIn);
      this.buses[name] = g;
    }

    const len = Math.floor(ctx.sampleRate * 2);
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    const n = 1024;
    this.driveCurve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      this.driveCurve[i] = Math.tanh(2.5 * x);
    }
    return ctx;
  }

  impulse(seconds, power) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    const pre = Math.floor(ctx.sampleRate * 0.012);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = pre; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - (i - pre) / (len - pre)) ** power;
    }
    return buf;
  }

  /** Load the recorded samples (drums first, then keys). Safe to call more than once. */
  loadSamples(base = 'samples/') {
    this.loading ??= (async () => {
      const ctx = this.ctx;
      const get = async (path) => {
        const res = await fetch(base + path);
        if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
        const data = await res.arrayBuffer();
        return new Promise((resolve, reject) => ctx.decodeAudioData(data, resolve, reject));
      };
      const manifest = await (await fetch(base + 'manifest.json')).json();
      await Promise.all(
        Object.entries(manifest.drums).map(async ([name, path]) => {
          this.samples[name] = await get(path);
        }),
      );
      for (const kind of ['ep', 'piano']) {
        const list = await Promise.all(
          manifest[kind].map(async ([file, measured]) => ({ midi: measured, buffer: await get(`${kind}/${file}.flac`) })),
        );
        this.keys[kind] = list.sort((a, b) => a.midi - b.midi);
      }
      return true;
    })().catch((e) => {
      console.warn('Samples unavailable, using synthesized sounds:', e.message);
      this.loading = null;
      return false;
    });
    return this.loading;
  }

  async resume() {
    if (this.ctx && this.ctx.state !== 'running') await this.ctx.resume();
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** Seconds between scheduling a sound and it reaching the speaker. */
  get latency() {
    if (!this.ctx) return 0;
    return (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
  }

  setBusGain(name, v) {
    if (!this.ctx) return;
    this.buses[name].gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  // ------------------------------------------------------------ helpers

  noise(t, dur) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur);
    return s;
  }

  envGain(t, peak, attack, decay) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  filter(type, freq, q = 1) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  osc(type, freq, t, stop) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.start(t);
    o.stop(stop);
    return o;
  }

  /** 808-style metallic tone (six detuned squares) used for hats, ride, cowbell. */
  metal(t, decay, base, bpFreq, hpFreq) {
    const bp = this.filter('bandpass', bpFreq, 0.8);
    const hp = this.filter('highpass', hpFreq, 0.7);
    for (const r of [2, 3, 4.16, 5.43, 6.79, 8.21]) this.osc('square', base * r, t, t + decay + 0.05).connect(bp);
    bp.connect(hp);
    return hp;
  }

  // ------------------------------------------------------------ click

  click(t, kind = 'beat', vel = 1) {
    const freq = { accent: 1760, group: 1480, beat: 1180, sub: 880 }[kind] ?? 1180;
    const peak = (kind === 'sub' ? 0.35 : kind === 'beat' ? 0.7 : 1) * vel;
    const g = this.envGain(t, peak, 0.001, kind === 'sub' ? 0.025 : 0.045);
    this.osc('triangle', freq, t, t + 0.08).connect(g);
    g.connect(this.buses.click);
  }

  // ------------------------------------------------------------ drums

  /** electronic: use the synthesized kick (for electronic styles) instead of the acoustic one. */
  drum(name, t, vel, electronic = false) {
    if (electronic && name === 'kick') return this.d_kick(t, vel, this.buses.drums);
    const map = DRUM_SAMPLES[name];
    const buf = map && this.samples[map.pick(vel)];
    if (buf) return this.playDrum(name, buf, t, vel, map);
    const fn = this[`d_${name}`];
    if (fn) fn.call(this, t, vel, this.buses.drums);
  }

  playDrum(name, buf, t, vel, map) {
    const ctx = this.ctx;
    if (name === 'hhc' || name === 'hho') this.chokeHats(t);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.02; // tiny pitch variation, like real hits
    const g = ctx.createGain();
    g.gain.value = map.level * vel ** 1.3;
    const pan = ctx.createStereoPanner();
    pan.pan.value = map.pan;
    src.connect(g).connect(pan).connect(this.buses.drums);
    src.start(t);
    if (name === 'hho') this.openHats.push({ t, g });
  }

  chokeHats(t) {
    for (const h of this.openHats) if (h.t < t) h.g.gain.setTargetAtTime(0, t, 0.012);
    this.openHats = this.openHats.filter((h) => h.t >= t);
  }

  d_kick(t, v, out) {
    // body: fast pitch drop into a round low tone, slightly saturated
    const body = this.osc('sine', 150, t, t + 0.6);
    body.frequency.setValueAtTime(150, t);
    body.frequency.exponentialRampToValueAtTime(62, t + 0.035);
    body.frequency.exponentialRampToValueAtTime(48, t + 0.25);
    const bg = this.ctx.createGain();
    bg.gain.setValueAtTime(0, t);
    bg.gain.linearRampToValueAtTime(v * 0.62, t + 0.002);
    bg.gain.setTargetAtTime(v * 0.34, t + 0.02, 0.05);
    bg.gain.setTargetAtTime(0, t + 0.09, 0.09);
    const sat = this.ctx.createWaveShaper();
    sat.curve = this.driveCurve;
    body.connect(bg).connect(sat).connect(out);
    // beater click
    const c = this.noise(t, 0.02);
    const cg = this.envGain(t, v * 0.32, 0.0005, 0.01);
    c.connect(this.filter('bandpass', 2800, 0.8)).connect(cg).connect(out);
    const tk = this.osc('triangle', 1100, t, t + 0.02);
    const tg = this.envGain(t, v * 0.12, 0.0005, 0.008);
    tk.connect(tg).connect(out);
  }

  d_tamb(t, v, out) {
    // jingles: bright noise + metallic partials
    const n = this.noise(t, 0.3);
    const g = this.envGain(t, v * 0.35, 0.002, 0.18);
    n.connect(this.filter('highpass', 6500)).connect(g).connect(out);
    const m = this.envGain(t, v * 0.1, 0.002, 0.15);
    this.metal(t, 0.2, 90, 9000, 7000).connect(m).connect(out);
  }

  d_snare(t, v, out) {
    const n = this.noise(t, 0.25);
    const ng = this.envGain(t, v * 0.7, 0.001, 0.18);
    n.connect(this.filter('highpass', 1200)).connect(ng).connect(out);
    const o = this.osc('triangle', 240, t, t + 0.15);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.05);
    const og = this.envGain(t, v * 0.6, 0.001, 0.09);
    o.connect(og).connect(out);
  }

  d_rim(t, v, out) {
    const g = this.envGain(t, v * 0.5, 0.001, 0.035);
    this.osc('triangle', 1700, t, t + 0.06).connect(g);
    this.osc('square', 470, t, t + 0.06).connect(this.filter('highpass', 600)).connect(g);
    g.connect(out);
  }

  d_clap(t, v, out) {
    const n = this.noise(t, 0.3);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (let k = 0; k < 3; k++) {
      const s = t + k * 0.011;
      g.gain.setValueAtTime(v * 0.8, s);
      g.gain.exponentialRampToValueAtTime(v * 0.1, s + 0.009);
    }
    g.gain.setValueAtTime(v * 0.8, t + 0.033);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    n.connect(this.filter('bandpass', 1300, 1.2)).connect(g).connect(out);
  }

  d_hhc(t, v, out) {
    // choke any ringing open hat
    for (const h of this.openHats) if (h.t < t) h.g.gain.setTargetAtTime(0, t, 0.008);
    this.openHats = this.openHats.filter((h) => h.t >= t);
    const g = this.envGain(t, v * 0.32, 0.001, 0.05);
    this.metal(t, 0.06, 40, 10000, 7000).connect(g).connect(out);
  }

  d_hho(t, v, out) {
    const g = this.envGain(t, v * 0.3, 0.002, 0.38);
    const choke = this.ctx.createGain();
    this.metal(t, 0.4, 40, 10000, 6500).connect(g).connect(choke).connect(out);
    this.openHats.push({ t, g: choke });
  }

  d_ride(t, v, out) {
    const g = this.envGain(t, v * 0.18, 0.001, 0.9);
    this.metal(t, 0.95, 62, 8000, 4000).connect(g).connect(out);
    const b = this.envGain(t, v * 0.06, 0.001, 0.4);
    this.osc('sine', 3150, t, t + 0.45).connect(b).connect(out);
  }

  d_crash(t, v, out) {
    const n = this.noise(t, 1.6);
    const g = this.envGain(t, v * 0.4, 0.002, 1.5);
    n.connect(this.filter('highpass', 4500)).connect(g).connect(out);
    const m = this.envGain(t, v * 0.12, 0.002, 1.2);
    this.metal(t, 1.25, 55, 9000, 5000).connect(m).connect(out);
  }

  d_shaker(t, v, out) {
    const n = this.noise(t, 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v * 0.35, t + 0.014);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    n.connect(this.filter('bandpass', 6500, 0.9)).connect(g).connect(out);
  }

  d_cowbell(t, v, out) {
    const g = this.envGain(t, v * 0.3, 0.001, 0.28);
    const bp = this.filter('bandpass', 2600, 1.5);
    this.osc('square', 562, t, t + 0.32).connect(bp);
    this.osc('square', 845, t, t + 0.32).connect(bp);
    bp.connect(g).connect(out);
  }

  d_clave(t, v, out) {
    const g = this.envGain(t, v * 0.6, 0.001, 0.06);
    this.osc('sine', 2500, t, t + 0.08).connect(g).connect(out);
  }

  tom(t, v, out, f0, f1, decay) {
    const o = this.osc('sine', f0, t, t + decay + 0.05);
    o.frequency.exponentialRampToValueAtTime(f1, t + 0.08);
    const g = this.envGain(t, v * 0.9, 0.002, decay);
    o.connect(g).connect(out);
  }

  d_conga(t, v, out) {
    this.tom(t, v * 0.8, out, 340, 280, 0.2);
  }

  d_tomH(t, v, out) {
    this.tom(t, v, out, 210, 150, 0.3);
  }

  d_tomL(t, v, out) {
    this.tom(t, v, out, 130, 92, 0.42);
  }

  // ------------------------------------------------------------ pitched voices

  voice(busName, p, t, midi, dur, vel) {
    const ctx = this.ctx;
    const f0 = mtof(midi);
    const a = p.a ?? 0.005;
    const d = p.d ?? 0.1;
    const s = p.s ?? 0.7;
    const r = p.r ?? 0.08;
    const hold = Math.max(dur, a + 0.01);
    const end = t + hold + r * 2.5 + 0.05;
    const peak = vel * (p.gain ?? 1);

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + a);
    amp.gain.setTargetAtTime(peak * s, t + a, d / 3);
    amp.gain.setTargetAtTime(0, t + hold, r / 3);

    const flt = this.filter('lowpass', p.cutoff ?? 4000, p.q ?? 1);
    if (p.cutEnv) {
      const fa = p.fa ?? 0.003;
      flt.frequency.setValueAtTime(p.cutoff, t);
      flt.frequency.linearRampToValueAtTime(p.cutoff + p.cutEnv * (0.4 + 0.6 * vel), t + fa);
      flt.frequency.setTargetAtTime(p.cutoff, t + fa, d / 2);
    }

    let vib = null;
    if (p.vibrato) {
      vib = ctx.createGain();
      vib.gain.setValueAtTime(0, t);
      vib.gain.linearRampToValueAtTime(p.vibrato.depth, t + (p.vibrato.delay ?? 0) + 0.1);
      this.osc('sine', p.vibrato.rate, t, end).connect(vib);
    }

    for (const w of p.waves) {
      const f = f0 * (w.mult ?? 1);
      const o = this.osc(w.type, f, t, end);
      if (p.glide) {
        o.frequency.setValueAtTime(f * p.glide, t);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
      }
      if (w.detune) o.detune.value = w.detune;
      if (vib) vib.connect(o.detune);
      const wg = ctx.createGain();
      const wgain = w.gain ?? 1;
      wg.gain.setValueAtTime(wgain, t);
      if (w.decay) wg.gain.setTargetAtTime(0, t, w.decay / 3);
      o.connect(wg).connect(flt);
    }

    let node = flt;
    if (p.drive) {
      const sh = ctx.createWaveShaper();
      sh.curve = this.driveCurve;
      node.connect(sh);
      node = sh;
    }
    node.connect(amp).connect(this.buses[busName]);
  }

  /** Cached Karplus-Strong string for an instrument at a MIDI note. */
  ksBuffer(id, midi, ks, seconds) {
    const key = `${id}:${midi}`;
    let buf = this.ksCache.get(key);
    if (!buf) {
      const sr = this.ctx.sampleRate;
      const data = pluck(sr, 440 * 2 ** ((midi - 69) / 12), seconds, ks);
      buf = this.ctx.createBuffer(1, data.length, sr);
      buf.copyToChannel(data, 0);
      this.ksCache.set(key, buf);
    }
    return buf;
  }

  /** Plucked string note: physical-model buffer + tone filter + amp envelope. */
  ksVoice(busName, id, p, t, midi, dur, vel, { dead = false, pan = 0 } = {}) {
    const ctx = this.ctx;
    const ks = p.ks;
    const src = ctx.createBufferSource();
    src.buffer = this.ksBuffer(id, midi, ks, busName === 'bass' ? 2.4 : 1.6);
    const lp = this.filter('lowpass', dead ? 500 : ks.lp * (0.6 + 0.5 * vel), 0.7);
    let node = src.connect(lp);
    if (ks.hp) node = node.connect(this.filter('highpass', ks.hp));
    const amp = ctx.createGain();
    const peak = vel * ks.gain;
    const rel = ks.r;
    const hold = dead ? 0.03 : Math.max(dur, 0.04);
    amp.gain.setValueAtTime(peak, t);
    amp.gain.setTargetAtTime(0, t + hold, dead ? 0.01 : rel / 3);
    node.connect(amp);
    let out = amp;
    if (pan) {
      const pn = ctx.createStereoPanner();
      pn.pan.value = pan;
      out = amp.connect(pn);
    }
    out.connect(this.buses[busName]);
    const end = t + hold + 0.5;
    src.start(t);
    src.stop(end);
    // body: a little sine fundamental for weight, and a finger/thump transient
    if (ks.sub && !dead) {
      const o = this.osc('sine', 440 * 2 ** ((midi - 69) / 12), t, end);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak * ks.sub, t + 0.006);
      g.gain.setTargetAtTime(peak * ks.sub * 0.6, t + 0.01, 0.15);
      g.gain.setTargetAtTime(0, t + hold, rel / 3);
      o.connect(g).connect(this.buses[busName]);
    }
    if (ks.thump) {
      const n = this.noise(t, 0.04);
      const g = this.envGain(t, peak * ks.thump * 0.3, 0.001, 0.03);
      n.connect(this.filter('lowpass', 400)).connect(g).connect(this.buses[busName]);
    }
  }

  /** Sampled key instrument (e-piano / piano), pitch-shifted from the nearest recorded note. */
  sampledKey(busName, kind, p, t, midi, dur, vel, pan = 0) {
    const list = this.keys[kind];
    if (!list?.length) return false;
    const ctx = this.ctx;
    let best = list[0];
    for (const k of list) if (Math.abs(k.midi - midi) < Math.abs(best.midi - midi)) best = k;
    const src = ctx.createBufferSource();
    src.buffer = best.buffer;
    src.playbackRate.value = 2 ** ((midi - best.midi) / 12);
    const tone = this.filter('lowpass', 1800 + 7000 * vel, 0.5);
    const amp = ctx.createGain();
    const peak = vel * (kind === 'piano' ? 1.5 : 1.25);
    amp.gain.setValueAtTime(peak, t);
    amp.gain.setTargetAtTime(0, t + Math.max(dur, 0.05), (p.r ?? 0.3) / 3);
    let out = src.connect(tone).connect(amp);
    if (pan) {
      const pn = ctx.createStereoPanner();
      pn.pan.value = pan;
      out = out.connect(pn);
    }
    out.connect(this.buses[busName]);
    src.start(t);
    src.stop(t + Math.max(dur, 0.05) + (p.r ?? 0.3) * 2.5);
    return true;
  }

  bass(t, midi, dur, vel, sound, dead = false) {
    const p = SOUNDS.bass[sound] ?? SOUNDS.bass.electric;
    if (p.ks) return this.ksVoice('bass', sound, p, t, midi, dur, vel, { dead });
    if (dead) this.voice('bass', { ...p, cutoff: 350, cutEnv: 300, s: 0, d: 0.03, r: 0.02, glide: 0 }, t, midi, 0.03, vel * 0.7);
    else this.voice('bass', p, t, midi, dur, vel);
  }

  chord(t, midis, dur, vel, sound) {
    const p = SOUNDS.chords[sound] ?? SOUNDS.chords.epiano;
    const per = vel / Math.sqrt(midis.length);
    midis.forEach((m, i) => {
      const at = t + i * (p.strum ?? 0);
      const pan = (i / Math.max(1, midis.length - 1) - 0.5) * 0.5; // spread the chord across the stereo field
      if (p.sampled && this.sampledKey('chords', p.sampled, p, at, m, dur, per, pan)) return;
      if (p.ks) return this.ksVoice('chords', 'guitar', p, at, m, dur, per, { pan });
      this.voice('chords', p, at, m, dur, per);
    });
  }

  melody(t, midi, dur, vel, sound) {
    const p = SOUNDS.melody[sound] ?? SOUNDS.melody.square;
    this.voice('melody', p, t, midi, dur, vel);
  }
}
