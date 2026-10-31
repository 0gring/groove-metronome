// Music-theory helpers and pattern parsers. Pure functions (no DOM / audio),
// so they can be unit-tested in Node.

export const QUALITIES = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '5': [0, 7, 12],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  m7b5: [0, 3, 6, 10],
  dim: [0, 3, 6],
  sus: [0, 5, 7],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  '9': [0, 4, 7, 10, 14],
  m9: [0, 3, 7, 10, 14],
};

const DEGREES = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 8: 12, 9: 14, 10: 16, 11: 17, 12: 19, 13: 21 };

export const mod = (n, m) => ((n % m) + m) % m;

/** Chord-relative tones for the letter tokens R (root), T (third), F (fifth), S (seventh). */
export function chordTones(quality) {
  const iv = QUALITIES[quality] ?? QUALITIES[''];
  const minor = iv[1] === 3 || quality === '5';
  return {
    R: 0,
    T: quality === 'sus' ? 5 : minor ? 3 : 4,
    F: iv.includes(6) && !iv.includes(7) ? 6 : 7,
    S: iv.length >= 4 && iv[3] >= 9 && iv[3] <= 11 ? iv[3] : minor ? 10 : 11,
  };
}

/**
 * Parse a note token.
 *   R T F S      chord root / third / fifth / seventh (adapts to chord quality)
 *   1 b3 #4 5 8  fixed scale degrees relative to the chord root
 *   ^ / _        prefix: octave up / down (e.g. ^T, _5)
 *   x            dead (muted, percussive) note
 *   A            approach note: a half step below the next bar's root (resolved by the player)
 */
