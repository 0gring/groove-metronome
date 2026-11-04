// Importers: turn ASCII tab, MusicXML (.musicxml/.xml/.mxl) into a playable "piece".
//
// Piece shape:
// {
//   title, kind: 'tab' | 'xml',
//   beats, beatType,          // time signature (beats per bar, beat unit)
//   cpb,                      // tab columns per beat for display
//   tuning: [midi...],        // open strings, highest string first
//   names: ['G','D','A','E'], // string labels, highest first
//   notes: [{ bar, beat, dur, midi, si, f, dead }],   // beat & dur in beats
//   bars,                     // number of bars
//   tempo,                    // BPM from the file, or null
//   parts, partIndex          // MusicXML only
// }

const NOTE_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export const BASS4 = { tuning: [43, 38, 33, 28], names: ['G', 'D', 'A', 'E'] };
export const BASS5 = { tuning: [43, 38, 33, 28, 23], names: ['G', 'D', 'A', 'E', 'B'] };
const BASS6 = { tuning: [48, 43, 38, 33, 28, 23], names: ['C', 'G', 'D', 'A', 'E', 'B'] };
export const GUITAR = { tuning: [64, 59, 55, 50, 45, 40], names: ['e', 'B', 'G', 'D', 'A', 'E'] };

const pcOf = (name) => {
  const m = /^([A-Ga-g])([#b]?)$/.exec(name || '');
  if (!m) return null;
  return (NOTE_PC[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
};

// ------------------------------------------------------------------ ASCII tab

const TAB_BODY = /^[-0-9xX|hpbrs/\\~()^.<>*=+]+$/;

function matchTabLine(line) {
  const m = /^\s*([A-Ga-g][#b]?)?\s*[:|]?(.*?)\s*$/.exec(line);
  if (!m) return null;
  const body = m[2];
  if (body.length < 6 || !TAB_BODY.test(body)) return null;
  const dashes = (body.match(/-/g) || []).length;
  if (dashes < body.length * 0.4) return null;
  return { name: m[1] || '', body };
}

function splitBlock(block) {
  // Two systems written back-to-back without a blank line: split where the first name repeats.
  if (block.length <= 6) return [block];
  const first = block[0].name;
  if (first) {
    for (let k = 4; k <= 6; k++) {
      if (block.length % k === 0 && block[k]?.name === first) {
        const out = [];
        for (let i = 0; i < block.length; i += k) out.push(block.slice(i, i + k));
        return out;
      }
    }
  }
  return [block.slice(0, 6)];
}

function tuningFor(block) {
  const n = block.length;
  const names = block.map((l) => l.name);
  let base = n === 4 ? BASS4 : n === 5 ? BASS5 : n === 6 ? (names[0] === 'e' || names[1] === 'B' ? GUITAR : BASS6) : null;
  if (!base) return null;
  // Adjust each string to the named pitch (drop D, E♭ tuning, ...), staying near the default.
  const tuning = base.tuning.map((d, i) => {
    const pc = pcOf(names[i]);
    if (pc === null) return d;
    // the pitch with this name closest to the default string (drop D -> 2 below E, etc.)
    for (let m = d - 6; m < d + 6; m++) if (m % 12 === pc) return m;
    return d;
  });
  return { tuning, names: names.map((x, i) => x || base.names[i]) };
}

// ---- what's around the tab: section labels, chord names, repeat marks (typical Ultimate Guitar layout)

const SECTION_WORDS = 'intro|verse|chorus|pre-?chorus|bridge|outro|solo|riff|interlude|breakdown|hook|refrain|coda|ending|main riff|middle 8|instrumental|fill|break|tag|turnaround';
const REPEAT_RE = /(?:^|\s)\(?\s*(?:[xX×]\s*(\d{1,2})|(\d{1,2})\s*[xX×]|repeat\s*(\d{1,2})\s*(?:x|times)?)\s*\)?\s*$/i;
const CHORD_RE = /^([A-G])([#b]?)([a-zA-Z0-9+°øΔ#b()-]*)(?:\/([A-G][#b]?))?$/;

/** Read a repeat mark like "x4", "4x", "(x2)", "repeat 3 times" at the end of a line. */
function trailingRepeat(line) {
  const m = REPEAT_RE.exec(line);
  if (!m) return { rest: line, times: 1 };
  const times = Number(m[1] ?? m[2] ?? m[3]);
  return { rest: line.slice(0, m.index), times: times >= 1 && times <= 16 ? times : 1 };
}

/** "[Verse 1]", "Chorus:", "INTRO", "Solo (x2)" -> { name, times } */
function sectionLabel(line) {
  const t = line.trim();
  let m = /^\[([^\]]{1,40})\]\s*(.*)$/.exec(t);
  if (m && !/^\s*$/.test(m[1]) && !chordToken(m[1].trim())) {
    const r = trailingRepeat(m[1] + ' ' + m[2]);
    if (m[2].trim() && r.times === 1) return null; // "[ch] lyric..." isn't a label
    return { name: r.rest.trim().replace(/\s+/g, ' '), times: r.times };
  }
  m = new RegExp(`^((?:${SECTION_WORDS})(?:\\s*\\d)?(?:\\s*\\([^)]{0,20}\\))?)\\s*:?\\s*(.*)$`, 'i').exec(t);
  if (m) {
    const r = trailingRepeat(m[2] ? ' ' + m[2] : '');
    if (r.rest.trim()) return null; // a sentence that starts with "Verse"
    const name = m[1].replace(/\(\s*(?:x\s*\d+|\d+\s*x)\s*\)/i, '').trim();
    const inner = trailingRepeat(' ' + m[1]);
    const times = Math.max(r.times, inner.times);
    return { name: name.charAt(0).toUpperCase() + name.slice(1).replace(/\s+/g, ' '), times };
  }
  return null;
}

/** Map a chord spelling to one of the app's chord qualities. null if it isn't a chord. */
export function tabChord(sym) {
  const m = CHORD_RE.exec(sym);
  if (!m) return null;
  let q = m[3].replace(/[()]/g, '');
  const known = /^(?:maj|min|m|M|mi|dim|aug|sus|add|no|omit|Δ|ø|°|\+|-|b|#|\d)*$/;
  if (!known.test(q)) return null;
  const pc = (NOTE_PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  let qual;
  if (/^(m7b5|min7b5|ø)/.test(q)) qual = 'm7b5';
  else if (/^(dim|°)/.test(q)) qual = 'dim';
  else if (/^5$/.test(q)) qual = '5';
  else if (/^(maj|M|Δ)(7|9|11|13)/.test(q) || q === 'Δ') qual = 'maj7';
  else if (/^(m|min|mi|-)(?!aj)/.test(q)) {
    const r = q.replace(/^(min|mi|m|-)/, '');
    qual = /^(9|11|13)/.test(r) ? 'm9' : /^7/.test(r) ? 'm7' : /^6/.test(r) ? 'm6' : 'm';
  } else if (/sus/.test(q)) qual = 'sus';
  else if (/^(9|11|13)/.test(q)) qual = '9';
  else if (/^7/.test(q)) qual = '7';
  else if (/^6/.test(q)) qual = '6';
  else qual = ''; // major, add9, aug, maj
  return { pc, q: qual, name: sym };
}

function chordToken(tok) {
  return tabChord(tok);
}

/** A line of chord names (and maybe bar lines / N.C. / repeat marks): [{ col, chord }] or null. */
function chordLine(line) {
  const { rest } = trailingRepeat(line);
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(rest))) {
    const tok = m[0];
    if (/^(\||N\.?C\.?|\/|%|-+|\.+)$/i.test(tok)) continue;
    const c = chordToken(tok.replace(/^\(|\)$/g, ''));
    if (!c) return null;
    out.push({ col: m.index, chord: c });
  }
  return out.length ? out : null;
}

/**
 * Scan text for tab blocks plus what's written around them:
 * [{ lines: [{ name, body, off }], label, chords, times }]
 */
function scanTab(text) {
  const out = [];
  let cur = [];
  let label = null;
  let chords = null;
  let times = 1;
  const close = () => {
    if (!cur.length) return;
    const parts = splitBlock(cur).filter((b) => b.length >= 4 && b.length <= 6);
    parts.forEach((lines, i) => out.push({ lines, label: i === 0 ? label : null, chords: i === 0 ? chords : null, times }));
    label = null;
    chords = null;
    times = 1;
    cur = [];
  };
  for (const raw of text.replace(/\r/g, '').replace(/\t/g, '    ').split('\n')) {
    const rep = trailingRepeat(raw);
    const m = matchTabLine(rep.rest);
    if (m) {
      m.off = rep.rest.replace(/\s+$/, '').length - m.body.length;
      cur.push(m);
      if (rep.times > 1) times = Math.max(times, rep.times);
      continue;
    }
    // a repeat mark on its own line right after a block ("x4", "(repeat 2x)")
    if (cur.length && /^\s*$/.test(rep.rest) && rep.times > 1) {
      times = Math.max(times, rep.times);
      continue;
    }
    close();
    if (!raw.trim()) continue;
    const sec = sectionLabel(raw);
    if (sec) {
      out.push({ section: sec });
      chords = null;
      continue;
    }
    const ch = chordLine(raw);
    chords = ch; // only a chord line directly above the tab counts
  }
  close();
  return out;
}

/** Find tab blocks in plain text. Returns arrays of { name, body } lines, top string first. */
export function findTabBlocks(text) {
  return scanTab(text).filter((b) => b.lines).map((b) => b.lines);
}

/**
 * Parse ASCII tab. Rhythm comes from horizontal spacing between bar lines
 * (quantized to 16ths). Without bar lines, one character = one 16th note.
 * Also reads section labels ([Verse], Chorus:), chord names written above the tab, and repeat marks (x4).
 */
export function parseAsciiTab(text, { beats = 4, title = 'Tab' } = {}) {
  const items = scanTab(text);
  if (!items.some((b) => b.lines)) throw new Error('No tab found. Tab lines look like:  G|-----5---7---|');
  let tun = null;
  const notes = [];
  const chords = []; // { bar, beat, pc, q, name }
  const sections = []; // { name, from, to } 0-based bars, inclusive
  let barNo = 0;
  const q = 4; // quantize to 16ths
  let section = null; // { name, times, from, notesAt, chordsAt }

  const endSection = () => {
    if (!section) return;
    const len = barNo - section.from;
    if (len > 0) {
      const sNotes = notes.slice(section.notesAt);
      const sChords = chords.slice(section.chordsAt);
      sections.push({ name: section.name, from: section.from, to: barNo - 1 });
      for (let r = 1; r < section.times; r++) {
        for (const n of sNotes) notes.push({ ...n, bar: n.bar + len * r });
        for (const c of sChords) chords.push({ ...c, bar: c.bar + len * r });
      }
      if (section.times > 1) {
        sections[sections.length - 1].to = section.from + len * section.times - 1;
        barNo = section.from + len * section.times;
      }
    }
    section = null;
  };

  for (const item of items) {
    if (item.section) {
      endSection();
      section = { ...item.section, from: barNo, notesAt: notes.length, chordsAt: chords.length };
      continue;
    }
    const block = item.lines;
    const t = tuningFor(block);
    if (!tun) tun = t;
    if (t.tuning.length !== tun.tuning.length) continue; // ignore blocks for another instrument
    if (!section && !sections.length && item.label === null && items.some((b) => b.section)) {
      // tab before the first label
      section = { name: 'Start', times: 1, from: barNo, notesAt: notes.length, chordsAt: chords.length };
    }
    const width = Math.max(...block.map((l) => l.body.length));
    const rows = block.map((l) => l.body.padEnd(width, '-'));

    // bar lines: columns where most strings have '|'
    const bars = [];
    for (let c = 0; c < width; c++) {
      const n = rows.filter((r) => r[c] === '|').length;
      if (n >= Math.ceil(rows.length / 2)) bars.push(c);
    }
    const segs = [];
    if (bars.length) {
      let start = 0;
      for (const b of [...bars, width]) {
        if (b - start >= 2) segs.push([start, b]);
        start = b + 1;
      }
    } else {
      const span = beats * q;
      for (let a = 0; a < width; a += span) segs.push([a, Math.min(width, a + span), true]);
    }

    // collect hits per bar segment
    const segHits = segs.map(([a, b]) => {
      const hits = [];
      rows.forEach((row, si) => {
        for (let c = a; c < b; c++) {
          const ch = row[c];
          if (/[0-9]/.test(ch)) {
            let fret = Number(ch);
            const col = c;
            if (c + 1 < b && /[0-9]/.test(row[c + 1]) && Number(ch + row[c + 1]) <= 24) {
              fret = Number(ch + row[c + 1]);
              c++;
            }
            hits.push({ col, si, fret, dead: false });
          } else if (ch === 'x' || ch === 'X') hits.push({ col: c, si, fret: null, dead: true });
        }
      });
      return hits;
    });
    // Most tabs put a padding dash after each bar line ("|-3---3---|"): measure from the first playable column.
    const leads = segs.map(([a], i) => (segHits[i].length ? Math.min(...segHits[i].map((h) => h.col - a)) : 99));
    const pad = Math.min(2, Math.min(...leads));
    const beatAt = (k, col) => {
      const [a, b, fixed] = segs[k];
      const off = fixed ? 0 : pad;
      const w = b - a - off;
      const beat = fixed ? (col - a) / q : ((col - a - off) / w) * beats;
      return Math.max(0, Math.min(beats - 1 / q, Math.round(beat * q) / q));
    };

    const blockStart = barNo;
    const blockNotes = notes.length;
    const barOfSeg = [];
    segs.forEach(([, , fixed], i) => {
      barOfSeg[i] = barNo;
      for (const h of segHits[i]) {
        notes.push({ bar: barNo, beat: beatAt(i, h.col), si: h.si, f: h.dead ? null : h.fret, dead: h.dead, midi: tun.tuning[h.si] + (h.fret ?? 0) });
      }
      if (segHits[i].length || !fixed) barNo++;
    });

    // chord names written above this block: line their columns up with the tab
    const blockChords = chords.length;
    if (item.chords && segs.length) {
      const off = block[0].off ?? 0;
      for (const { col, chord } of item.chords) {
        const c = col - off;
        let k = segs.findIndex(([a, b]) => c < b);
        if (k < 0) k = segs.length - 1;
        // a name written on (or just before) a bar line belongs to the next bar
        if (k + 1 < segs.length && c >= segs[k][1] - 1) k++;
        const beat = c < segs[k][0] ? 0 : Math.round(beatAt(k, Math.max(c, segs[k][0])));
        const bar = Math.min(barOfSeg[k], barNo - 1);
        const prev = chords[chords.length - 1];
        if (prev && prev.bar === bar && prev.beat === beat && chords.length > blockChords) Object.assign(prev, chord);
        else chords.push({ bar, beat: Math.min(beats - 1, beat), ...chord });
      }
    }

    // repeat marks on the block (x4)
    const len = barNo - blockStart;
    if (item.times > 1 && len > 0) {
      const bNotes = notes.slice(blockNotes);
      const bChords = chords.slice(blockChords);
      for (let r = 1; r < item.times; r++) {
        for (const n of bNotes) notes.push({ ...n, bar: n.bar + len * r });
        for (const c of bChords) chords.push({ ...c, bar: c.bar + len * r });
      }
      barNo += len * (item.times - 1);
    }
  }
  endSection();
  if (!notes.length) throw new Error('Tab found, but no fret numbers in it.');
  const piece = finalize({ title, kind: 'tab', beats, beatType: 4, cpb: 4, ...tun, notes, tempo: null });
  piece.bars = Math.max(piece.bars, barNo);
  if (sections.length) piece.sections = sections.filter((s) => s.from < piece.bars);
  if (chords.length) piece.chordsByBar = chordsByBar(chords, piece.bars, beats);
  return piece;
}

/** Spread chords over bars: each bar starts with the chord that is sounding; dur until the next change. */
function chordsByBar(list, bars, beats) {
  list.sort((a, b) => a.bar - b.bar || a.beat - b.beat);
  const out = Array.from({ length: bars }, () => []);
  for (const c of list) if (c.bar < bars) out[c.bar].push({ ...c });
  let last = null;
  out.forEach((row, b) => {
    if (last && (!row.length || row[0].beat > 0)) row.unshift({ ...last, bar: b, beat: 0, held: true });
    row.forEach((c, i) => (c.dur = (row[i + 1]?.beat ?? beats) - c.beat));
    if (row.length) last = row[row.length - 1];
  });
  return out;
}

// ------------------------------------------------------------------ MusicXML

const txt = (el, sel) => el?.querySelector(sel)?.textContent?.trim();
const num = (el, sel, d = 0) => {
  const v = parseFloat(txt(el, sel));
  return Number.isFinite(v) ? v : d;
};

export function musicXmlParts(xmlText, DP = globalThis.DOMParser) {
  const doc = new DP().parseFromString(xmlText, 'application/xml');
  return [...doc.querySelectorAll('part-list score-part')].map((p) => ({ id: p.getAttribute('id'), name: txt(p, 'part-name') || p.getAttribute('id') }));
}

/**
 * octave: semitone shift applied to all notes. Leave undefined for automatic: bass-clef parts
 * without a <transpose> element are assumed to be written bass (sounding an octave lower),
 * which is typical of scanned / OMR scores.
 */
export function parseMusicXML(xmlText, { partIndex = null, title = 'Score', octave } = {}, DP = globalThis.DOMParser) {
  const doc = new DP().parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('This file is not valid MusicXML.');
  const root = doc.documentElement;
  if (root.nodeName === 'score-timewise') throw new Error('Timewise MusicXML is not supported — export as “partwise”.');
  if (root.nodeName !== 'score-partwise') throw new Error('This XML file is not MusicXML.');

  const parts = musicXmlParts(xmlText, DP);
  if (partIndex === null) {
    partIndex = Math.max(0, parts.findIndex((p) => /bass|bajo|basse|contrabass/i.test(p.name)));
  }
  partIndex = Math.min(partIndex, parts.length - 1);
  const partEl = [...root.querySelectorAll(':scope > part')].find((p) => p.getAttribute('id') === parts[partIndex]?.id)
    ?? root.querySelector(':scope > part');
  if (!partEl) throw new Error('No parts found in this MusicXML file.');

  const name = txt(root, 'work > work-title') || txt(root, 'movement-title') || title;
  let divisions = 1;
  let beats = null;
  let beatType = null;
  let curBeats = 4;
  let curBeatType = 4;
  let transpose = 0;
  let tempo = null;
  let tabTuning = null;
  let hasTranspose = false;
  let firstClef = null;
  const raw = []; // { q (absolute quarter position), dq, midi, si, f, dead }
  let measureQ = 0;
  let first = true;

  for (const meas of partEl.querySelectorAll(':scope > measure')) {
    let cursor = 0;
    let maxCursor = 0;
    let lastStart = 0;
    const inMeasure = [];
    for (const el of meas.children) {
      const tag = el.nodeName;
      if (tag === 'attributes') {
        if (el.querySelector('divisions')) divisions = num(el, 'divisions', 1);
        const time = el.querySelector('time');
        if (time && time.querySelector('beats')) {
          curBeats = parseInt(txt(time, 'beats'), 10) || 4;
          curBeatType = parseInt(txt(time, 'beat-type'), 10) || 4;
          if (beats === null) [beats, beatType] = [curBeats, curBeatType];
        }
        firstClef ??= txt(el, 'clef sign') ?? null;
        const tr = el.querySelector('transpose');
        if (tr) hasTranspose = true;
        if (tr) transpose = num(tr, 'chromatic') + 12 * num(tr, 'octave-change');
        const sd = el.querySelector('staff-details');
        if (sd && sd.querySelector('staff-tuning')) {
          const lines = [...sd.querySelectorAll('staff-tuning')].map((st) => ({
            line: parseInt(st.getAttribute('line'), 10),
            midi: (num(st, 'tuning-octave') + 1) * 12 + NOTE_PC[txt(st, 'tuning-step')] + num(st, 'tuning-alter'),
          }));
          lines.sort((a, b) => b.line - a.line); // highest line (highest string) first
          tabTuning = lines.map((l) => l.midi);
        }
      } else if (tag === 'direction' || tag === 'sound') {
        const snd = tag === 'sound' ? el : el.querySelector('sound');
        const t = parseFloat(snd?.getAttribute('tempo'));
        if (tempo === null && Number.isFinite(t)) tempo = Math.round(t);
      } else if (tag === 'backup') {
        cursor -= num(el, 'duration');
      } else if (tag === 'forward') {
        cursor += num(el, 'duration');
        maxCursor = Math.max(maxCursor, cursor);
      } else if (tag === 'note') {
        if (el.querySelector('grace')) continue;
        const dur = num(el, 'duration');
        const isChord = !!el.querySelector('chord');
        const start = isChord ? lastStart : cursor;
        if (!isChord) {
          lastStart = cursor;
          cursor += dur;
          maxCursor = Math.max(maxCursor, cursor);
        }
        const pitch = el.querySelector('pitch');
        if (!pitch || el.querySelector('rest')) continue;
        const midi = (num(pitch, 'octave') + 1) * 12 + NOTE_PC[txt(pitch, 'step')] + num(pitch, 'alter') + transpose;
        const tieStop = [...el.querySelectorAll('tie')].some((t) => t.getAttribute('type') === 'stop');
        const n = {
          start,
          dur,
          midi,
          dead: txt(el, 'notehead') === 'x',
          str: el.querySelector('technical string') ? parseInt(txt(el, 'technical string'), 10) : null,
          fret: el.querySelector('technical fret') ? parseInt(txt(el, 'technical fret'), 10) : null,
          tieStop,
        };
        inMeasure.push(n);
      }
    }
    const fullQ = (curBeats * 4) / curBeatType;
    const lenQ = maxCursor / divisions;
    const pickup = first && meas.getAttribute('implicit') === 'yes' && lenQ > 0 && lenQ < fullQ;
    const offset = pickup ? fullQ - lenQ : 0;
    for (const n of inMeasure) {
      const q = measureQ + offset + n.start / divisions;
      const dq = n.dur / divisions;
      if (n.tieStop) {
        const prev = [...raw].reverse().find((r) => r.midi === n.midi && Math.abs(r.q + r.dq - q) < 1e-6);
        if (prev) {
          prev.dq += dq;
          continue;
        }
      }
      raw.push({ q, dq, midi: n.midi, dead: n.dead, str: n.str, fret: n.fret });
    }
    measureQ += pickup ? fullQ : Math.max(lenQ, fullQ);
    first = false;
  }
  if (!raw.length) throw new Error(`No notes found in part “${parts[partIndex]?.name ?? '?'}”.`);

  beats ??= 4;
  beatType ??= 4;
  const mids = raw.map((r) => r.midi).sort((a, b) => a - b);
  const median = mids[Math.floor(mids.length / 2)];
  const octaveAuto = !hasTranspose && !tabTuning && firstClef === 'F' && median >= 40 && median <= 64 ? -12 : 0;
  const shift = octave ?? octaveAuto;
  for (const r of raw) r.midi += shift;
  const qPerBeat = 4 / beatType;
  const notes = raw.map((r) => {
    const abs = r.q / qPerBeat;
    const bar = Math.floor(abs / beats + 1e-9);
    return { bar, beat: abs - bar * beats, dur: r.dq / qPerBeat, midi: r.midi, dead: r.dead, str: r.str, f: r.fret };
  });

  let tun = null;
  if (tabTuning) {
    tun = { tuning: tabTuning, names: tabTuning.map((m) => ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][m % 12]) };
    for (const n of notes) {
      if (n.str !== null && n.f !== null) n.si = n.str - 1; // MusicXML string 1 = highest
    }
  }
  notes.forEach((n) => delete n.str);
  return finalize({
    title: name, kind: 'xml', beats, beatType, cpb: beatType >= 8 ? 2 : 4, ...(tun ?? {}), notes, tempo, parts, partIndex,
    octave: shift, octaveAuto,
  });
}

// ------------------------------------------------------------------ shared

/** Fill in durations, fingerings and bar count. */
export function finalize(piece, fallback = BASS4) {
  if (!piece.tuning) Object.assign(piece, fallback);
  const { tuning } = piece;
  const notes = piece.notes.sort((a, b) => a.bar - b.bar || a.beat - b.beat || b.midi - a.midi);
  const absOf = (n) => n.bar * piece.beats + n.beat;

  // durations for tab imports: until the next onset, capped
  notes.forEach((n, i) => {
    if (n.dur !== undefined) return;
    if (n.dead) {
      n.dur = 0.25;
      return;
    }
    const next = notes.slice(i + 1).find((m) => absOf(m) > absOf(n) + 1e-6);
    n.dur = Math.min(2, next ? absOf(next) - absOf(n) : 1);
  });

  // fingering: keep the hand near one position
  let anchor = null;
  for (const n of notes) {
    if (n.si !== undefined && n.f !== null && n.f !== undefined) {
      anchor = n.f;
      continue;
    }
    if (n.dead) {
      n.si ??= tuning.length - 2;
      continue;
    }
    let midi = n.midi;
    while (midi < tuning[tuning.length - 1]) midi += 12;
    anchor ??= Math.max(0, Math.min(5, midi - tuning[tuning.length - 1]));
    let best = null;
    tuning.forEach((o, si) => {
      const f = midi - o;
      if (f < 0 || f > 24) return;
      const c = (f === 0 ? 1 : Math.max(0, anchor - 1 - f, f - anchor - 3) * 2) + f * 0.01;
      if (!best || c < best.c) best = { si, f, c };
    });
    if (best) {
      n.si = best.si;
      n.f = best.f;
      if (best.f > 0 && (best.f < anchor - 1 || best.f > anchor + 3)) anchor = Math.max(1, best.f - 1);
    } else {
      n.si = null;
      n.f = null;
    }
  }
  piece.bars = notes.length ? notes[notes.length - 1].bar + 1 : 0;
  piece.low = Math.min(...notes.map((n) => n.midi));
  piece.high = Math.max(...notes.map((n) => n.midi));
  return piece;
}

/** Minimal ZIP reader for compressed MusicXML (.mxl). */
export async function unzip(buffer) {
  const dv = new DataView(buffer);
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a valid .mxl (zip) file.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = new Map();
  const dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true);
    const elen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buffer, p + 46, nlen));
    const lnlen = dv.getUint16(local + 26, true);
    const lelen = dv.getUint16(local + 28, true);
    const data = new Uint8Array(buffer, local + 30 + lnlen + lelen, csize);
    files.set(name, { method, data });
    p += 46 + nlen + elen + clen;
  }
  const read = async (name) => {
    const f = files.get(name);
    if (!f) return null;
    if (f.method === 0) return dec.decode(f.data);
    if (f.method !== 8) throw new Error('Unsupported compression in .mxl file.');
    const stream = new Blob([f.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return dec.decode(await new Response(stream).arrayBuffer());
  };
  return { names: [...files.keys()], read };
}

export async function readMxl(buffer) {
  const zip = await unzip(buffer);
  const container = await zip.read('META-INF/container.xml');
  let path = container && /full-path="([^"]+)"/.exec(container)?.[1];
  path ??= zip.names.find((n) => !n.startsWith('META-INF') && /\.(musicxml|xml)$/i.test(n));
  if (!path) throw new Error('No score found inside the .mxl file.');
  return zip.read(path);
}

// ------------------------------------------------------------------ Guitar Pro 7/8 (.gp)
// A .gp file is a zip with Content/score.gpif (XML). Older .gp5/.gp4/.gpx are binary formats: we explain how
// to convert those instead of half-supporting them.

const GP_VALUES = { Whole: 4, Half: 2, Quarter: 1, Eighth: 0.5, '16th': 0.25, '32nd': 0.125, '64th': 0.0625, '128th': 1 / 32 };
const PC_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Recognise old Guitar Pro files by their header. Returns a friendly error message, or null. */
export function oldGuitarProMessage(bytes) {
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 32));
  const isOld = /FICHIER GUITAR PRO|CLIPBOARD GUITAR PRO/.test(head) || /^BCF[ZS]/.test(head);
  return isOld
    ? 'This is an older Guitar Pro file (.gp5 / .gp4 / .gpx). Open it in MuseScore (free) or TuxGuitar and export it as MusicXML, or save it as .gp from Guitar Pro 7/8 — then import that.'
    : null;
}

