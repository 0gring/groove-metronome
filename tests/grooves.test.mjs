// Run: node tests/grooves.test.mjs
import assert from 'node:assert/strict';
import { GROOVES, DRUM_ORDER, PROGRESSIONS } from '../js/grooves.js';
import { SOUNDS } from '../js/audio.js';
import { parseDrum, parseLine, parseComp, parseProg, generateMelody, generateBass, beatPositions, resolveNote, parseNoteToken, cleanDrum, expandDrum, expandLine, generateDrill, DRILLS } from '../js/theory.js';

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
  for (const v of g.vars ?? []) {
    assert.ok(v.name, `${g.id}: variation needs a name`);
    for (const [k, str] of Object.entries(v.drums)) {
      assert.ok(DRUM_ORDER.includes(k), `${g.id}/${v.name}: unknown drum ${k}`);
      if (str !== null) check(`${v.name}/${k}`, parseDrum(str).length);
    }
  }
  if (!g.basic) assert.ok((g.vars ?? []).length >= 2, `${g.id}: expected at least 2 variations`);
  for (const [layer, key] of [['bass', 'bassSound'], ['chords', 'chordSound'], ['melody', 'melodySound']]) {
    if (g[key]) assert.ok(SOUNDS[layer][g[key]], `${g.id}: unknown ${layer} sound "${g[key]}"`);
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

// scale & arpeggio drills: chord-aware tokens, right length, notes on the chosen grid
assert.equal(resolveNote(parseNoteToken('s3'), 'm7'), 3, 'minor third in a minor chord scale');
assert.equal(resolveNote(parseNoteToken('s3'), '7'), 4);
assert.equal(resolveNote(parseNoteToken('s7'), '7'), 10, 'mixolydian b7');
assert.equal(resolveNote(parseNoteToken('s8'), 'dim'), 12, 's8 is always the octave');
assert.equal(resolveNote(parseNoteToken('N'), ''), 12, 'triad: 4th arpeggio note is the octave');
assert.equal(resolveNote(parseNoteToken('N'), 'maj7'), 11);
for (const kind of Object.keys(DRILLS)) {
  for (const [beats, sub, div] of [[4, 4, 1], [4, 2, 2], [4, 4, 4], [3, 2, 0], [6, 2, 1], [4, 3, 2], [7, 2, 2]]) {
    const line = parseLine(generateDrill({ beats, sub }, kind, div));
    assert.equal(line.length, beats * sub * 2, `${kind} length`);
    const first = line.events.findIndex(Boolean);
    assert.equal(first, 0, `${kind} starts on the downbeat`);
    assert.ok(['R', 's1'].includes(line.events[0].tok), `${kind} starts on the root`);
    const want = (beatPositions(sub, div || 2) ?? [0]).length * beats * 2;
    assert.equal(line.events.filter(Boolean).length, want, `${kind} ${beats}/${sub} div ${div}: one note per grid slot`);
  }
}
console.log(`ok – ${n} grooves validated, drills ok`);
