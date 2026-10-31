import { AudioEngine, SOUNDS } from './audio.js';
import { GROOVES, DRUM_ORDER, DRUM_LABELS, PROGRESSIONS } from './grooves.js';
import {
  QUALITIES, parseDrum, parseLine, parseComp, parseProg, generateMelody, generateBass, resolveNote, cleanDrum, mod, lcm,
} from './theory.js';
import { Tuner } from './tuner.js';

const $ = (id) => document.getElementById(id);
const audio = new AudioEngine();

const KEYS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const LAYERS = [
  { id: 'click', label: 'Click' },
  { id: 'drums', label: 'Drums' },
  { id: 'bass', label: 'Bass' },
  { id: 'chords', label: 'Chords' },
  { id: 'melody', label: 'Melody' },
];
const HIT_NAMES = { '.': 'off', x: 'hit', X: 'accent', g: 'ghost', o: 'soft', r: 'roll', t: 'triplet roll' };
const CYCLE = { '.': 'x', x: 'X', X: 'g', g: '.' };
const DRUM_SETS = { full: null, ks: ['kick', 'snare', 'rim', 'clap'], k: ['kick'] };
const STRINGS = { 4: { open: [43, 38, 33, 28], names: ['G', 'D', 'A', 'E'] }, 5: { open: [43, 38, 33, 28, 23], names: ['G', 'D', 'A', 'E', 'B'] } };
const IV_NAMES = ['R', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7'];
const SCALE = {
  ionian: ['Major scale', [0, 2, 4, 5, 7, 9, 11]],
  aeolian: ['Natural minor', [0, 2, 3, 5, 7, 8, 10]],
  dorian: ['Dorian', [0, 2, 3, 5, 7, 9, 10]],
  mixo: ['Mixolydian', [0, 2, 4, 5, 7, 9, 10]],
  locrian: ['Locrian', [0, 1, 3, 5, 6, 8, 10]],
  dim: ['Diminished (W-H)', [0, 2, 3, 5, 6, 8, 9, 11]],
};
const SCALE_FOR = { '': 'ionian', maj7: 'ionian', 6: 'ionian', m: 'aeolian', m7: 'dorian', m9: 'dorian', m6: 'dorian', 7: 'mixo', 9: 'mixo', sus: 'mixo', 5: 'aeolian', m7b5: 'locrian', dim: 'dim' };
const FRETS = 12;
const SPEEDS = [50, 60, 70, 85, 100];
const COUNTS = { 1: [''], 2: ['', '&'], 3: ['', '&', 'a'], 4: ['', 'e', '&', 'a'] };

// ------------------------------------------------------------------ state

const STORE = 'groove-metronome:v1';
const DEFAULTS = {
  grooveId: 'funk',
  bpm: null,
  key: 9,
  countIn: true,
  swing: null,
  humanize: 0,
  layers: {
    click: { on: true, vol: 0.5 },
    drums: { on: true, vol: 0.9 },
    bass: { on: true, vol: 0.8 },
    chords: { on: true, vol: 0.55 },
    melody: { on: true, vol: 0.6 },
  },
  sounds: { bass: 'auto', chords: 'auto', melody: 'auto' },
  basicBeats: 4,
  basicSub: 1,
  subClicks: true,
  gap: { on: false, play: 2, mute: 2 },
  trainer: { on: false, inc: 2, every: 4, target: 140 },
  flash: false,
  vibrate: false,
  wake: true,
  bassMode: 'play',
  drumMode: 'full',
  bassStyle: 'orig',
  prog: 'default',
  strings: 4,
  fbMode: 'chord',
  fbLabels: 'iv',
  speed: 100,
  speedAuto: { on: false, bars: 8 },
};

function merge(base, over) {
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over || {})) out[k] = k in base ? merge(base[k], over[k]) : over[k];
  return out;
}

function load() {
  try {
    return merge(DEFAULTS, JSON.parse(localStorage.getItem(STORE)) || {});
  } catch {
    return structuredClone(DEFAULTS);
  }
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(state));
    } catch {
      /* storage unavailable – settings just won't persist */
    }
  }, 300);
}

const state = load();
const grooveDef = (id) => GROOVES.find((g) => g.id === id) ?? GROOVES.find((g) => g.id === 'funk');

// ------------------------------------------------------------------ groove model

function buildGroove(def) {
  const g = {
    def,
    basic: !!def.basic,
    beats: def.basic ? state.basicBeats : def.beats,
    sub: def.basic ? state.basicSub : def.sub,
    accentBeats: def.accentBeats ?? [0],
    drumStr: {},
    drums: {},
    sounds: { bass: def.bassSound ?? 'electric', chords: def.chordSound ?? 'epiano', melody: def.melodySound ?? 'square' },
  };
  g.spb = g.beats * g.sub;
  for (const [k, s] of Object.entries(def.drums)) {
    g.drumStr[k] = cleanDrum(s);
    g.drums[k] = parseDrum(s);
  }
  g.bass = makeBass(g);
  g.comp = def.chords ? parseComp(def.chords) : null;
  g.melody = def.melody ? parseLine(def.melody) : g.basic ? null : parseLine(generateMelody(g));
  g.prog = makeProg(def);
  return g;
}

function makeBass(g) {
  if (state.bassStyle === 'orig') return g.def.bass ? parseLine(g.def.bass) : null;
  return parseLine(generateBass({ beats: g.beats, sub: g.sub, kick: g.drumStr.kick }, state.bassStyle));
}