export async function readGp(buffer) {
  const zip = await unzip(buffer);
  const gpif = await zip.read('Content/score.gpif');
  if (!gpif) throw new Error('No score found inside the Guitar Pro file.');
  return gpif;
}

export async function isGpZip(buffer) {
  try {
    return (await unzip(buffer)).names.includes('Content/score.gpif');
  } catch {
    return false;
  }
}

/** Guitar Pro 7/8 score XML (score.gpif) -> piece. Same shape as MusicXML pieces (parts, partIndex, sections, chords). */
export function parseGpif(xmlText, { partIndex = null, title = 'Guitar Pro' } = {}, DP = globalThis.DOMParser) {
  const doc = new DP().parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror') || doc.documentElement.nodeName !== 'GPIF') throw new Error('This Guitar Pro file could not be read.');
  const root = doc.documentElement;
  const kids = (el, tag) => (el ? [...el.children].filter((c) => c.nodeName === tag) : []);
  const kid = (el, tag) => kids(el, tag)[0] ?? null;
  const ids = (s) => (s ?? '').trim().split(/\s+/).filter(Boolean).map(Number);
  const byId = (tag) => {
    const m = new Map();
    for (const el of kids(kid(root, tag + 's'), tag)) m.set(el.getAttribute('id'), el);
    return m;
  };
  const prop = (el, name) => [...(el?.querySelectorAll(':scope > Properties > Property') ?? [])].find((p) => p.getAttribute('name') === name);

  const trackEls = kids(kid(root, 'Tracks'), 'Track');
  const isDrums = (t) => /drum|percussion/i.test(txt(t, 'InstrumentSet > Type') ?? '') || /drum/i.test(txt(t, 'InstrumentSet > Name') ?? '');
  const parts = trackEls.map((t, i) => ({ id: String(i), name: txt(t, 'Name') || `Track ${i + 1}`, drums: isDrums(t) }));
  if (!parts.length) throw new Error('No tracks in this Guitar Pro file.');
  if (partIndex === null) {
    const bassIdx = trackEls.findIndex((t, i) => !parts[i].drums && /bass/i.test(`${txt(t, 'Name')} ${txt(t, 'InstrumentSet > Type')} ${txt(t, 'InstrumentSet > Name')}`));
    partIndex = bassIdx >= 0 ? bassIdx : Math.max(0, parts.findIndex((p) => !p.drums));
  }
  partIndex = Math.min(partIndex, parts.length - 1);
  const track = trackEls[partIndex];
  if (parts[partIndex].drums) throw new Error(`“${parts[partIndex].name}” is a drum track — choose a bass or guitar track.`);

  // tuning: GP lists strings low -> high; we use high -> low
  const staff = track.querySelector('Staves > Staff') ?? track;
  const tunProp = prop(staff, 'Tuning') ?? prop(track, 'Tuning');
  const low2high = ids(txt(tunProp, 'Pitches'));
  const capo = Number(txt(prop(staff, 'CapoFret'), 'Fret') ?? 0) || 0;
  const tuning = low2high.length ? [...low2high].reverse() : null;

  // chord names this track defines (beats refer to them by id)
  const chordNames = new Map();
  for (const it of staff.querySelectorAll('Property[name="ChordCollection"] Item, Property[name="DiagramCollection"] Item')) {
    if (it.getAttribute('name')) chordNames.set(it.getAttribute('id'), it.getAttribute('name'));
  }

  const bars = byId('Bar');
  const voices = byId('Voice');
  const beatsM = byId('Beat');
  const notesM = byId('Note');
  const rhythms = byId('Rhythm');

  // master bars, with repeats and alternate endings played out
  const mbs = kids(kid(root, 'MasterBars'), 'MasterBar').map((mb) => {
    const rep = kid(mb, 'Repeat');
    const [num, den] = (txt(mb, 'Time') ?? '4/4').split('/').map(Number);
    const sec = kid(mb, 'Section');
    return {
      bar: ids(txt(mb, 'Bars'))[partIndex],
      num: num || 4,
      den: den || 4,
      start: rep?.getAttribute('start') === 'true',
      end: rep?.getAttribute('end') === 'true',
      count: Number(rep?.getAttribute('count')) || 2,
      alt: kid(mb, 'AlternateEndings') ? ids(txt(mb, 'AlternateEndings')) : null,
      section: sec ? txt(sec, 'Text') || txt(sec, 'Letter') : null,
    };
  });
  const order = [];
  for (let i = 0, repStart = 0, pass = 1, guard = 0; i < mbs.length && guard < 20000; guard++) {
    const mb = mbs[i];
    if (mb.start && repStart !== i) {
      repStart = i;
      pass = 1;
    }
    if (mb.alt && !mb.alt.includes(pass)) {
      i++;
      continue;
    }
    order.push(i);
    if (mb.end && pass < mb.count) {
      pass++;
      i = repStart;
      continue;
    }
    if (mb.end) {
      pass = 1;
      repStart = i + 1;
    }
    i++;
  }

  const beatsPerBar = mbs[0]?.num ?? 4;
  const beatType = mbs[0]?.den ?? 4;
  const qPerBeat = 4 / beatType;
  const raw = [];
  const chordRaw = [];
  const sections = [];
  let measureQ = 0;
  const visited = new Set();
  order.forEach((mi) => {
    const mb = mbs[mi];
    const fullQ = (mb.num * 4) / mb.den;
    if (mb.section && !visited.has(mi)) sections.push({ name: mb.section, q: measureQ }); // not again on a repeat
    visited.add(mi);
    const barEl = bars.get(String(mb.bar));
    const voiceId = ids(txt(barEl, 'Voices')).find((v) => v >= 0);
    let q = 0;
    for (const bid of ids(txt(voices.get(String(voiceId)), 'Beats'))) {
      const beat = beatsM.get(String(bid));
      if (!beat || kid(beat, 'GraceNotes')) continue;
      const rh = rhythms.get(kid(beat, 'Rhythm')?.getAttribute('ref'));
      let dq = GP_VALUES[txt(rh, 'NoteValue')] ?? 1;
      const dots = Number(kid(rh, 'AugmentationDot')?.getAttribute('count') ?? 0);
      dq *= dots === 1 ? 1.5 : dots === 2 ? 1.75 : 1;
      const tup = kid(rh, 'PrimaryTuplet');
      if (tup) dq *= Number(tup.getAttribute('den')) / Number(tup.getAttribute('num')) || 1;
      const at = measureQ + q;
      const chordId = txt(beat, 'Chord');
      if (chordId && chordNames.has(chordId)) chordRaw.push({ q: at, name: chordNames.get(chordId) });
      for (const nid of ids(txt(beat, 'Notes'))) {
        const n = notesM.get(String(nid));
        if (!n) continue;
        const str = Number(txt(prop(n, 'String'), 'String'));
        const fret = Number(txt(prop(n, 'Fret'), 'Fret'));
        const midiProp = Number(txt(prop(n, 'Midi'), 'Number'));
        const dead = !!prop(n, 'Muted');
        let midi = tuning && Number.isFinite(str) && Number.isFinite(fret) ? low2high[str] + fret + capo : midiProp;
        if (!Number.isFinite(midi)) continue;
        const tie = kid(n, 'Tie');
        if (tie?.getAttribute('destination') === 'true') {
          const prev = [...raw].reverse().find((r) => r.midi === midi && Math.abs(r.q + r.dq - at) < 1e-6);
          if (prev) {
            prev.dq += dq;
            continue;
          }
        }
        const si = tuning && Number.isFinite(str) ? low2high.length - 1 - str : undefined;
        raw.push({ q: at, dq, midi, dead, si, f: si === undefined ? undefined : fret + capo });
      }
      q += dq;
    }
    measureQ += fullQ;
  });
  if (!raw.length) throw new Error(`No notes found in track “${parts[partIndex].name}”.`);

  const toBar = (qq) => {
    const abs = qq / qPerBeat;
    const bar = Math.floor(abs / beatsPerBar + 1e-9);
    return { bar, beat: abs - bar * beatsPerBar };
  };
  const notes = raw.map((r) => ({ ...toBar(r.q), dur: r.dq / qPerBeat, midi: r.midi, dead: r.dead, ...(r.si !== undefined ? { si: r.si, f: r.dead ? null : r.f } : {}) }));
  const tempoAuto = [...root.querySelectorAll('MasterTrack Automations Automation')].find((a) => txt(a, 'Type') === 'Tempo');
  const tempo = tempoAuto ? Math.round(parseFloat(txt(tempoAuto, 'Value'))) || null : null;
  const tun = tuning ? { tuning, names: tuning.map((m) => PC_NAMES[m % 12]) } : {};
  const piece = finalize({
    title: txt(root, 'Score > Title') || title, kind: 'xml', beats: beatsPerBar, beatType, cpb: beatType >= 8 ? 2 : 4,
    ...tun, notes, tempo, parts: parts.map(({ id, name }) => ({ id, name })), partIndex,
  });
  const totalBars = Math.round(measureQ / qPerBeat / beatsPerBar);
  piece.bars = Math.max(piece.bars, totalBars);
  if (sections.length) {
    piece.sections = sections.map((s, i) => {
      const from = toBar(s.q).bar;
      const to = (i + 1 < sections.length ? toBar(sections[i + 1].q).bar : piece.bars) - 1;
      return { name: s.name, from, to: Math.max(from, to) };
    });
  }
  const chords = chordRaw.map((c) => ({ ...toBar(c.q), ...tabChord(c.name) })).filter((c) => c.pc !== undefined);
  if (chords.length) piece.chordsByBar = chordsByBar(chords, piece.bars, beatsPerBar);
  return piece;
}
