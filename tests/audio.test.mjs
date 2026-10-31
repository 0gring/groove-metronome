// Run: node tests/audio.test.mjs — the plucked-string model must play in tune.
import assert from 'node:assert/strict';
import { pluck } from '../js/audio.js';
import { detectPitch, freqToNote } from '../js/tuner.js';

const sr = 44100;
const cases = { 'E1 (bass)': 28, 'A1': 33, 'D2': 38, 'G2': 43, 'C3': 48, 'E3 (guitar)': 52, 'A3': 57 };
const settings = [
  { bright: 0.42, pick: 0.16, decay: 0.997 }, // finger bass
  { bright: 0.22, pick: 0.28, decay: 0.991 }, // upright
  { bright: 0.75, pick: 0.13, decay: 0.994 }, // guitar
];
for (const [name, midi] of Object.entries(cases)) {
  for (const ks of settings) {
    const f = 440 * 2 ** ((midi - 69) / 12);
    const y = pluck(sr, f, 1.0, ks);
    assert.ok(y.every(Number.isFinite), 'finite samples');
    assert.ok(Math.max(...y.slice(0, 4000).map(Math.abs)) > 0.5, 'audible');
    const got = detectPitch(y.slice(4410, 4410 + 8192), sr);
    const n = freqToNote(got);
    assert.equal(n.midi, midi, `${name}: detected ${n.name}${n.octave}`);
    assert.ok(Math.abs(n.cents) <= 4, `${name} ${JSON.stringify(ks)}: ${n.cents} cents off`);
  }
}
console.log('ok – plucked-string bass/guitar in tune within 4 cents');