function makeProg(def) {
  const p = PROGRESSIONS.find((x) => x.id === state.prog);
  return parseProg(p?.chords ?? def.prog);
}

// Bass note pitches. Range E1 (28) .. D#2 (39) for roots.
function bassRootMidi(chord) {
  const r = 24 + mod(state.key + chord.root, 12);
  return r < 28 ? r + 12 : r;
}

function bassNoteMidi(note, bar) {
  const prog = cur.prog;
  const chord = prog[mod(bar, prog.length)];
  if (note.approach) {
    const target = bassRootMidi(prog[mod(bar + 1, prog.length)]);
    return target - 1 >= 28 ? target - 1 : target + 1;
  }
  return bassRootMidi(chord) + resolveNote(note, chord.q);
}

let cur = buildGroove(grooveDef(state.grooveId));
const swingVal = () => (cur.sub === 2 || cur.sub === 4 ? state.swing ?? cur.def.swing ?? 50 : 50);
const soundFor = (layer) => (state.sounds[layer] === 'auto' ? cur.sounds[layer] : state.sounds[layer]);

// ------------------------------------------------------------------ scheduler

const sched = { playing: false, bar: 0, s: 0, nextTime: 0 };
let pendingRebuild = false;
let gridGen = 0;
const visQ = [];

const timer = new Worker(
  URL.createObjectURL(
    new Blob(
      ["let id=null;onmessage=e=>{clearInterval(id);id=null;if(e.data==='start')id=setInterval(()=>postMessage(0),25)}"],
      { type: 'text/javascript' },
    ),
  ),
);
timer.onmessage = tick;

const playBpm = () => (state.bpm * state.speed) / 100;
const stepDur = () => 60 / playBpm() / cur.sub;

function tick() {
  if (!sched.playing) return;
  // Schedule further ahead when the page is hidden: background timers are throttled.
  const limit = audio.now + (document.hidden ? 1.5 : 0.12);
  while (sched.nextTime < limit) {
    scheduleStep(sched.bar, sched.s, sched.nextTime);
    sched.nextTime += stepDur();
    if (++sched.s >= cur.spb) {
      sched.s = 0;
      sched.bar++;
    }
  }
}

function scheduleStep(bar, s, t) {
  if (s === 0 && pendingRebuild) {
    pendingRebuild = false;
    cur = buildGroove(grooveDef(state.grooveId));
    renderGroove();
  }
  const g = cur;
  const tr = state.trainer;
  if (s === 0 && bar > 0 && tr.on && bar % tr.every === 0 && state.bpm < tr.target) {
    setBpm(Math.min(tr.target, state.bpm + tr.inc));
  }
  const sa = state.speedAuto;
  if (s === 0 && bar > 0 && sa.on && state.speed < 100 && bar % sa.bars === 0) {
    setSpeed(SPEEDS.find((v) => v > state.speed) ?? 100);
  }

  const sd = stepDur();
  let tt = t;
  if (s % 2 === 1) tt += ((swingVal() - 50) / 50) * sd;
  const beat = Math.floor(s / g.sub);
  const onBeat = s % g.sub === 0;
  const ev = { t: tt, bar, s, beat, onBeat, gen: gridGen, countIn: bar < 0, muted: false };

  if (bar < 0) {
    if (onBeat) audio.click(tt, beat === 0 ? 'accent' : 'beat');
    visQ.push(ev);
    return;
  }

  const cycle = state.gap.play + state.gap.mute;
  ev.muted = state.gap.on && bar % cycle >= state.gap.play;
  const abs = bar * g.spb + s;
  ev.col = abs % g.displayLen;
  ev.chordIdx = bar % g.prog.length;
  ev.yourTurn = state.bassMode === 'mute' || (state.bassMode === 'call' && bar % 2 === 1);
  if (g.bass) {
    ev.bassPos = abs % g.bass.length;
    const barsPerPat = g.bass.length / g.spb;
    ev.bassStart = bar - (bar % barsPerPat);
  }
  visQ.push(ev);
  if (ev.muted) return;

  const L = state.layers;
  const hum = state.humanize / 100;
  const at = (x) => (hum ? Math.max(audio.now, x + (Math.random() * 2 - 1) * hum * 0.015) : x);
  const vj = (v) => (hum ? Math.max(0.05, v * (1 - Math.random() * hum * 0.3)) : v);

  if (L.click.on) {
    if (onBeat) audio.click(tt, beat === 0 ? 'accent' : g.accentBeats.includes(beat) ? 'group' : 'beat');
    else if (g.basic && state.subClicks) audio.click(tt, 'sub');
  }

  if (L.drums.on) {
    const only = DRUM_SETS[state.drumMode];
    for (const [name, arr] of Object.entries(g.drums)) {
      if (only && !only.includes(name)) continue;
      const h = arr[abs % arr.length];
      if (!h) continue;
      if (h.n === 1) audio.drum(name, at(tt), vj(h.v));
      else for (let k = 0; k < h.n; k++) audio.drum(name, tt + (k * sd) / h.n, h.v * (k ? 0.75 : 1));
    }
  }

  const chord = g.prog[bar % g.prog.length];
  const pc = mod(state.key + chord.root, 12);

  if (L.bass.on && g.bass && !ev.yourTurn) {
    const e = g.bass.events[abs % g.bass.length];
    if (e) audio.bass(at(tt), bassNoteMidi(e.note, bar), e.len * sd * 0.92, vj(0.85), soundFor('bass'), e.note.dead);
  }

  if (L.chords.on && g.comp) {
    const e = g.comp.events[abs % g.comp.length];
    if (e) {
      let base = 48 + pc;
      if (base < 52) base += 12;
      const notes = (QUALITIES[chord.q] ?? QUALITIES['']).map((i) => base + i);
      audio.chord(at(tt), notes, e.len * sd * 0.9, vj(e.v), soundFor('chords'));
    }
  }

  if (L.melody.on && g.melody) {
    const e = g.melody.events[abs % g.melody.length];
    if (e && !e.note.dead) {
      let base = 60 + pc;
      if (base > 66) base -= 12;
      audio.melody(at(tt), base + resolveNote(e.note, chord.q), e.len * sd * 0.9, vj(0.8), soundFor('melody'));
    }
  }
}

