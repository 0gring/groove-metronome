// Run: node tests/importers.test.mjs   (MusicXML parsing is tested in the browser smoke test: needs DOMParser)
import assert from 'node:assert/strict';
import { parseAsciiTab, findTabBlocks, unzip } from '../js/importers.js';

// Typical bass tab with bar lines, two systems, some text around it
const tab = `
Song Title - Some Artist
Tuning: standard

G|-----------------|-----------------|
D|-----------------|---------5--7----|
A|---------3-------|-5---7-----------|
E|-3---3------3--3-|-----------------|

Chorus:
G|---------0-------|
D|-0---2-----------|
A|-----------------|
E|-------------x---|
`;
const p = parseAsciiTab(tab, { title: 't' });
assert.equal(p.bars, 3);
assert.deepEqual(p.names, ['G', 'D', 'A', 'E']);
const bar0 = p.notes.filter((n) => n.bar === 0);
assert.deepEqual(bar0.map((n) => [n.beat, n.midi]), [[0, 31], [1, 31], [2, 36], [2.75, 31], [3.5, 31]]);
assert.deepEqual(p.notes.filter((n) => n.bar === 2).map((n) => n.beat), [0, 1, 2, 3]);
const bar1 = p.notes.filter((n) => n.bar === 1).map((n) => n.midi);
assert.deepEqual(bar1, [38, 40, 43, 45]); // A5 A7 D5 D7 -> D E G A
assert.ok(p.notes.find((n) => n.bar === 2 && n.dead), 'dead note parsed');
assert.ok(p.notes.every((n) => n.dur > 0));

// Two-digit frets, drop-D tuning, no bar lines (1 char = 16th)
const drop = `D-----------------
A-----------------
D-----------------
D--0---12--0--5---`;
const d = parseAsciiTab(drop);
assert.equal(d.tuning[3], 26, 'drop D low string');
assert.deepEqual(d.notes.map((n) => [n.beat, n.midi]), [[0.5, 26], [1.5, 38], [2.5, 26], [3.25, 31]]);

// 5-string and guitar detection
assert.equal(parseAsciiTab('G|---|\nD|---|\nA|---|\nE|---|\nB|-0-------|'.replace(/---\|/g, '------|')).tuning.length, 5);
const gtr = parseAsciiTab('e|-0------|\nB|--------|\nG|--------|\nD|--------|\nA|--------|\nE|--------|');
assert.equal(gtr.notes[0].midi, 64);

// prose is not tab
assert.equal(findTabBlocks('Hello there - this is a - line\nNot-a-tab-line at all').length, 0);
assert.throws(() => parseAsciiTab('just words'), /No tab found/);

// unzip: build a tiny stored zip by hand
const enc = new TextEncoder();
const name = enc.encode('a.txt');
const data = enc.encode('hello');
const local = new Uint8Array(30 + name.length + data.length);
const ldv = new DataView(local.buffer);
ldv.setUint32(0, 0x04034b50, true); ldv.setUint32(18, data.length, true); ldv.setUint32(22, data.length, true); ldv.setUint16(26, name.length, true);
local.set(name, 30); local.set(data, 30 + name.length);
const cen = new Uint8Array(46 + name.length);
const cdv = new DataView(cen.buffer);
cdv.setUint32(0, 0x02014b50, true); cdv.setUint32(20, data.length, true); cdv.setUint32(24, data.length, true); cdv.setUint16(28, name.length, true); cdv.setUint32(42, 0, true);
cen.set(name, 46);
const end = new Uint8Array(22);
const edv = new DataView(end.buffer);
edv.setUint32(0, 0x06054b50, true); edv.setUint16(8, 1, true); edv.setUint16(10, 1, true); edv.setUint32(12, cen.length, true); edv.setUint32(16, local.length, true);
const zipBuf = new Uint8Array([...local, ...cen, ...end]).buffer;
const z = await unzip(zipBuf);
assert.equal(await z.read('a.txt'), 'hello');

console.log('ok – ASCII tab parser and unzip');