export function parseNoteToken(tok) {
  if (tok === 'x') return { dead: true, semi: 0 };
  if (tok === 'A') return { approach: true, semi: 0 }; // chromatic approach into the next bar's root
  let oct = 0;
  while (tok[0] === '^' || tok[0] === '_') {
    oct += tok[0] === '^' ? 12 : -12;
    tok = tok.slice(1);
  }
  if (tok.length === 1 && 'RTFS'.includes(tok)) return { ct: tok, oct };
  const m = /^([b#]?)(\d+)$/.exec(tok);
  if (!m || DEGREES[m[2]] === undefined) throw new Error(`Bad note token "${tok}"`);
  let s = DEGREES[m[2]];
  if (m[1] === 'b') s -= 1;
  if (m[1] === '#') s += 1;
  return { semi: s + oct };
}

/** Semitone offset from chord root for a parsed note. */
export function resolveNote(note, quality) {
  if (note.ct) return chordTones(quality)[note.ct] + note.oct;
  return note.semi;
}

function tokenize(str) {
  return str.trim().split(/\s+/).filter((t) => t && t !== '|');
}

/** Parse a melodic line (bass / melody): space separated tokens, '.' rest, '-' tie. */
export function parseLine(str) {
  const tokens = tokenize(str);
  const events = tokens.map(() => null);
  tokens.forEach((tok, i) => {
    if (tok === '.' || tok === '-') return;
    let len = 1;
    while (tokens[i + len] === '-') len++;
    events[i] = { tok, note: parseNoteToken(tok), len };
  });
  return { tokens, events, length: tokens.length };
}

const COMP_VEL = { X: 1, x: 0.75, o: 0.5 };

/** Parse a chord-comping rhythm line: X/x/o hits, '-' tie, '.' rest. */
export function parseComp(str) {
  const tokens = tokenize(str);
  const events = tokens.map(() => null);
  tokens.forEach((tok, i) => {
    if (tok === '.' || tok === '-') return;
    if (!(tok in COMP_VEL)) throw new Error(`Bad comp token "${tok}"`);
    let len = 1;
    while (tokens[i + len] === '-') len++;
    events[i] = { tok, v: COMP_VEL[tok], len };
  });
  return { tokens, events, length: tokens.length };
}

export const DRUM_HITS = {
  '.': null,
  g: { v: 0.28, n: 1 }, // ghost
  o: { v: 0.5, n: 1 }, // soft
  x: { v: 0.78, n: 1 }, // normal
  X: { v: 1, n: 1 }, // accent
  r: { v: 0.7, n: 2 }, // ratchet: 2 hits in one step
  t: { v: 0.6, n: 3 }, // triplet ratchet: 3 hits in one step
};

export function cleanDrum(str) {
  return str.replace(/[\s|]/g, '');
}

export function parseDrum(str) {
  return [...cleanDrum(str)].map((c) => {
    if (!(c in DRUM_HITS)) throw new Error(`Bad drum char "${c}"`);
    return DRUM_HITS[c];
  });
}

/** "5:m7" -> { root: 5, q: 'm7' } */
export function parseProg(list) {
  return list.map((s) => {
    const [r, q = ''] = s.split(':');
    if (!(q in QUALITIES)) throw new Error(`Unknown chord quality "${q}"`);
    return { root: parseInt(r, 10), q };
  });
}

// Pitch pool for generated melodies, ordered low -> high.
const MEL_POOL = ['_F', '_S', 'R', '2', 'T', 'F', '6', 'S', '8', '9', '^T', '^F'];

/**
 * Generate a rhythmic melody (a motif that repeats every 1–2 bars and follows
 * the chord changes). Returns a token string.
 */
export function generateMelody({ beats, sub, melDensity }, rng = Math.random) {
  const spb = beats * sub;
  const len = spb <= 8 ? spb * 2 : spb;
  const density = melDensity ?? (sub === 3 ? 0.4 : 0.34);
  const on = [];
  for (let i = 0; i < len; i++) {
    const p = i % sub;
    let w = p === 0 ? 1 : (sub % 2 === 0 && p === sub / 2) || (sub === 3 && p === 2) ? 0.75 : 0.45;
    if (i % spb === 0) w *= 1.3;
    if (rng() < Math.min(0.95, density * w * 1.5)) on.push(i);
  }
  for (let b = 0; on.length < 3 && b < len; b += sub) if (!on.includes(b)) on.push(b);
  on.sort((a, b) => a - b);

  const tokens = Array(len).fill('.');
  let idx = 2 + Math.floor(rng() * 4); // start between R and 6
  on.forEach((pos, n) => {
    const next = on[n + 1] ?? len;
    const gap = next - pos;
    const noteLen = rng() < 0.5 ? gap : Math.min(gap, rng() < 0.5 ? 1 : 2);
    if (n > 0) {
      const moves = [-2, -1, -1, 0, 1, 1, 2];
      idx = Math.max(1, Math.min(MEL_POOL.length - 2, idx + moves[Math.floor(rng() * moves.length)]));
    }
    if (n === on.length - 1) {
      // resolve to a stable tone
      const stable = [2, 5, 8].reduce((a, b) => (Math.abs(b - idx) < Math.abs(a - idx) ? b : a));
      idx = stable;
    }
    tokens[pos] = MEL_POOL[idx];
    for (let k = 1; k < noteLen; k++) tokens[pos + k] = '-';
  });
  return tokens.join(' ');
}

/** Refine a drum pattern's grid k times: each step becomes the hit followed by k-1 rests. */
export function expandDrum(str, k) {
  if (k === 1) return cleanDrum(str);
  return [...cleanDrum(str)].map((c) => c + '.'.repeat(k - 1)).join('');
}

/** Refine a token line's grid k times: notes are held (tied) across the new steps, rests stay rests. */
export function expandLine(str, k) {
  if (k === 1) return str;
  return tokenize(str)
    .map((t) => [t, ...Array(k - 1).fill(t === '.' ? '.' : '-')].join(' '))
    .join(' ');
}

export function lcm(a, b) {
  const gcd = (x, y) => (y ? gcd(y, x % y) : x);
  return (a * b) / gcd(a, b);
}

/**
 * Positions (in grid steps, within one beat) for a note value.
 * div: 1 = quarter notes, 2 = eighths, 4 = sixteenths, 0 = style default (null).
 * On a triplet grid (sub 3) eighths are swung (steps 0 and 2) and sixteenths become triplets.
 * When the groove's grid is too coarse (e.g. 16ths on an eighth-note grid) every step is used.
 */
export function beatPositions(sub, div) {
  if (!div) return null;
  if (div === 1 || sub === 1) return [0];
  if (sub % div === 0) return Array.from({ length: div }, (_, k) => (k * sub) / div);
  if (sub === 3) return div === 2 ? [0, 2] : [0, 1, 2];
  return Array.from({ length: sub }, (_, k) => k);
}

/**
 * Generate a bass line in a given style. Returns a token string covering 1 bar
 * (2 bars for short bars).
 *   roots  - root on every note
 *   r58    - root, fifth, octave, fifth
 *   kick   - rhythm locked to the kick drum
 *   walk   - walking line with a chromatic approach into the next chord
 *   random - kick-based groove with extra syncopations, octaves and dead notes
 * div sets the note values (see beatPositions); 0 keeps each style's default rhythm.
 */
export function generateBass({ beats, sub, kick }, style, rng = Math.random, div = 0) {
  const spb = beats * sub;
  const len = spb <= 8 ? spb * 2 : spb;
  const t = Array(len).fill('.');
  const put = (pos, tok, l) => {
    t[pos] = tok;
    for (let k = 1; k < l && pos + k < len; k++) t[pos + k] = '-';
  };
  const nBeats = len / sub;
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const P = beatPositions(sub, div);
  const onGrid = (i) => !P || P.includes(i % sub);
  // an octave above (walking "skip"); approach / dead notes stay as they are
  const up = (tok) => (tok === 'A' || tok === 'x' || tok.startsWith('^') ? tok : tok === '8' ? 'R' : `^${tok}`);

  if (style === 'roots' || style === 'r58' || style === 'walk') {
    const per = P ?? [0];
    const n = per.length;
    const seq = ['R', 'F', '8', 'F'];
    const mids = [['T', 'F'], ['2', 'T'], ['8', 'F'], ['F', '6'], ['T', '2'], ['S', 'F']];
    for (let bar = 0; bar < len / spb; bar++) {
      const m = pick(mids);
      for (let b = 0; b < beats; b++) {
        const lastBeat = b === beats - 1 && beats > 1;
        let beatTok = 'R';
        if (style === 'walk' && b > 0) beatTok = lastBeat && n === 1 ? 'A' : m[(b - 1) % 2];
        per.forEach((p, k) => {
          let tok;
          if (style === 'roots') tok = 'R';
          else if (style === 'r58') tok = seq[(b * n + k) % 4];
          else if (k === 0) tok = beatTok;
          else if (n === 2) tok = lastBeat ? 'A' : up(beatTok);
          else if (k === n - 1) tok = lastBeat ? 'A' : n === 3 ? up(beatTok) : 'x';
          else tok = k === 2 ? up(beatTok) : 'x';
          const next = k + 1 < n ? per[k + 1] : sub;
          put(bar * spb + b * sub + p, tok, tok === 'x' ? 1 : next - p);
        });
      }
    }
  } else {
    const on = new Set([0]);
    for (let i = 0; i < len; i++) if (kick && kick[i % kick.length] !== '.' && onGrid(i)) on.add(i);
    if (on.size === 1) for (let b = 0; b < nBeats; b++) on.add(b * sub);
    if (style === 'random') {
      for (const i of [...on]) if (i !== 0 && rng() < 0.2) on.delete(i);
      for (let i = 1; i < len; i++) if (onGrid(i) && !on.has(i) && rng() < (i % sub === 0 ? 0.25 : 0.14)) on.add(i);
    }
    const ons = [...on].sort((a, b) => a - b);
    const cycle = ['R', 'R', '8', 'F'];
    const pool = ['R', 'R', '8', 'F', 'S', 'T', '_S', '_F'];
    ons.forEach((pos, n) => {
      const gap = (ons[n + 1] ?? len) - pos;
      const last = n === ons.length - 1 && pos >= len - sub;
      let tok;
      let l;
      if (style === 'random') {
        tok = n === 0 ? 'R' : last && rng() < 0.6 ? 'A' : sub === 4 && rng() < 0.12 ? 'x' : pick(pool);
        l = tok === 'x' ? 1 : rng() < 0.5 ? gap : Math.min(gap, 1 + Math.floor(rng() * 2));
      } else {
        tok = n === 0 ? 'R' : last ? 'A' : cycle[n % cycle.length];
        l = Math.min(gap, sub * 2);
      }
      put(pos, tok, l);
    });
  }
  return t.join(' ');
}