async function start() {
  audio.init();
  applyMix();
  const resumed = audio.resume();
  await resumed;
  visQ.length = 0;
  sched.bar = state.countIn ? -1 : 0;
  sched.s = 0;
  sched.nextTime = audio.now + 0.08;
  sched.playing = true;
  timer.postMessage('start');
  tick();
  updatePlayUI();
  requestWake();
  setStatus(state.countIn ? 'Count-in…' : 'Playing');
}

function stop() {
  sched.playing = false;
  timer.postMessage('stop');
  visQ.length = 0;
  highlightCol(-1);
  showBeat(-1);
  highlightTab(-1);
  showChordNow(0);
  updatePlayUI();
  releaseWake();
  setStatus('');
}

const toggle = () => (sched.playing ? stop() : start());

// ------------------------------------------------------------------ visuals

let nowCells = [];
let colCells = [];
let lastStatusKey = '';

function frame() {
  requestAnimationFrame(frame);
  if (!sched.playing || !audio.ctx) return;
  const now = audio.now - audio.latency;
  let last = null;
  while (visQ.length && visQ[0].t <= now) {
    last = visQ.shift();
    if (last.onBeat) beatFx(last);
  }
  if (!last) return;
  highlightCol(last.gen === gridGen && !last.countIn ? last.col : -1);
  if (!last.countIn) {
    highlightChord(last.chordIdx);
    showChordNow(last.bar);
    if (cur.bass && last.bassPos !== undefined && last.gen === gridGen) {
      if (last.bassStart !== tabStart || tabGen !== gridGen) renderTab(last.bassStart);
      highlightTab(last.bassPos);
    }
  }

  let key;
  let msg;
  if (last.countIn) [key, msg] = ['count', 'Count-in…'];
  else if (last.muted) [key, msg] = ['gap', 'Silent bars — keep the time!'];
  else if (state.bassMode === 'call') [key, msg] = last.yourTurn ? ['you', 'Your turn — play it back'] : ['app', 'Listen…'];
  else if (state.trainer.on) [key, msg] = [`tr${state.bpm}`, `Tempo trainer: ${state.bpm} → ${state.trainer.target} BPM`];
  else [key, msg] = ['play', 'Playing'];
  if (key !== lastStatusKey) {
    lastStatusKey = key;
    setStatus(msg);
  }
}
requestAnimationFrame(frame);

function beatFx(ev) {
  showBeat(ev.beat);
  if (ev.muted) return;
  const accent = ev.beat === 0;
  if (state.flash) {
    const f = $('flash');
    f.classList.remove('on', 'accent');
    void f.offsetWidth;
    f.classList.add('on');
    if (accent) f.classList.add('accent');
  }
  if (state.vibrate && navigator.vibrate) navigator.vibrate(accent ? 40 : 18);
}

function showBeat(i) {
  [...$('beats').children].forEach((d, k) => d.classList.toggle('on', k === i));
}

function highlightCol(c) {
  nowCells.forEach((el) => el.classList.remove('now'));
  nowCells = c >= 0 && colCells[c] ? colCells[c] : [];
  nowCells.forEach((el) => el.classList.add('now'));
}

function highlightChord(i) {
  [...$('chordLine').querySelectorAll('span')].forEach((el, k) => el.classList.toggle('cur', k === i));
}

function setStatus(msg) {
  if (!msg) lastStatusKey = '';
  $('status').textContent = msg;
}

function updatePlayUI() {
  const b = $('playBtn');
  b.setAttribute('aria-pressed', String(sched.playing));
  b.querySelector('.play-label').textContent = sched.playing ? 'Stop' : 'Play';
}

// ------------------------------------------------------------------ rendering

const QUALITY_NAMES = { '': '', m: 'm', 5: '5', 7: '7', m7: 'm7', maj7: 'maj7', m7b5: 'm7♭5', dim: '°', sus: 'sus4', 6: '6', m6: 'm6', 9: '9', m9: 'm9' };
const chordName = (c) => KEYS[mod(state.key + c.root, 12)] + QUALITY_NAMES[c.q];
const tokLabel = (tok) => (tok === 'A' ? '→' : tok).replace('b', '♭').replace('#', '♯').replace('^', '↑').replace('_', '↓');

