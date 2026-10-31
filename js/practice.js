// "My music": import tabs / MusicXML / PDF, keep them in a library, and practise them.

import { parseAsciiTab, parseMusicXML, readMxl, findTabBlocks } from './importers.js';
import { listItems, getItem, putItem, deleteItem, newId } from './library.js';

const $ = (id) => document.getElementById(id);
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const COUNTS = { 2: ['', '&'], 4: ['', 'e', '&', 'a'] };
const ACTIVE_KEY = 'groove-metronome:piece';
const TYPE_LABEL = { tab: 'TAB', xml: 'XML', mxl: 'MXL', pdf: 'PDF' };

const pdfMod = () => import('./pdfview.js');

/**
 * api: { isPlaying(), setBpm(bpm), setPiece(piece|null, fromBar, toBar), setLoop(fromBar, toBar), backingInfo() }
 */
export function initPractice(api) {
  let active = null; // { item, piece, pdf, page }
  let shownBar = -1;
  let tabCols = [];
  let lit = null;
  let barsOnPage = 0;
  let lastBar = null;

  const msg = (text, kind = '') => {
    const el = $('importMsg');
    el.textContent = text;
    el.className = `import-msg ${kind}`;
  };

  // ---------------------------------------------------------------- building pieces

  async function build(item) {
    const st = item.settings;
    const opts = { beats: st.beats ?? 4, title: item.name, partIndex: st.part ?? null };
    if (item.type === 'tab') return { piece: parseAsciiTab(item.data, opts) };
    if (item.type === 'xml') return { piece: parseMusicXML(item.data, opts) };
    if (item.type === 'mxl') {
      item._xml ??= await readMxl(item.data);
      return { piece: parseMusicXML(item._xml, opts) };
    }
    // PDF: always viewable; playable too if it contains text tab
    const { openPdf, extractText } = await pdfMod();
    const pdf = await openPdf(item.data);
    let piece = null;
    try {
      item._text ??= await extractText(pdf);
      if (findTabBlocks(item._text).length) piece = parseAsciiTab(item._text, opts);
    } catch {
      piece = null;
    }
    return { pdf, piece };
  }

  function detectType(name, text) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (ext === 'mxl') return 'mxl';
    if (text !== null && /<score-(partwise|timewise)/.test(text.slice(0, 4000))) return 'xml';
    return 'tab';
  }

  async function importFile(file) {
    msg(`Importing ${file.name}…`);
    try {
      const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46; // %PDF
      const isZip = head[0] === 0x50 && head[1] === 0x4b; // PK
      const binary = isPdf || isZip;
      const text = binary ? null : await file.text();
      const type = isPdf ? 'pdf' : isZip ? 'mxl' : detectType(file.name, text);
      const item = {
        id: newId(),
        name: file.name.replace(/\.[^.]+$/, '') || 'Untitled',
        type,
        data: binary ? await file.arrayBuffer() : text,
        settings: {},
        added: Date.now(),
      };
      const built = await build(item); // validates before saving
      await save(item);
      await renderList();
      await open(item.id, built);
      if (type === 'pdf') {
        msg(built.piece ? 'PDF added — tab found in it, so it is playable too.' : 'PDF added. It shows as pages to read while you practise; printed notation can’t be turned into sound — import a MusicXML export for playable notes.', 'ok');
      } else msg(`Added “${item.name}” — ${built.piece.bars} bars.`, 'ok');
    } catch (e) {
      msg(e?.message || 'Could not read that file.', 'err');
    }
  }

  async function save(item) {
    const { _xml, _text, ...plain } = item;
    await putItem(plain);
  }

  // ---------------------------------------------------------------- library list

  async function renderList() {
    let items = [];
    try {
      items = await listItems();
    } catch {
      msg('Storage is not available in this browser, imports will not be saved.', 'err');
    }
    const ul = $('libList');
    ul.replaceChildren();
    for (const it of items) {
      const li = document.createElement('li');
      const openBtn = document.createElement('button');
      openBtn.className = 'open';
      openBtn.setAttribute('aria-current', String(active?.item.id === it.id));
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = TYPE_LABEL[it.type] ?? it.type;
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = it.name;
      openBtn.append(badge, n);
      openBtn.onclick = () => open(it.id).catch((e) => msg(e.message, 'err'));
      const del = document.createElement('button');
      del.className = 'del';
      del.textContent = '🗑';
      del.setAttribute('aria-label', `Delete ${it.name}`);
      del.onclick = async () => {
        if (!confirm(`Delete “${it.name}” from your library?`)) return;
        if (active?.item.id === it.id) close();
        await deleteItem(it.id);
        renderList();
      };
      li.append(openBtn, del);
      ul.append(li);
    }
  }

  // ---------------------------------------------------------------- open / close

  async function open(id, prebuilt = null) {
    const item = await getItem(id);
    if (!item) return;
    const built = prebuilt ?? (await build(item));
    active = { item, ...built, page: item.settings.page ?? 1 };
    try {
      localStorage.setItem(ACTIVE_KEY, id);
    } catch {
      /* ignore */
    }
    const { piece } = active;
    $('pieceView').hidden = false;
    $('pieceTitle').textContent = piece?.title && item.type !== 'tab' ? piece.title : item.name;

    if (piece) {
      const [from, to] = item.settings.loop ?? [1, piece.bars];
      if (!item.settings.opened && piece.tempo) api.setBpm(piece.tempo);
      item.settings.opened = true;
      save(item);
      api.setPiece(piece, from - 1, to - 1);
      fillControls();
      renderPieceTab(Math.max(0, from - 1));
    } else {
      api.setPiece(null);
    }
    $('pieceControls').hidden = !piece;
    updateInfo();

    $('pdfView').hidden = !active.pdf;
    if (active.pdf) {
      active.page = Math.min(active.page, active.pdf.numPages);
      $('pdfAutoBars').value = item.settings.autoBars ?? 4;
      $('pdfAuto').checked = !!item.settings.autoTurn;
      showPage();
    }
    renderList();
  }

  function close() {
    active = null;
    try {
      localStorage.removeItem(ACTIVE_KEY);
    } catch {
      /* ignore */
    }
    $('pieceView').hidden = true;
    api.setPiece(null);
    renderList();
  }

  function updateInfo() {
    if (!active) return;
    const { piece, item } = active;
    const parts = [];
    if (piece) {
      parts.push(`${piece.bars} bars in ${piece.beats}/${piece.beatType}`);
      parts.push(`${piece.tuning.length}-string ${piece.tuning[0] >= 59 ? 'guitar' : 'bass'} tab`);
      const info = api.backingInfo();
      if (info) parts.push(`backing: ${info}`);
    }
    if (item.type === 'pdf') parts.push(`${active.pdf.numPages} page PDF`);
    $('pieceInfo').textContent = parts.join(' · ');
  }

  function fillControls() {
    const { piece, item } = active;
    const isTab = item.type === 'tab' || item.type === 'pdf';
    $('beatsWrap').hidden = !isTab;
    if (isTab) {
      const sel = $('pieceBeats');
      sel.replaceChildren(...[2, 3, 4, 5, 6, 7].map((n) => new Option(`${n}`, String(n))));
      sel.value = String(piece.beats);
    }
    const parts = piece.parts ?? [];
    $('partWrap').hidden = parts.length < 2;
    if (parts.length >= 2) {
      $('piecePart').replaceChildren(...parts.map((p, i) => new Option(p.name, String(i))));
      $('piecePart').value = String(piece.partIndex);
    }
    const [from, to] = item.settings.loop ?? [1, piece.bars];
    for (const id of ['loopFrom', 'loopTo']) $(id).max = piece.bars;
    $('loopFrom').value = from;
    $('loopTo').value = to;
    const ft = $('fileTempo');
    ft.hidden = !piece.tempo;
    ft.textContent = `Use file tempo (♩ = ${piece.tempo})`;
  }

  async function rebuild() {
    // settings that change how the file is parsed (beats per bar, part)
    try {
      const built = await build(active.item);
      delete active.item.settings.loop;
      await save(active.item);
      await open(active.item.id, { ...built, pdf: active.pdf ?? built.pdf });
    } catch (e) {
      msg(e.message, 'err');
    }
  }

  function setLoop(from, to) {
    const { piece, item } = active;
    from = Math.max(1, Math.min(piece.bars, from | 0 || 1));
    to = Math.max(from, Math.min(piece.bars, to | 0 || piece.bars));
    $('loopFrom').value = from;
    $('loopTo').value = to;
    item.settings.loop = [from, to];
    save(item);
    api.setLoop(from - 1, to - 1);
    shownBar = -1;
    renderPieceTab(from - 1);
  }

  // ---------------------------------------------------------------- piece tab (now + next bar)

  function renderPieceTab(pb) {
    if (!active?.piece) return;
    const piece = active.piece;
    shownBar = pb;
    tabCols = [];
    lit = null;
    const [from, to] = (active.item.settings.loop ?? [1, piece.bars]).map((x) => x - 1);
    const next = pb + 1 > to ? from : pb + 1;
    const el = $('pieceTab');
    el.replaceChildren();
    const col = (cells, cls = '') => {
      const c = document.createElement('div');
      c.className = `tcol ${cls}`;
      for (const [k, v, extra] of cells) {
        const sp = document.createElement('span');
        sp.className = k;
        if (k === 's') {
          if (v) {
            const b = document.createElement('b');
            b.textContent = v;
            sp.append(b);
          }
        } else sp.textContent = v;
        if (extra) c.classList.add(extra);
        c.append(sp);
      }
      el.append(c);
      return c;
    };
    col([['nm', ''], ...piece.names.map((n) => ['s', n]), ['ct', '']], 'lab');

    const cpb = piece.cpb;
    const width = piece.beats * cpb;
    const spoken = [];
    [pb, next].forEach((bar, k) => {
      const cols = Array.from({ length: width }, () => ({ s: piece.tuning.map(() => ''), nm: '' }));
      for (const n of piece.byBar?.[bar] ?? []) {
        const c = Math.max(0, Math.min(width - 1, Math.round(n.beat * cpb)));
        if (n.si !== null && n.si !== undefined) cols[c].s[n.si] = n.dead ? 'x' : String(n.f);
        if (!n.dead) {
          cols[c].nm ||= NAMES[n.midi % 12];
          if (k === 0) spoken.push(NAMES[n.midi % 12]);
        }
      }
      cols.forEach((cd, c) => {
        const ct = c % cpb === 0 ? String(c / cpb + 1) : COUNTS[cpb]?.[c % cpb] ?? '';
        const cls = c === 0 ? 'bar-start' : c % cpb === 0 ? 'beat-start' : '';
        const node = col([['nm', cd.nm], ...cd.s.map((v) => ['s', v]), ['ct', ct]], cls);
        if (k === 0) tabCols.push(node);
        else node.style.opacity = '0.55';
      });
    });
    $('pieceBarInfo').textContent = `Bar ${pb + 1} of ${piece.bars}  →  next: bar ${next + 1}`;
    el.setAttribute('aria-label', `Bar ${pb + 1}: ${spoken.join(', ') || 'rest'}`);
  }

  // ---------------------------------------------------------------- PDF pages

  async function showPage() {
    if (!active?.pdf) return;
    const { pdf } = active;
    active.page = Math.max(1, Math.min(pdf.numPages, active.page));
    $('pdfPage').textContent = `Page ${active.page} of ${pdf.numPages}`;
    $('pdfPrev').disabled = active.page <= 1;
    $('pdfNext').disabled = active.page >= pdf.numPages;
    const { renderPage } = await pdfMod();
    await renderPage(pdf, active.page, $('pdfCanvas'), $('pdfWrap').clientWidth || 340);
  }

  function turn(d) {
    if (!active?.pdf) return;
    active.page += d;
    barsOnPage = 0;
    active.item.settings.page = Math.max(1, Math.min(active.pdf.numPages, active.page));
    save(active.item);
    showPage();
  }

  // ---------------------------------------------------------------- events

  $('importFile').addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (f) importFile(f);
    e.target.value = '';
  });
  $('pasteBtn').onclick = () => {
    const box = $('pasteBox');
    box.hidden = !box.hidden;
    $('pasteBtn').setAttribute('aria-expanded', String(!box.hidden));
    if (!box.hidden) $('pasteText').focus();
  };
  $('pasteSave').onclick = async () => {
    const text = $('pasteText').value;
    const name = $('pasteName').value.trim() || 'Pasted tab';
    try {
      const item = { id: newId(), name, type: 'tab', data: text, settings: {}, added: Date.now() };
      const built = await build(item);
      await save(item);
      $('pasteText').value = '';
      $('pasteName').value = '';
      $('pasteBox').hidden = true;
      $('pasteBtn').setAttribute('aria-expanded', 'false');
      await renderList();
      await open(item.id, built);
      msg(`Added “${name}” — ${built.piece.bars} bars.`, 'ok');
    } catch (e) {
      msg(e.message, 'err');
    }
  };
  $('closePiece').onclick = close;
  $('pieceBeats').onchange = (e) => {
    active.item.settings.beats = Number(e.target.value);
    rebuild();
  };
  $('piecePart').onchange = (e) => {
    active.item.settings.part = Number(e.target.value);
    rebuild();
  };
  $('loopFrom').onchange = () => setLoop(Number($('loopFrom').value), Number($('loopTo').value));
  $('loopTo').onchange = () => setLoop(Number($('loopFrom').value), Number($('loopTo').value));
  $('loopAll').onclick = () => setLoop(1, active.piece.bars);
  $('fileTempo').onclick = () => active?.piece?.tempo && api.setBpm(active.piece.tempo);
  $('pdfPrev').onclick = () => turn(-1);
  $('pdfNext').onclick = () => turn(1);
  $('pdfCanvas').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    turn(e.clientX - r.left > r.width / 2 ? 1 : -1);
  });
  $('pdfAuto').onchange = (e) => {
    active.item.settings.autoTurn = e.target.checked;
    barsOnPage = 0;
    save(active.item);
  };
  $('pdfAutoBars').onchange = (e) => {
    const v = Math.max(1, Math.min(64, Number(e.target.value) || 4));
    e.target.value = v;
    active.item.settings.autoBars = v;
    save(active.item);
  };
  let resizeT = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(showPage, 200);
  });

  renderList();
  try {
    const id = localStorage.getItem(ACTIVE_KEY);
    if (id) open(id).catch(() => localStorage.removeItem(ACTIVE_KEY));
  } catch {
    /* ignore */
  }

  return {
    /** Called for every visible step while a piece is playing. */
    onStep(ev) {
      if (!active?.piece) return;
      if (ev.pieceBar !== shownBar) {
        renderPieceTab(ev.pieceBar);
        updateInfo();
      }
      const c = tabCols[Math.floor(ev.pieceBeat * active.piece.cpb + 1e-6)] ?? null;
      if (c !== lit) {
        lit?.classList.remove('now');
        c?.classList.add('now');
        lit = c;
      }
    },
    /** Called on every new bar (any mode) — drives PDF auto page-turn. */
    onBar(bar) {
      if (bar === lastBar) return;
      lastBar = bar;
      const st = active?.item.settings;
      if (!active?.pdf || !st?.autoTurn || bar === 0) return;
      if (++barsOnPage >= (st.autoBars ?? 4) && active.page < active.pdf.numPages) turn(1);
    },
    onStop() {
      lastBar = null;
      barsOnPage = 0;
      if (active?.piece) {
        const from = (active.item.settings.loop?.[0] ?? 1) - 1;
        renderPieceTab(from);
      }
    },
  };
}
