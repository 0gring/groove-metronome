// Run: node tests/tuner.test.mjs
import assert from 'node:assert/strict';
import { detectPitch, freqToNote } from '../js/tuner.js';

const sr = 48000;
const tone = (f, detuneCents = 0) => {
  const hz = f * 2 ** (detuneCents / 1200);
  const b = new Float32Array(8192);
  for (let i = 0; i < b.length; i++) {
    const t = i / sr;
    // bass-like spectrum: strong 2nd harmonic, some 3rd/4th, plus noise
    b[i] = 0.3 * Math.sin(2 * Math.PI * hz * t) + 0.45 * Math.sin(2 * Math.PI * 2 * hz * t + 1)
      + 0.2 * Math.sin(2 * Math.PI * 3 * hz * t + 2) + 0.1 * Math.sin(2 * Math.PI * 4 * hz * t) + (Math.random() - 0.5) * 0.02;
  }
  return b;
};
const strings = { B0: 30.87, E1: 41.2, A1: 55, D2: 73.42, G2: 98, C3: 130.81, G3: 196 };
for (const [name, f] of Object.entries(strings)) {
  for (const det of [-20, 0, 15]) {
    const got = detectPitch(tone(f, det), sr);
    const n = freqToNote(got);
    assert.equal(n.name + n.octave, name.replace('C3', 'C3'), `${name} ${det}c → ${got?.toFixed(2)} (${n.name}${n.octave})`);
    assert.ok(Math.abs(n.cents - det) <= 3, `${name} ${det}c: cents ${n.cents}`);
  }
}
assert.equal(detectPitch(new Float32Array(8192), sr), null);
console.log('ok – tuner detects B0..G3 within 3 cents');