function renderGroove() {
  const g = cur;
  $('grooveSelect').value = g.def.id;
  $('grooveDesc').textContent = g.def.desc;
  $('basicControls').hidden = !g.basic;
  $('bpmUnit').textContent = g.def.beatUnit ? `BPM (${g.def.beatUnit})` : 'BPM';

  const beats = $('beats');
  beats.innerHTML = '';
  for (let i = 0; i < g.beats; i++) {
    const d = document.createElement('span');
    d.className = 'beat' + (i === 0 ? ' accent' : g.accentBeats.includes(i) ? ' group' : '');
    beats.append(d);
  }

  const swingOk = g.sub === 2 || g.sub === 4;
  $('swing').disabled = !swingOk;
  $('swing').value = swingVal();
  $('swingOut').textContent = swingOk ? `${swingVal()}%` : 'n/a';
  $('origMelody').disabled = !g.def.melody;

  renderGrid();
  renderChordLine();
  renderMixerDefaults();
  renderBassPanel();
}

// ------------------------------------------------------------------ bass panel

let tabCols = [];
let tabStart = -1;
let tabGen = -1;
let lastChordBar = null;

function renderBassPanel() {
  $('bassStyle').value = state.bassStyle;
  $('bassStyle').options[0].disabled = !cur.def.bass;
  lastChordBar = null;
  showChordNow(0);
  renderTab(0);
}

function showChordNow(bar) {
  if (bar === lastChordBar) return;
  lastChordBar = bar;
  const p = cur.prog;
  $('chordNow').textContent = chordName(p[mod(bar, p.length)]);
  $('chordNext').textContent = p.length > 1 ? chordName(p[mod(bar + 1, p.length)]) : '—';
  renderFretboard(p[mod(bar, p.length)]);
}

// ------------------------------------------------------------------ fretboard

let fbCells = {};
let litFret = null;

function renderFretboard(chord) {
  const fb = $('fretboard');
  const { open, names } = STRINGS[state.strings];
  const rootPc = mod(state.key + chord.root, 12);
  const chordIv = QUALITIES[chord.q] ?? QUALITIES[''];
  const tones = new Set(chordIv.map((i) => mod(i, 12)));
  const minorish = chordIv[1] === 3 || chord.q === '5';
  const [scaleName, scale] = SCALE[SCALE_FOR[chord.q] ?? 'ionian'];
  const pent = minorish ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];

  let shown;
  let what;
  if (state.fbMode === 'scale') {
    shown = new Set([...scale, ...tones]);
    what = `chord tones + ${scaleName}`;
  } else if (state.fbMode === 'pent') {
    shown = new Set(pent);
    what = `${minorish ? 'minor' : 'major'} pentatonic`;
  } else {
    shown = tones;
    what = 'chord tones';
  }
  const ivLabel = (iv) => (iv === 2 && chordIv.includes(14) ? '9' : IV_NAMES[iv]);

  const cap = $('fbCaption');
  cap.replaceChildren(chordName(chord) + ' ');
  const sp = document.createElement('span');
  sp.textContent = `— ${what}`;
  cap.append(sp);

  fbCells = {};
  litFret = null;
  const frag = document.createDocumentFragment();
  const div = (cls, text = '') => {
    const d = document.createElement('div');
    d.className = cls;
    d.textContent = text;
    frag.append(d);
    return d;
  };
  open.forEach((o, si) => {
    div('flab', names[si]);
    for (let f = 0; f <= FRETS; f++) {
      const pc = mod(o + f, 12);
      const iv = mod(pc - rootPc, 12);
      const cell = div('fcell' + (f === 0 ? ' open' : f === FRETS ? ' f12' : ''));
      const dot = document.createElement('span');
      dot.className = 'dot' + (!shown.has(iv) ? '' : iv === 0 ? ' root' : tones.has(iv) ? ' ct' : ' sc');
      dot.textContent = state.fbLabels === 'notes' ? KEYS[pc] : ivLabel(iv);
      cell.append(dot);
      fbCells[`${si}:${f}`] = cell;
    }
  });
  div('fmark');
  for (let f = 0; f <= FRETS; f++) div('fmark', [3, 5, 7, 9].includes(f) ? '•' : f === 12 ? '••' : '');
  fb.replaceChildren(frag);

  const list = [...shown].sort((a, b) => a - b).map((iv) => KEYS[mod(rootPc + iv, 12)]);
  fb.setAttribute('aria-label', `Fretboard, ${chordName(chord)} ${what}: ${list.join(', ')}`);
}

function lightFret(pos) {
  const next = pos ? fbCells[`${pos.si}:${pos.f}`] ?? null : null;
  if (next === litFret) return;
  litFret?.classList.remove('playing');
  next?.classList.add('playing');
  litFret = next;
}

function refreshFretboard() {
  const bar = lastChordBar ?? 0;
  lastChordBar = null;
  showChordNow(bar);
}

