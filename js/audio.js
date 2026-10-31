// Web Audio synthesis: drum kit, click, and simple subtractive/additive synth voices.
// Nothing is sampled, so the app is tiny and works fully offline.

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

export const SOUNDS = {
  bass: {
    electric: { label: 'Electric', waves: [{ type: 'sawtooth' }, { type: 'sine', gain: 0.8 }], cutoff: 260, cutEnv: 1300, q: 4, a: 0.004, d: 0.2, s: 0.55, r: 0.05, gain: 0.85 },
    synth: { label: 'Synth', waves: [{ type: 'square' }, { type: 'sawtooth', detune: 10 }], cutoff: 300, cutEnv: 2400, q: 9, a: 0.003, d: 0.14, s: 0.45, r: 0.04, gain: 0.6 },
    upright: { label: 'Upright', waves: [{ type: 'triangle' }, { type: 'sine', gain: 0.7 }], cutoff: 700, cutEnv: 600, q: 1, a: 0.008, d: 0.35, s: 0.15, r: 0.1, gain: 1.1 },
    '808': { label: '808', waves: [{ type: 'sine' }], cutoff: 3000, q: 0.5, a: 0.002, d: 0.8, s: 0.75, r: 0.2, glide: 1.6, drive: true, gain: 0.9 },
  },
  chords: {
    epiano: { label: 'E-piano', waves: [{ type: 'sine' }, { type: 'sine', mult: 2, gain: 0.4, decay: 0.3 }, { type: 'sine', mult: 7, gain: 0.08, decay: 0.05 }], cutoff: 6000, a: 0.003, d: 0.9, s: 0.25, r: 0.25, gain: 0.45 },
    organ: { label: 'Organ', waves: [{ type: 'sine' }, { type: 'sine', mult: 2, gain: 0.5 }, { type: 'sine', mult: 3, gain: 0.3 }, { type: 'sine', mult: 4, gain: 0.15 }], cutoff: 5000, a: 0.008, d: 0.05, s: 1, r: 0.05, gain: 0.28 },
    guitar: { label: 'Guitar', waves: [{ type: 'sawtooth' }], cutoff: 900, cutEnv: 2500, q: 2, a: 0.002, d: 0.14, s: 0.2, r: 0.06, gain: 0.32, strum: 0.009 },
    pad: { label: 'Pad', waves: [{ type: 'sawtooth', detune: -9 }, { type: 'sawtooth', detune: 9 }], cutoff: 1100, q: 1, a: 0.25, d: 0.4, s: 0.8, r: 0.5, gain: 0.14 },
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

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.openHats = [];
  }

  init() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));

    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    this.buses = {};
    for (const name of ['click', 'drums', 'bass', 'chords', 'melody']) {
      const g = ctx.createGain();
      g.connect(this.master);
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

  drum(name, t, vel) {
    const fn = this[`d_${name}`];
    if (fn) fn.call(this, t, vel, this.buses.drums);
  }

  d_kick(t, v, out) {
    const o = this.osc('sine', 165, t, t + 0.5);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.12);
    const g = this.envGain(t, v * 1.1, 0.002, 0.42);
    o.connect(g).connect(out);
    const c = this.noise(t, 0.02);
    const cg = this.envGain(t, v * 0.25, 0.001, 0.012);
    c.connect(this.filter('bandpass', 3500, 1)).connect(cg).connect(out);
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

  bass(t, midi, dur, vel, sound, dead = false) {
    const p = SOUNDS.bass[sound] ?? SOUNDS.bass.electric;
    if (dead) this.voice('bass', { ...p, cutoff: 350, cutEnv: 300, s: 0, d: 0.03, r: 0.02, glide: 0 }, t, midi, 0.03, vel * 0.7);
    else this.voice('bass', p, t, midi, dur, vel);
  }

  chord(t, midis, dur, vel, sound) {
    const p = SOUNDS.chords[sound] ?? SOUNDS.chords.epiano;
    const per = vel / Math.sqrt(midis.length);
    midis.forEach((m, i) => this.voice('chords', p, t + i * (p.strum ?? 0), m, dur, per));
  }

  melody(t, midi, dur, vel, sound) {
    const p = SOUNDS.melody[sound] ?? SOUNDS.melody.square;
    this.voice('melody', p, t, midi, dur, vel);
  }
}
