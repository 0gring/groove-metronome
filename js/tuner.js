// Microphone tuner tuned for bass (B0 ≈ 31 Hz up to ~400 Hz).
// Uses time-domain autocorrelation on a 4x-decimated signal so it stays cheap on phones.

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const DECIMATE = 4;
const MIN_HZ = 28;
const MAX_HZ = 420;

export function freqToNote(f) {
  const midi = 69 + 12 * Math.log2(f / 440);
  const nearest = Math.round(midi);
  return {
    midi: nearest,
    name: NAMES[((nearest % 12) + 12) % 12],
    octave: Math.floor(nearest / 12) - 1,
    cents: Math.round((midi - nearest) * 100),
  };
}

/** Returns the fundamental frequency of `buf` (Float32Array) in Hz, or null if unclear. */
export function detectPitch(buf, sampleRate) {
  const n = Math.floor(buf.length / DECIMATE);
  const x = new Float32Array(n);
  let rms = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < DECIMATE; k++) s += buf[i * DECIMATE + k];
    x[i] = s / DECIMATE;
    rms += x[i] * x[i];
  }
  rms = Math.sqrt(rms / n);
  if (rms < 0.008) return null;

  const sr = sampleRate / DECIMATE;
  const minLag = Math.floor(sr / MAX_HZ);
  const maxLag = Math.min(Math.ceil(sr / MIN_HZ), Math.floor(n / 2));
  const win = n - maxLag;
  const corr = new Float32Array(maxLag + 2);
  let max = 0;
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = 0; i < win; i++) s += x[i] * x[i + lag];
    corr[lag] = s;
    if (lag <= maxLag && s > max) max = s;
  }
  if (max <= 0) return null;

  // Smallest lag that is a local peak close to the global max avoids octave errors.
  for (let lag = minLag + 1; lag <= maxLag; lag++) {
    const c = corr[lag];
    if (c > 0.88 * max && c >= corr[lag - 1] && c >= corr[lag + 1]) {
      const a = corr[lag - 1];
      const b = corr[lag + 1];
      const den = a - 2 * c + b;
      const shift = den ? (0.5 * (a - b)) / den : 0;
      return sr / (lag + shift);
    }
  }
  return null;
}

export class Tuner {
  constructor(audio) {
    this.audio = audio;
    this.stream = null;
    this.timer = null;
    this.smoothed = null;
  }

  get running() {
    return !!this.stream;
  }

  async start(onReading) {
    const ctx = this.audio.init();
    await this.audio.resume();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.source = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 8192;
    this.source.connect(this.analyser);
    const buf = new Float32Array(this.analyser.fftSize);
    this.timer = setInterval(() => {
      this.analyser.getFloatTimeDomainData(buf);
      const f = detectPitch(buf, ctx.sampleRate);
      if (!f) {
        this.smoothed = null;
        onReading(null);
        return;
      }
      // smooth in the log domain, but jump immediately on a new note
      if (this.smoothed && Math.abs(12 * Math.log2(f / this.smoothed)) < 0.5) {
        this.smoothed = this.smoothed * 0.7 + f * 0.3;
      } else this.smoothed = f;
      onReading({ freq: this.smoothed, ...freqToNote(this.smoothed) });
    }, 70);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.smoothed = null;
  }
}
