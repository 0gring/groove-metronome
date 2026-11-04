// Built-in song library: public-domain songs (traditional, or composers who died long ago),
// arranged for practice. Each song has chords, a melody and a generated bass line, so the user can
// practise one part while the app plays the others.
//
// melody: bars separated by '|'; tokens "C5:1" (note + octave : length) or "r:1" (rest).
//         Lengths are in beats, or in `unit`s (e.g. eighth notes in 6/8, triplet eighths in a shuffle).
// chords: bars separated by '|'; one or two chord symbols per bar (two = half a bar each).
// bass:   style of the generated bass line: walk, two, root, arp (compound time), boogie, waltz.

import { QUALITIES, mod } from './theory.js';
import { finalize, BASS4, GUITAR } from './importers.js';

export const SONGS = [
  {
    id: 'saints', title: 'When the Saints Go Marching In', origin: 'Traditional spiritual',
    groove: 'secondline', bpm: 112, beats: 4, bass: 'walk',
    chords: 'C | C | C | C | C | C | C | G7 | C | C7 | F | F | C | C | G7 | C',
    melody: 'r:1 C4:1 E4:1 F4:1 | G4:4 | r:1 C4:1 E4:1 F4:1 | G4:4 | r:1 C4:1 E4:1 F4:1 | G4:2 E4:2 | C4:2 E4:2 | D4:4 | '
      + 'r:1 E4:1 E4:1 D4:1 | C4:3 C4:1 | E4:2 G4:2 | G4:1 F4:3 | r:1 E4:1 F4:1 G4:1 | E4:2 C4:2 | D4:4 | C4:4',
  },
  {
    id: 'amazing', title: 'Amazing Grace', origin: 'Traditional hymn (John Newton, 1779)',
    groove: 'waltz', bpm: 84, beats: 3, bass: 'waltz',
    chords: 'G | G | G7 | C | G | G | Em | D | D7 | G | G7 | C | G | G | D7 | G',
    melody: 'r:2 D4:1 | G4:2 B4:0.5 G4:0.5 | B4:2 A4:1 | G4:2 E4:1 | D4:2 D4:1 | G4:2 B4:0.5 G4:0.5 | B4:2 A4:1 | D5:3 | '
      + 'D5:2 B4:1 | D5:2 B4:0.5 G4:0.5 | B4:2 A4:1 | G4:2 E4:1 | D4:2 D4:1 | G4:2 B4:0.5 G4:0.5 | B4:2 A4:1 | G4:3',
  },
  {
    id: 'odetojoy', title: 'Ode to Joy', origin: 'Ludwig van Beethoven, Symphony No. 9 (1824)',
    groove: 'rock', bpm: 108, beats: 4, bass: 'two', transpose: 2,
    chords: 'C | G | C | G | C | G | C | G C | G | C | G | C G | C | G | C | G C',
    melody: 'E4:1 E4:1 F4:1 G4:1 | G4:1 F4:1 E4:1 D4:1 | C4:1 C4:1 D4:1 E4:1 | E4:1.5 D4:0.5 D4:2 | '
      + 'E4:1 E4:1 F4:1 G4:1 | G4:1 F4:1 E4:1 D4:1 | C4:1 C4:1 D4:1 E4:1 | D4:1.5 C4:0.5 C4:2 | '
      + 'D4:1 D4:1 E4:1 C4:1 | D4:1 E4:0.5 F4:0.5 E4:1 C4:1 | D4:1 E4:0.5 F4:0.5 E4:1 D4:1 | C4:1 D4:1 G3:2 | '
      + 'E4:1 E4:1 F4:1 G4:1 | G4:1 F4:1 E4:1 D4:1 | C4:1 C4:1 D4:1 E4:1 | D4:1.5 C4:0.5 C4:2',
  },
  {
    id: 'auldlang', title: 'Auld Lang Syne', origin: 'Traditional Scottish (Robert Burns, 1788)',
    groove: 'motownballad', bpm: 76, beats: 4, bass: 'two', transpose: -7,
    chords: 'C | C | G7 | C | F | C | G7 | F G7 | C',
    melody: 'r:3 G4:1 | C5:1.5 C5:0.5 C5:1 E5:1 | D5:1.5 C5:0.5 D5:1 E5:1 | C5:1.5 C5:0.5 E5:1 G5:1 | A5:3 A5:1 | '
      + 'G5:1.5 E5:0.5 E5:1 C5:1 | D5:1.5 C5:0.5 D5:1 E5:1 | C5:1.5 A4:0.5 A4:1 G4:1 | C5:4',
  },
  {
    id: 'greensleeves', title: 'Greensleeves', origin: 'Traditional English (16th century)',
    groove: 'ballad68', bpm: 66, beats: 2, unit: 1 / 3, bass: 'arp',
    chords: 'Am | Am | G | Am | E | Am | G | Am E | Am',
    melody: 'r:5 A4:1 | C5:2 D5:1 E5:1.5 F5:0.5 E5:1 | D5:2 B4:1 G4:1.5 A4:0.5 B4:1 | C5:2 A4:1 A4:1.5 G#4:0.5 A4:1 | B4:2 G#4:1 E4:2 A4:1 | '
      + 'C5:2 D5:1 E5:1.5 F5:0.5 E5:1 | D5:2 B4:1 G4:1.5 A4:0.5 B4:1 | C5:1.5 B4:0.5 A4:1 G#4:1.5 F#4:0.5 G#4:1 | A4:6',
  },
  {
    id: 'risingsun', title: 'House of the Rising Sun', origin: 'Traditional American folk song',
    groove: 'ballad68', bpm: 72, beats: 2, unit: 1 / 3, bass: 'arp',
    chords: 'Am C | D F | Am C | E E | Am C | D F | Am E | Am E',
  },
  {
    id: 'drunkensailor', title: 'Drunken Sailor', origin: 'Traditional sea shanty',
    groove: 'punk', bpm: 150, beats: 4, bass: 'two',
    chords: 'Dm | Dm | C | C | Dm | Dm | C | Dm | Dm | Dm | C | C | Dm | Dm | C | Dm',
    melody: 'A4:1 A4:0.5 A4:0.5 A4:1 A4:0.5 A4:0.5 | A4:1 D4:1 F4:1 A4:1 | G4:1 G4:0.5 G4:0.5 G4:1 G4:0.5 G4:0.5 | G4:1 C4:1 E4:1 G4:1 | '
      + 'A4:1 A4:0.5 A4:0.5 A4:1 A4:0.5 A4:0.5 | A4:1 B4:1 C5:1 D5:1 | C5:1 A4:1 G4:1 E4:1 | D4:2 D4:2 | '
      + 'A4:2 A4:2 | A4:1 D4:1 F4:1 A4:1 | G4:2 G4:2 | G4:1 C4:1 E4:1 G4:1 | A4:2 A4:2 | A4:1 B4:1 C5:1 D5:1 | C5:1 A4:1 G4:1 E4:1 | D4:2 D4:2',
  },
  {
    id: 'blues12', title: '12-Bar Blues in E', origin: 'Traditional blues form (riff arranged for this app)',
    groove: 'shuffle', bpm: 96, beats: 4, unit: 1 / 3, bass: 'boogie',
    chords: 'E7 | A7 | E7 | E7 | A7 | A7 | E7 | E7 | B7 | A7 | E7 | B7',
    melody: 'r:3 E4:2 G4:1 A4:2 B4:1 r:3 | r:3 A4:2 C5:1 D5:2 E5:1 r:3 | r:3 E4:2 G4:1 A4:2 B4:1 r:3 | E5:2 D5:1 B4:2 A4:1 G4:3 r:3 | '
      + 'r:3 A4:2 C5:1 D5:2 E5:1 r:3 | A4:2 G4:1 E4:2 G4:1 A4:3 r:3 | r:3 E4:2 G4:1 A4:2 B4:1 r:3 | E5:2 D5:1 B4:2 A4:1 G4:3 r:3 | '
      + 'r:3 B4:2 D5:1 E5:2 F#5:1 r:3 | r:3 A4:2 C5:1 D5:2 E5:1 r:3 | E4:2 G4:1 A4:2 B4:1 E5:3 r:3 | B4:6 r:6',
  },
];

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const Q = { '': '', m: 'm', 7: '7', m7: 'm7', maj7: 'maj7', 6: '6', m6: 'm6', 9: '9', m9: 'm9', dim: 'dim', m7b5: 'm7b5', sus: 'sus', sus4: 'sus' };