/** Choose string & fret for each note, keeping the hand in one position where possible. */
function renderTab(startBar) {
  tabStart = startBar;
  tabGen = gridGen;
  tabCols = [];
  tabPos = [];
  litTab = null;
  const el = $('tab');
  el.replaceChildren();
  const g = cur;
  if (!g.bass) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'No bass line in this groove — pick a bass line style above.';
    el.append(p);
    el.setAttribute('aria-label', 'No bass line');
    return;
  }
  const { open, names } = STRINGS[state.strings];
  const lowest = open[open.length - 1];
  const col = (cells, cls) => {
    const c = document.createElement('div');
    c.className = 'tcol' + (cls ? ` ${cls}` : '');
    for (const [k, v] of cells) {
      const sp = document.createElement('span');
      sp.className = k;
      if (k === 's') {
        const b = document.createElement('b');
        b.textContent = v;
        if (v) sp.append(b);
      } else sp.textContent = v;
      c.append(sp);
    }
    el.append(c);
    return c;
  };
  col([['nm', ''], ...names.map((n) => ['s', n]), ['ct', '']], 'lab');

  // hand position from the first root: lowest string where it sits at fret 0..5
  const root = bassRootMidi(g.prog[mod(startBar, g.prog.length)]);
  let anchor = 0;
  for (let si = open.length - 1; si >= 0; si--) {
    const f = root - open[si];
    if (f >= 0 && f <= 5) {
      anchor = f;
      break;
    }
  }
  const cost = (f) => (f === 0 ? 1 : f < anchor - 1 ? (anchor - 1 - f) * 2 : f > anchor + 3 ? (f - anchor - 3) * 2 : 0);

  const spoken = [];
  let lastString = open.length - 2;
  let sounding = null;
  for (let i = 0; i < g.bass.length; i++) {
    const bar = startBar + Math.floor(i / g.spb);
    const e = g.bass.events[i];
    const cells = open.map(() => ['s', '']);
    let nm = '';
    if (e?.note.dead) {
      cells[lastString] = ['s', 'x'];
      sounding = null;
    } else if (e) {
      let midi = bassNoteMidi(e.note, bar);
      while (midi < lowest) midi += 12;
      let best = null;
      open.forEach((o, si) => {
        const f = midi - o;
        if (f < 0 || f > 20) return;
        const c = cost(f) + (si === lastString ? -0.1 : 0);
        if (!best || c < best.c) best = { si, f, c };
      });
      if (best) {
        cells[best.si] = ['s', String(best.f)];
        sounding = { si: best.si, f: best.f };
        lastString = best.si;
      }
      nm = KEYS[mod(midi, 12)];
      if (e.note.approach) cells.push(['ap', '']); // marker for styling
      spoken.push(KEYS[mod(midi, 12)]);
    }
    const inBar = i % g.spb;
    const beatNo = Math.floor(inBar / g.sub);
    const ct = inBar % g.sub === 0 ? String(beatNo + 1) : COUNTS[g.sub]?.[inBar % g.sub] ?? '';
    const cls = i > 0 && inBar === 0 ? 'bar-start' : i > 0 && inBar % g.sub === 0 ? 'beat-start' : '';
    const approach = cells.length > open.length;
    if (approach) cells.pop();
    if (!e && g.bass.tokens[i] !== '-') sounding = null;
    tabPos.push(sounding);
    tabCols.push(col([['nm', nm], ...cells, ['ct', ct]], cls + (approach ? ' approach' : '')));
  }
  el.setAttribute('aria-label', `Bass tab. Notes: ${spoken.join(', ')}`);
}

let litTab = null;
let tabPos = [];
function highlightTab(i) {
  lightFret(i >= 0 ? tabPos[i] : null);
  const next = i >= 0 ? tabCols[i] ?? null : null;
  if (next === litTab) return;
  litTab?.classList.remove('now');
  next?.classList.add('now');
  litTab = next;
}

function refreshBass() {
  cur.bass = makeBass(cur);
  renderGrid();
  renderBassPanel();
  save();
}

function renderChordLine() {
  const line = $('chordLine');
  line.innerHTML = '';
  if (cur.basic) return;
  line.append('Chords: ');
  cur.prog.forEach((c, i) => {
    const s = document.createElement('span');
    s.textContent = chordName(c);
    line.append(s);
    if (i < cur.prog.length - 1) line.append(' · ');
  });
}

function renderGrid() {
  gridGen++;
  const g = cur;
  const grid = $('grid');
  const lanes = [];
  for (const k of DRUM_ORDER) if (g.drumStr[k]) lanes.push({ kind: 'drum', key: k, label: DRUM_LABELS[k], len: g.drumStr[k].length });
  if (g.bass) lanes.push({ kind: 'line', label: 'Bass', line: g.bass, len: g.bass.length });
  if (g.comp) lanes.push({ kind: 'comp', label: 'Chords', line: g.comp, len: g.comp.length });
  if (g.melody) lanes.push({ kind: 'line', label: 'Melody', line: g.melody, len: g.melody.length });
  if (!lanes.length) lanes.push({ kind: 'click', label: 'Click', len: g.spb });

  let cols = g.spb;
  for (const l of lanes) {
    const c = lcm(cols, l.len);
    if (c <= 64) cols = c;
  }
  g.displayLen = cols;
  grid.style.setProperty('--cols', cols);
  colCells = Array.from({ length: cols }, () => []);
  nowCells = [];

  const frag = document.createDocumentFragment();
  for (const lane of lanes) {
    const lab = document.createElement('div');
    lab.className = 'lane-label' + (lane.kind === 'line' || lane.kind === 'comp' ? ' pitched' : '');
    lab.textContent = lane.label;
    frag.append(lab);
    for (let c = 0; c < cols; c++) {
      const pos = c % lane.len;
      let el;
      if (lane.kind === 'drum') {
        el = document.createElement('button');
        const ch = g.drumStr[lane.key][pos];
        el.className = 'cell' + (ch !== '.' ? ` v-${ch}` : '');
        el.dataset.lane = lane.key;
        el.dataset.pos = pos;
        el.setAttribute('aria-label', `${lane.label} step ${pos + 1}: ${HIT_NAMES[ch]}`);
      } else {
        el = document.createElement('div');
        el.className = 'cell';
        if (lane.kind === 'click') {
          if (c % g.sub === 0) el.classList.add(c % g.spb === 0 ? 'v-X' : 'v-x');
          else if (state.subClicks) el.classList.add('v-g');
        } else {
          const e = lane.line.events[pos];
          if (e) {
            el.classList.add('note');
            if (lane.kind === 'line') el.textContent = tokLabel(e.tok);
          } else if (lane.line.tokens[pos] === '-') el.classList.add('tie');
        }
      }
      if (c > 0 && c % g.spb === 0) el.classList.add('bar-start');
      else if (c > 0 && c % g.sub === 0) el.classList.add('beat-start');
      colCells[c].push(el);
      frag.append(el);
    }
  }
  grid.replaceChildren(frag);
}

