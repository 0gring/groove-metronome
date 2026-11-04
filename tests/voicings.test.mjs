// Run: node tests/voicings.test.mjs — guitar shapes and keyboard voice leading.
import assert from 'node:assert/strict';
import { QUALITIES, guitarVoicing, keysVoicing, keyTones, mod } from '../js/theory.js';

for (const q of Object.keys(QUALITIES)) {
  const tones = new Set(QUALITIES[q].map((i) => i % 12));
  for (let pc = 0; pc < 12; pc++) {
    const g = guitarVoicing(pc, q);
    assert.ok(g.length >= 3, `${pc}${q}: at least 3 strings`);
    assert.ok(g[0] >= 40 && g[g.length - 1] <= 80, `${pc}${q}: within guitar range (${g})`);
    assert.equal(mod(g[0] - pc, 12), 0, `${pc}${q}: root in the bass`);
    for (const n of g) assert.ok(tones.has(mod(n - pc, 12)) || (q.includes('9') && mod(n - pc, 12) === 2), `${pc}${q}: ${n} is a chord tone`);
    for (let i = 1; i < g.length; i++) assert.ok(g[i] > g[i - 1], 'ascending strings');

    const k = keysVoicing(pc, q);
    assert.ok(k[0] >= 52 && k[k.length - 1] <= 77, `${pc}${q}: keys in range (${k})`);
    const third = QUALITIES[q][1] % 12;
    if (q !== '5' && q !== 'sus') assert.ok(k.some((n) => mod(n - pc, 12) === third), `${pc}${q}: has its 3rd`);
    assert.deepEqual(new Set(k.map((n) => mod(n - pc, 12))), new Set(keyTones(q)), `${pc}${q}: voices the right tones`);
  }
}
// voice leading: around the circle of 4ths, each chord moves little and never drifts out of range
let prev = null;
let worst = 0;
for (let bar = 0; bar < 48; bar++) {
  const pc = mod(bar * 5, 12);
  const v = keysVoicing(pc, bar % 2 ? '7' : 'm7', prev);
  if (prev) worst = Math.max(worst, ...v.map((n, i) => Math.abs(n - prev[i])));
  prev = v;
}
assert.ok(worst <= 5, `smooth voice leading (largest single-voice move ${worst} semitones)`);
console.log(`ok – guitar shapes for all ${Object.keys(QUALITIES).length} chord types × 12 keys; voice leading max move ${worst} semitones`);
