// Run: node tests/grooves.test.mjs
import assert from 'node:assert/strict';
import { GROOVES, DRUM_ORDER } from '../js/grooves.js';
import { parseDrum, parseLine, parseComp, parseProg, generateMelody, resolveNote, parseNoteToken } from '../js/theory.js';

let n = 0;
const ids = new Set();
for (const g of GROOVES) {
  assert.ok(!ids.has(g.id), `duplicate id ${g.id}`); ids.add(g.id);
  const spb = g.beats * g.sub;
  const check = (what, len) => assert.equal(len % spb, 0, `${g.id} ${what}: length ${len} not a multiple of ${spb}`);
  for (const [k, s] of Object.entries(g.drums)) {
    assert.ok(DRUM_ORDER.includes(k), `${g.id}: unknown drum ${k}`);
    check(k, parseDrum(s).length);
  }
  if (g.bass) check('bass', parseLine(g.bass).length);
  if (g.melody) check('melody', parseLine(g.melody).length);
  if (g.chords) check('chords', parseComp(g.chords).length);
  parseProg(g.prog);
  if (!g.basic) {
    for (let i = 0; i < 50; i++) {
      const line = parseLine(generateMelody(g));
      check('generated melody', line.length);
      assert.ok(line.events.filter(Boolean).length >= 3);
    }
  }
  n++;
}
assert.equal(resolveNote(parseNoteToken('T'), 'm7'), 3);
assert.equal(resolveNote(parseNoteToken('T'), '7'), 4);
assert.equal(resolveNote(parseNoteToken('S'), 'maj7'), 11);
assert.equal(resolveNote(parseNoteToken('^F'), ''), 19);
assert.equal(resolveNote(parseNoteToken('_5'), ''), -5);
assert.equal(resolveNote(parseNoteToken('b7'), ''), 10);
assert.equal(parseLine('R - - . 5 -').events[0].len, 3);
console.log(`ok – ${n} grooves validated`);