function editCell(btn) {
  const lane = btn.dataset.lane;
  const pos = Number(btn.dataset.pos);
  const str = cur.drumStr[lane];
  const next = CYCLE[str[pos]] ?? '.';
  cur.drumStr[lane] = str.slice(0, pos) + next + str.slice(pos + 1);
  cur.drums[lane] = parseDrum(cur.drumStr[lane]);
  $('grid').querySelectorAll(`[data-lane="${lane}"][data-pos="${pos}"]`).forEach((el) => {
    el.className = 'cell' + (next !== '.' ? ` v-${next}` : '') + [...el.classList].filter((c) => /start|now/.test(c)).map((c) => ' ' + c).join('');
    el.setAttribute('aria-label', `${DRUM_LABELS[lane]} step ${pos + 1}: ${HIT_NAMES[next]}`);
  });
  if (!sched.playing && audio.ctx && next !== '.') audio.drum(lane, audio.now, cur.drums[lane][pos].v);
}

// ------------------------------------------------------------------ mixer

function renderMixer() {
  const mixer = $('mixer');
  mixer.innerHTML = '';
  for (const layer of LAYERS) {
    const st = state.layers[layer.id];
    const row = document.createElement('div');
    row.className = 'mix-row' + (SOUNDS[layer.id] ? ' has-sound' : '');

    const btn = document.createElement('button');
    btn.textContent = layer.label;
    btn.setAttribute('aria-pressed', String(st.on));
    btn.setAttribute('aria-label', `${layer.label} on/off`);
    btn.onclick = () => {
      st.on = !st.on;
      btn.setAttribute('aria-pressed', String(st.on));
      save();
    };

    const vol = document.createElement('input');
    vol.type = 'range';
    vol.min = 0;
    vol.max = 1;
    vol.step = 0.01;
    vol.value = st.vol;
    vol.setAttribute('aria-label', `${layer.label} volume`);
    vol.oninput = () => {
      st.vol = Number(vol.value);
      audio.setBusGain(layer.id, st.vol);
      save();
    };
    row.append(btn, vol);

    if (SOUNDS[layer.id]) {
      const sel = document.createElement('select');
      sel.id = `sound-${layer.id}`;
      sel.setAttribute('aria-label', `${layer.label} sound`);
      sel.append(new Option('Auto', 'auto'));
      for (const [k, p] of Object.entries(SOUNDS[layer.id])) sel.append(new Option(p.label, k));
      sel.value = state.sounds[layer.id];
      sel.onchange = () => {
        state.sounds[layer.id] = sel.value;
        save();
      };
      row.append(sel);
    }
    mixer.append(row);
  }
}

function renderMixerDefaults() {
  for (const layer of ['bass', 'chords', 'melody']) {
    const sel = $(`sound-${layer}`);
    if (sel) sel.options[0].text = `Auto (${SOUNDS[layer][cur.sounds[layer]].label})`;
  }
}

function applyMix() {
  for (const l of LAYERS) audio.setBusGain(l.id, state.layers[l.id].vol);
}

// ------------------------------------------------------------------ tempo

function setBpm(v) {
  state.bpm = Math.max(30, Math.min(300, Math.round(v)));
  $('bpmOut').textContent = state.bpm;
  $('bpmSlider').value = state.bpm;
  updateSpeedInfo();
  save();
}

function setSpeed(v) {
  state.speed = v;
  for (const b of $('speedBtns').children) b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === v));
  updateSpeedInfo();
  save();
}

function updateSpeedInfo() {
  $('speedInfo').textContent =
    state.speed < 100 ? `Playing at ${Math.round(playBpm())} BPM — ${state.speed}% of ${state.bpm}` : '';
}

let taps = [];
function tap() {
  const t = performance.now();
  if (taps.length && t - taps[taps.length - 1] > 2000) taps = [];
  taps.push(t);
  if (taps.length > 6) taps.shift();
  if (taps.length >= 2) setBpm(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1)));
}

function holdRepeat(btn, fn) {
  let delay = null;
  let rep = null;
  const end = () => {
    clearTimeout(delay);
    clearInterval(rep);
  };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    fn();
    delay = setTimeout(() => (rep = setInterval(fn, 70)), 400);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, end));
  btn.addEventListener('click', (e) => {
    if (e.detail === 0) fn(); // keyboard activation
  });
}

// ------------------------------------------------------------------ groove selection

function selectGroove(id) {
  state.grooveId = id;
  const def = grooveDef(id);
  state.swing = null;
  setBpm(def.bpm);
  rebuild();
}

function rebuild() {
  if (sched.playing) {
    pendingRebuild = true; // switch on the next bar line so the music stays in time
    $('grooveSelect').value = state.grooveId;
    setStatus('Switching at the next bar…');
    lastStatusKey = 'pending';
  } else {
    cur = buildGroove(grooveDef(state.grooveId));
    renderGroove();
  }
  save();
}

