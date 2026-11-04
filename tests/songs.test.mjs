// Run: node tests/songs.test.mjs — every song parses, bars add up, parts are in range.
import assert from 'node:assert/strict';
import { SONGS, songMelody, songBass, songChords, buildSong, noteMidi, parseChord } from '../js/songs.js';
import { GROOVES } from '../js/grooves.js';

assert.equal(noteMidi('C4'), 60);
assert.equal(noteMidi('G#4'), 68);
assert.deepEqual(parseChord('F#m7'), { pc: 6, q: 'm7', name: 'F#m7' });
const ids = new Set();
for (const s of SONGS) {
  assert.ok(!ids.has(s.id)); ids.add(s.id);
  const g = GROOVES.find((x) => x.id === s.groove);
  assert.ok(g, `${s.id}: unknown groove ${s.groove}`);
  assert.equal(g.beats, s.beats, `${s.id}: groove ${s.groove} has ${g.beats} beats per bar, song has ${s.beats}`);
  const chords = songChords(s);
  const mel = songMelody(s); // throws if a bar doesn't add up
  const bass = songBass(s);
  const bars = chords[chords.length - 1].bar + 1;
  if (s.melody) assert.equal(s.melody.split('|').length, bars, `${s.id}: melody and chords have the same number of bars`);
  for (const n of bass) assert.ok(n.midi >= 26 && n.midi <= 64 && n.dur > 0, `${s.id}: bass note ${n.midi} in range`);
  for (const n of mel) assert.ok(n.midi >= 50 && n.midi <= 84, `${s.id}: melody note ${n.midi} in range`);
  // bass notes fill each bar without overlap
  for (let b = 0; b < bars; b++) {
    const total = bass.filter((n) => n.bar === b).reduce((a, n) => a + n.dur, 0);
    assert.ok(Math.abs(total - s.beats) < 1e-6, `${s.id}: bass bar ${b + 1} adds up (${total})`);
  }
  for (const part of ['bass', 'melody']) {
    const p = buildSong(s, part);
    assert.equal(p.bars, bars);
    assert.ok(p.notes.every((n) => n.si !== undefined), `${s.id}/${part}: every note has a string`);
  }
}
console.log(`ok – ${SONGS.length} songs: melodies, chords and bass lines add up`);
