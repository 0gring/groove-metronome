import { AudioEngine, SOUNDS } from './audio.js';
import { GROOVES, DRUM_ORDER, DRUM_LABELS } from './grooves.js';
import {
  QUALITIES, parseDrum, parseLine, parseComp, parseProg, generateMelody, resolveNote, cleanDrum, mod, lcm,
} from './theory.js';

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
  g.bass = def.bass ? parseLine(def.bass) : null;
  g.comp = def.chords ? parseComp(def.chords) : null;
  g.melody = def.melody ? parseLine(def.melody) : g.basic ? null : parseLine(generateMelody(g));
  g.prog = parseProg(def.prog);
  return g;
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

const stepDur = () => 60 / state.bpm / cur.sub;

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
    for (const [name, arr] of Object.entries(g.drums)) {
      const h = arr[abs % arr.length];
      if (!h) continue;
      if (h.n === 1) audio.drum(name, at(tt), vj(h.v));
      else for (let k = 0; k < h.n; k++) audio.drum(name, tt + (k * sd) / h.n, h.v * (k ? 0.75 : 1));
    }
  }

  const chord = g.prog[bar % g.prog.length];
  const pc = mod(state.key + chord.root, 12);

  if (L.bass.on && g.bass) {
    const e = g.bass.events[abs % g.bass.length];
    if (e) {
      let root = 24 + pc;
      if (root < 28) root += 12;
      audio.bass(at(tt), root + resolveNote(e.note, chord.q), e.len * sd * 0.92, vj(0.85), soundFor('bass'), e.note.dead);
    }
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
  if (!last.countIn) highlightChord(last.chordIdx);

  let key;
  let msg;
  if (last.countIn) [key, msg] = ['count', 'Count-in…'];
  else if (last.muted) [key, msg] = ['gap', 'Silent bars — keep the time!'];
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
const tokLabel = (tok) => tok.replace('b', '♭').replace('#', '♯').replace('^', '↑').replace('_', '↓');

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
  save();
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
  renderGroove();
}

init();