function stepGroove(dir) {
  const i = GROOVES.findIndex((g) => g.id === state.grooveId);
  selectGroove(GROOVES[mod(i + dir, GROOVES.length)].id);
}

// ------------------------------------------------------------------ wake lock

let wakeLock = null;
async function requestWake() {
  if (!state.wake || !sched.playing || !('wakeLock' in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => (wakeLock = null));
  } catch {
    wakeLock = null;
  }
}
function releaseWake() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) requestWake();
});

// ------------------------------------------------------------------ init UI

function init() {
  // groove list grouped by genre
  const sel = $('grooveSelect');
  const groups = new Map();
  for (const g of GROOVES) {
    if (!groups.has(g.genre)) {
      const og = document.createElement('optgroup');
      og.label = g.genre;
      groups.set(g.genre, og);
      sel.append(og);
    }
    groups.get(g.genre).append(new Option(g.name, g.id));
  }
  sel.onchange = () => selectGroove(sel.value);
  $('prevGroove').onclick = () => stepGroove(-1);
  $('nextGroove').onclick = () => stepGroove(1);

  // basic metronome
  for (let i = 1; i <= 12; i++) $('basicBeats').append(new Option(String(i), String(i)));
  $('basicBeats').value = state.basicBeats;
  $('basicSub').value = state.basicSub;
  $('subClicks').checked = state.subClicks;
  $('basicBeats').onchange = (e) => {
    state.basicBeats = Number(e.target.value);
    rebuild();
  };
  $('basicSub').onchange = (e) => {
    state.basicSub = Number(e.target.value);
    rebuild();
  };
  $('subClicks').onchange = (e) => {
    state.subClicks = e.target.checked;
    if (!sched.playing) renderGrid();
    save();
  };

  // transport
  $('playBtn').onclick = toggle;
  $('tapBtn').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    tap();
  });
  $('tapBtn').addEventListener('click', (e) => e.detail === 0 && tap());
  holdRepeat($('bpmDown'), () => setBpm(state.bpm - 1));
  holdRepeat($('bpmUp'), () => setBpm(state.bpm + 1));
  $('bpmSlider').oninput = (e) => setBpm(Number(e.target.value));
  const cin = $('countInBtn');
  cin.setAttribute('aria-pressed', String(state.countIn));
  cin.onclick = () => {
    state.countIn = !state.countIn;
    cin.setAttribute('aria-pressed', String(state.countIn));
    save();
  };

  // grid editing
  $('grid').addEventListener('click', (e) => {
    const b = e.target.closest('button.cell');
    if (b) editCell(b);
  });
  $('resetPattern').onclick = () => {
    const mel = cur.melody;
    cur = buildGroove(grooveDef(state.grooveId));
    if (!cur.def.melody && mel) cur.melody = mel;
    renderGroove();
  };

  // sound
  renderMixer();
  KEYS.forEach((k, i) => $('keySelect').append(new Option(k, String(i))));
  $('keySelect').value = state.key;
  $('keySelect').onchange = (e) => {
    state.key = Number(e.target.value);
    renderChordLine();
    renderBassPanel();
    save();
  };
  $('swing').oninput = (e) => {
    state.swing = Number(e.target.value);
    $('swingOut').textContent = `${state.swing}%`;
    save();
  };
  $('humanize').value = state.humanize;
  $('humanOut').textContent = `${state.humanize}%`;
  $('humanize').oninput = (e) => {
    state.humanize = Number(e.target.value);
    $('humanOut').textContent = `${state.humanize}%`;
    save();
  };
  const turnOnMelody = () => {
    state.layers.melody.on = true;
    renderMixer();
    renderMixerDefaults();
  };
  $('newMelody').onclick = () => {
    cur.melody = parseLine(generateMelody(cur));
    turnOnMelody();
    renderGrid();
    save();
  };
  $('origMelody').onclick = () => {
    if (!cur.def.melody) return;
    cur.melody = parseLine(cur.def.melody);
    turnOnMelody();
    renderGrid();
  };

  // bass player
  $('bassMode').value = state.bassMode;
  $('bassMode').onchange = (e) => {
    state.bassMode = e.target.value;
    save();
  };
  $('drumMode').value = state.drumMode;
  $('drumMode').onchange = (e) => {
    state.drumMode = e.target.value;
    save();
  };
  $('bassStyle').onchange = (e) => {
    state.bassStyle = e.target.value;
    refreshBass();
  };
  $('newBass').onclick = () => {
    state.bassStyle = 'random';
    state.layers.bass.on = true;
    renderMixer();
    renderMixerDefaults();
    refreshBass();
  };
  for (const p of PROGRESSIONS) $('progSelect').append(new Option(p.name, p.id));
  $('progSelect').value = state.prog;
  $('progSelect').onchange = (e) => {
    state.prog = e.target.value;
    cur.prog = makeProg(cur.def);
    renderChordLine();
    renderBassPanel();
    save();
  };
  const setStrings = (n) => {
    state.strings = n;
    $('str4').setAttribute('aria-pressed', String(n === 4));
    $('str5').setAttribute('aria-pressed', String(n === 5));
    renderTab(Math.max(0, tabStart));
    refreshFretboard();
    save();
  };
  $('str4').onclick = () => setStrings(4);
  $('str5').onclick = () => setStrings(5);
  setStrings(state.strings);

  // practice speed
  for (const v of SPEEDS) {
    const b = document.createElement('button');
    b.className = 'toggle small';
    b.dataset.speed = v;
    b.textContent = `${v}%`;
    b.setAttribute('aria-label', `${v} percent speed`);
    b.onclick = () => setSpeed(v);
    $('speedBtns').append(b);
  }
  $('speedAuto').checked = state.speedAuto.on;
  $('speedAuto').onchange = (e) => {
    state.speedAuto.on = e.target.checked;
    save();
  };
  $('speedBars').value = state.speedAuto.bars;
  $('speedBars').onchange = (e) => {
    const v = Math.max(1, Math.min(32, Math.round(Number(e.target.value) || 8)));
    state.speedAuto.bars = v;
    e.target.value = v;
    save();
  };

  // fretboard
  $('fbMode').value = state.fbMode;
  $('fbMode').onchange = (e) => {
    state.fbMode = e.target.value;
    refreshFretboard();
    save();
  };
  const setLabels = (v) => {
    state.fbLabels = v;
    $('lblIv').setAttribute('aria-pressed', String(v === 'iv'));
    $('lblNotes').setAttribute('aria-pressed', String(v === 'notes'));
    refreshFretboard();
    save();
  };
  $('lblIv').onclick = () => setLabels('iv');
  $('lblNotes').onclick = () => setLabels('notes');
  setLabels(state.fbLabels);

  // tuner
  [['B', 23], ['E', 28], ['A', 33], ['D', 38], ['G', 43]].forEach(([n, m]) => {
    const b = document.createElement('button');
    b.textContent = n;
    b.setAttribute('aria-label', `Play ${n} string reference`);
    b.onclick = async () => {
      audio.init();
      applyMix();
      await audio.resume();
      audio.bass(audio.now + 0.02, m, 2.2, 0.9, 'upright');
    };
    $('refRow').append(b);
  });
  const tuner = new Tuner(audio);
  const tBtn = $('tunerBtn');
  const showReading = (r) => {
    const needle = $('needle');
    if (!r) {
      needle.classList.remove('on');
      $('tunerCents').textContent = 'Play a string…';
      return;
    }
    const inTune = Math.abs(r.cents) <= 4;
    $('tunerNote').textContent = `${r.name}${r.octave}`;
    $('tunerNote').classList.toggle('in-tune', inTune);
    $('tunerCents').textContent = `${r.cents > 0 ? '+' : ''}${r.cents} cents · ${r.freq.toFixed(1)} Hz${inTune ? ' · in tune' : r.cents < 0 ? ' · tune up' : ' · tune down'}`;
    needle.style.left = `${50 + Math.max(-50, Math.min(50, r.cents))}%`;
    needle.classList.add('on');
  };
  tBtn.onclick = async () => {
    if (tuner.running) {
      tuner.stop();
      tBtn.textContent = '🎤 Start mic tuner';
      tBtn.setAttribute('aria-pressed', 'false');
      $('tunerNote').textContent = '–';
      $('tunerCents').textContent = '';
      $('needle').classList.remove('on');
      return;
    }
    try {
      await tuner.start(showReading);
      tBtn.textContent = '■ Stop tuner';
      tBtn.setAttribute('aria-pressed', 'true');
    } catch {
      $('tunerCents').textContent = 'Microphone not available — allow mic access (needs https).';
    }
  };
  $('tunerBox').addEventListener('toggle', () => {
    if (!$('tunerBox').open && tuner.running) tBtn.click();
  });

  // practice
  const bindCheck = (id, get, set) => {
    $(id).checked = get();
    $(id).onchange = (e) => {
      set(e.target.checked);
      save();
    };
  };
  const bindNum = (id, obj, key, min, max) => {
    $(id).value = obj[key];
    $(id).onchange = (e) => {
      const v = Math.max(min, Math.min(max, Math.round(Number(e.target.value) || min)));
      obj[key] = v;
      e.target.value = v;
      save();
    };
  };
  bindCheck('gapOn', () => state.gap.on, (v) => (state.gap.on = v));
  bindNum('gapPlay', state.gap, 'play', 1, 16);
  bindNum('gapMute', state.gap, 'mute', 1, 16);
  bindCheck('trainOn', () => state.trainer.on, (v) => (state.trainer.on = v));
  bindNum('trainInc', state.trainer, 'inc', 1, 20);
  bindNum('trainEvery', state.trainer, 'every', 1, 32);
  bindNum('trainTarget', state.trainer, 'target', 30, 300);
  bindCheck('flashOn', () => state.flash, (v) => (state.flash = v));
  bindCheck('vibrateOn', () => state.vibrate, (v) => (state.vibrate = v));
  bindCheck('wakeOn', () => state.wake, (v) => {
    state.wake = v;
    if (v) requestWake();
    else releaseWake();
  });
  if (!navigator.vibrate) $('vibrateWrap').hidden = true;

  // keyboard
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea')) return;
    if (e.code === 'Space' && !e.target.closest('button')) {
      e.preventDefault();
      toggle();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      setBpm(state.bpm + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 5 : 1));
    }
  });

  // install as app (Android/desktop Chrome)
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    $('installBtn').hidden = false;
  });
  $('installBtn').onclick = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    $('installBtn').hidden = true;
  };
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  setBpm(state.bpm ?? cur.def.bpm);
  setSpeed(state.speed);
  renderGroove();
}

init();