/** "F#m7" -> { pc: 6, q: 'm7', name } */
export function parseChord(sym) {
  const m = /^([A-G])([#b]?)(.*)$/.exec(sym);
  if (!m || !(m[3] in Q)) throw new Error(`Unknown chord "${sym}"`);
  return { pc: mod(PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0), 12), q: Q[m[3]], name: sym };
}

/** "G#4" -> MIDI */
export function noteMidi(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`Bad note "${name}"`);
  return (Number(m[3]) + 1) * 12 + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const transposeSym = (c, t) => {
  const name = NAMES[mod(c.pc + t, 12)];
  return { ...c, pc: mod(c.pc + t, 12), name: name + c.name.replace(/^[A-G][#b]?/, '') };
};

/** Chord timeline: [{ bar, beat, dur, pc, q, name }] (in beats). */
export function songChords(song) {
  const t = song.transpose ?? 0;
  const out = [];
  song.chords.split('|').forEach((bar, b) => {
    const syms = bar.trim().split(/\s+/).filter(Boolean);
    const each = song.beats / syms.length;
    syms.forEach((sym, i) => out.push({ bar: b, beat: i * each, dur: each, ...transposeSym(parseChord(sym), t) }));
  });
  return out;
}

/** Melody notes: [{ bar, beat, dur, midi }] (beats). Throws if a bar doesn't add up. */
export function songMelody(song) {
  if (!song.melody) return [];
  const unit = song.unit ?? 1;
  const t = song.transpose ?? 0;
  const notes = [];
  song.melody.split('|').forEach((bar, b) => {
    let pos = 0;
    for (const tok of bar.trim().split(/\s+/).filter(Boolean)) {
      const [n, len] = tok.split(':');
      const dur = Number(len) * unit;
      if (n !== 'r') notes.push({ bar: b, beat: pos, dur, midi: noteMidi(n) + t });
      pos += dur;
    }
    if (Math.abs(pos - song.beats) > 1e-6) throw new Error(`${song.id}: melody bar ${b + 1} has ${pos} beats, expected ${song.beats}`);
  });
  return notes;
}

const bassRoot = (pc) => 28 + mod(pc - 4, 12); // E1 .. D#2

/** Bass line generated from the chords in the song's style: [{ bar, beat, dur, midi }]. */
export function songBass(song) {
  const chords = songChords(song);
  const notes = [];
  const push = (c, beat, dur, semi) => notes.push({ bar: c.bar, beat: c.beat + beat, dur, midi: bassRoot(c.pc) + semi });
  chords.forEach((c, i) => {
    const next = chords[i + 1] ?? chords[0];
    const iv = QUALITIES[c.q] ?? QUALITIES[''];
    const third = iv[1];
    const fifth = iv.includes(6) && !iv.includes(7) ? 6 : 7;
    const approach = () => {
      const target = bassRoot(next.pc);
      return (target - 1 >= 28 ? target - 1 : target + 1) - bassRoot(c.pc);
    };
    const n = Math.round(c.dur);
    switch (song.bass) {
      case 'walk': {
        const mids = [2, third, fifth];
        for (let k = 0; k < n; k++) push(c, k, 1, k === 0 ? 0 : k === n - 1 && n > 1 ? approach() : mids[(k - 1) % 3]);
        break;
      }
      case 'boogie': {
        const line = [0, third, 7, 9, 10, 9, 7, third];
        for (let k = 0; k < n * 2; k++) push(c, Math.floor(k / 2) + (k % 2 ? 2 / 3 : 0), k % 2 ? 1 / 3 : 2 / 3, line[k % 8]);
        break;
      }
      case 'arp': // compound time: root, fifth, octave on the eighths of each dotted-quarter beat
        for (let k = 0; k < n; k++) [0, fifth, 12].forEach((s, j) => push(c, k + j / 3, 1 / 3, s));
        break;
      case 'waltz':
        for (let k = 0; k < n; k++) push(c, k, 1, [0, fifth, 12][k % 3]);
        break;
      case 'two':
        if (n >= 2) {
          push(c, 0, c.dur / 2, 0);
          push(c, c.dur / 2, c.dur / 2, n >= 4 ? fifth : approach());
        } else push(c, 0, c.dur, 0);
        break;
      default:
        push(c, 0, c.dur, 0);
    }
  });
  return notes;
}

/**
 * Build the practice piece for one part ('bass' or 'melody'): the tab shows that part,
 * the other part and the chords play along.
 */
export function buildSong(song, part = 'bass', strings = BASS4) {
  const melody = songMelody(song);
  const bass = songBass(song);
  const chords = songChords(song);
  const focusNotes = (part === 'melody' && melody.length ? melody : bass).map((n) => ({ ...n }));
  const focus = part === 'melody' && melody.length ? 'melody' : 'bass';
  const piece = finalize(
    { title: song.title, kind: 'song', beats: song.beats, beatType: 4, cpb: song.unit ? 3 : 4, notes: focusNotes, tempo: song.bpm },
    focus === 'bass' ? strings : GUITAR,
  );
  const bars = Math.max(piece.bars, chords.length ? chords[chords.length - 1].bar + 1 : 0);
  piece.bars = bars;
  piece.song = song;
  piece.part = focus;
  piece.forceLayer = focus;
  const byBar = (list) => {
    const out = Array.from({ length: bars }, () => []);
    for (const n of list) out[n.bar]?.push(n);
    return out;
  };
  piece.accomp = [];
  if (focus === 'bass' && melody.length) piece.accomp.push({ layer: 'melody', byBar: byBar(melody) });
  if (focus === 'melody') piece.accomp.push({ layer: 'bass', byBar: byBar(bass) });
  piece.chordsByBar = byBar(chords);
  return piece;
}
