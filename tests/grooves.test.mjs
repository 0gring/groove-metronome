// Run: node tests/grooves.test.mjs
import assert from 'node:assert/strict';
import { GROOVES, DRUM_ORDER, PROGRESSIONS } from '../js/grooves.js';
import { parseDrum, parseLine, parseComp, parseProg, generateMelody, generateBass, beatPositions, resolveNote, parseNoteToken, cleanDrum, expandDrum, expandLine } from '../js/theory.js';

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
  for (const style of ['roots', 'r58', 'kick', 'walk', 'random']) {
    for (const div of [1, 2, 4]) {
      const kick = g.drums.kick ? cleanDrum(g.drums.kick) : undefined;
      const allowed = beatPositions(g.sub, div);
      for (let i = 0; i < 10; i++) {
        const line = parseLine(generateBass({ beats: g.beats, sub: g.sub, kick }, style, Math.random, div));
        check(`bass ${style}/${div}`, line.length);
        assert.ok(line.events[0], `${g.id} ${style}/${div}: must start on beat 1`);
        line.events.forEach((e, pos) => {
          if (e) assert.ok(allowed.includes(pos % g.sub), `${g.id} ${style}/${div}: note at step ${pos} is off the grid`);
        });
        if (style === 'roots' || style === 'r58') {
          assert.equal(line.events.filter(Boolean).length, (line.length / g.sub) * allowed.length, `${g.id} ${style}/${div}: one note per grid position`);
        }
      }
    }
    for (let i = 0; i < 20; i++) {
      const kick = g.drums.kick ? cleanDrum(g.drums.kick) : undefined;
      const line = parseLine(generateBass({ beats: g.beats, sub: g.sub, kick }, style));
      check(`bass ${style}`, line.length);
      assert.ok(line.events[0], `${g.id} ${style}: bass must start on beat 1`);
    }
  }
  n++;
}
for (const p of PROGRESSIONS) if (p.chords) parseProg(p.chords);
assert.ok(parseNoteToken('A').approach);
assert.deepEqual(beatPositions(4, 2), [0, 2]);
assert.deepEqual(beatPositions(3, 2), [0, 2]); // swung eighths on a triplet grid
assert.deepEqual(beatPositions(2, 4), [0, 1]); // grid too coarse for 16ths: use every step
assert.equal(beatPositions(4, 0), null);
assert.equal(expandDrum('X..x', 2), 'X.......x.'.slice(0, 2) + '....' + 'x.'); // each step -> hit + rest
assert.equal(expandDrum('X..x', 2), 'X.....x.');
assert.equal(expandLine('R - . F', 2), 'R - - - . . F -');
// refining an eighth-note groove to 16ths keeps every hit at the same time position
for (const g of GROOVES.filter((x) => x.sub === 2)) {
  for (const str of Object.values(g.drums)) {
    const a = parseDrum(str);
    const b = parseDrum(expandDrum(str, 2));
    assert.equal(b.length, a.length * 2);
    a.forEach((h, i) => assert.deepEqual(b[i * 2], h));
    b.forEach((h, i) => i % 2 && assert.equal(h, null));
  }
}
assert.equal(generateBass({ beats: 4, sub: 4 }, 'r58', Math.random, 2), 'R - F - 8 - F - R - F - 8 - F -');
assert.equal(resolveNote(parseNoteToken('T'), 'm7'), 3);
assert.equal(resolveNote(parseNoteToken('T'), '7'), 4);
assert.equal(resolveNote(parseNoteToken('S'), 'maj7'), 11);
assert.equal(resolveNote(parseNoteToken('^F'), ''), 19);
assert.equal(resolveNote(parseNoteToken('_5'), ''), -5);
assert.equal(resolveNote(parseNoteToken('b7'), ''), 10);
assert.equal(parseLine('R - - . 5 -').events[0].len, 3);
console.log(`ok – ${n} grooves validated`);
