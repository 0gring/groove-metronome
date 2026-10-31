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
const GUITAR = { tuning: [64, 59, 55, 50, 45, 40], names: ['e', 'B', 'G', 'D', 'A', 'E'] };

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

/** Find tab blocks in plain text. Returns arrays of { name, body } lines, top string first. */
export function findTabBlocks(text) {
  const blocks = [];
  let cur = [];
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const m = matchTabLine(line);
    if (m) cur.push(m);
    else if (cur.length) {
      blocks.push(cur);
      cur = [];
    }
  }
  if (cur.length) blocks.push(cur);
  return blocks.flatMap(splitBlock).filter((b) => b.length >= 4 && b.length <= 6);
}

/**
 * Parse ASCII tab. Rhythm comes from horizontal spacing between bar lines
 * (quantized to 16ths). Without bar lines, one character = one 16th note.
 */
export function parseAsciiTab(text, { beats = 4, title = 'Tab' } = {}) {
  const blocks = findTabBlocks(text);
  if (!blocks.length) throw new Error('No tab found. Tab lines look like:  G|-----5---7---|');
  let tun = null;
  const notes = [];
  let barNo = 0;
  const q = 4; // quantize to 16ths

  for (const block of blocks) {
    const t = tuningFor(block);
    if (!tun) tun = t;
    if (t.tuning.length !== tun.tuning.length) continue; // ignore blocks for another instrument
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

    segs.forEach(([a, b, fixed], i) => {
      const off = fixed ? 0 : pad;
      const w = b - a - off;
      for (const h of segHits[i]) {
        let beat = fixed ? (h.col - a) / q : ((h.col - a - off) / w) * beats;
        beat = Math.max(0, Math.min(beats - 1 / q, Math.round(beat * q) / q));
        notes.push({ bar: barNo, beat, si: h.si, f: h.dead ? null : h.fret, dead: h.dead, midi: tun.tuning[h.si] + (h.fret ?? 0) });
      }
      if (segHits[i].length || !fixed) barNo++;
    });
  }
  if (!notes.length) throw new Error('Tab found, but no fret numbers in it.');
  return finalize({ title, kind: 'tab', beats, beatType: 4, cpb: 4, ...tun, notes, tempo: null });
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

export function parseMusicXML(xmlText, { partIndex = null, title = 'Score' } = {}, DP = globalThis.DOMParser) {
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
        const tr = el.querySelector('transpose');
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
