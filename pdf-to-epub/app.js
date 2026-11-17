// PDF -> EPUB web app: reads the PDF, rebuilds it as a reflowable book, shows a paginated live preview
// (colour themes, reflowing text zoom) and downloads the EPUB.
/* global PdfExtract, PdfStructure, EpubBuild, EpubReader */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const R = window.EpubReader;
  const MM = R.MM;
  const STORE_KEY = 'pdf-to-epub-settings';

  let extracted = null; // raw lines/pictures from the PDF (kept so conversion options re-run instantly)
  let structured = null; // book structure for the EPUB
  let previewBook = null; // the EPUB as loaded by the preview reader
  let fileName = 'book';
  let page = 0;
  let pages = 1;
  let viewScale = 0; // 0 = fit to window
  let frameDoc = null;

  // ---- settings ---------------------------------------------------------------------------------------------
  const CONVERSION_KEYS = ['removeHeadersFooters', 'joinHyphens', 'detectHeadings', 'useOutline', 'keepImages'];
  const settings = Object.assign({}, R.DEFAULTS, PdfStructure.DEFAULTS, { includeCover: true, bake: true });
  try { Object.assign(settings, JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); } catch (_) { /* private mode */ }
  const saveSettings = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (_) { /* ignore */ } };

  const pageSel = $('page');
  for (const [key, p] of Object.entries(R.PAGE_SIZES)) pageSel.add(new Option(p.label, key));
  if (!R.PAGE_SIZES[settings.page]) settings.page = 'ereader';

  function syncControls() {
    $('zoom').value = Math.round(settings.zoom * 100);
    $('zoomVal').textContent = `${Math.round(settings.zoom * 100)}%`;
    for (const r of document.querySelectorAll('input[name=theme]')) r.checked = r.value === settings.theme;
    $('customColors').hidden = settings.theme !== 'custom';
    $('fg').value = settings.fg;
    $('bg').value = settings.bg;
    $('customSwatch').style.cssText = `color:${settings.fg};background:${settings.bg}`;
    $('invertImages').checked = settings.invertImages;
    pageSel.value = settings.page;
    $('margin').value = settings.margin;
    $('marginVal').textContent = `${settings.margin} mm`;
    $('font').value = settings.font;
    $('lineHeight').value = String(settings.lineHeight);
    $('justify').checked = settings.justify;
    $('bake').checked = settings.bake;
    $('includeCover').checked = settings.includeCover;
    for (const k of CONVERSION_KEYS) $(k).checked = settings[k];
  }

  // Appearance change: restyle the preview in place and keep the reader on the same passage.
  let pending = null;
  function update(changes, immediate) {
    Object.assign(settings, changes);
    syncControls();
    saveSettings();
    if (!frameDoc) return;
    if (!pending) pending = { anchor: captureAnchor() };
    const run = () => {
      const { anchor } = pending;
      pending = null;
      applyStyles();
      restoreAnchor(anchor);
    };
    if (immediate) run();
    else { clearTimeout(update.t); update.t = setTimeout(run, 40); }
  }

  function setZoom(z) {
    z = Math.min(4, Math.max(0.5, Math.round(z * 20) / 20));
    if (z !== settings.zoom) update({ zoom: z });
  }

  // ---- preview -----------------------------------------------------------------------------------------------
  const frame = $('frame');

  function geometry() {
    const o = R.normalizeOptions(settings);
    const margin = o.margin * MM;
    const contentW = (o.pageW - 2 * o.margin) * MM;
    return { margin, contentW, step: contentW + 2 * margin, pageW: o.pageW * MM, pageH: o.pageH * MM };
  }

  function applyStyles() {
    const css = R.buildCss(previewBook, settings, 'preview');
    frameDoc.getElementById('epub-base').textContent = css.base;
    const bookStyle = frameDoc.getElementById('epub-book');
    if (bookStyle.textContent !== css.book) bookStyle.textContent = css.book;
    frameDoc.getElementById('epub-override').textContent = css.override;
    layoutSheet();
    paginate();
  }

  function paginate() {
    const { step, contentW } = geometry();
    const el = frameDoc.querySelector('.epub-pages');
    // n pages take n * contentW + (n - 1) * gap, with step = contentW + gap
    pages = Math.max(1, Math.round((el.scrollWidth + step - contentW) / step));
    $('pageTotal').textContent = pages;
    $('pageCount').textContent = pages;
    $('pageNum').max = pages;
    goTo(Math.min(page, pages - 1));
  }

  function goTo(p) {
    page = Math.max(0, Math.min(pages - 1, p));
    const el = frameDoc && frameDoc.querySelector('.epub-pages');
    if (el) el.scrollLeft = page * geometry().step;
    $('pageNum').value = page + 1;
    $('prev').disabled = page === 0;
    $('next').disabled = page >= pages - 1;
  }

  // Page that contains a node / range, from its position in the column flow.
  function pageOf(target) {
    const rects = target.getClientRects ? target.getClientRects() : [];
    const r = rects.length ? rects[0] : target.getBoundingClientRect();
    const { margin, step } = geometry();
    const el = frameDoc.querySelector('.epub-pages');
    return Math.floor((r.left - margin + el.scrollLeft + 1) / step);
  }

  function captureAnchor() {
    if (!frameDoc) return null;
    const { margin } = geometry();
    const fraction = pages > 1 ? page / (pages - 1) : 0;
    for (const [dx, dy] of [[4, 4], [30, 20], [60, 60], [10, 120]]) {
      let range = null;
      if (frameDoc.caretRangeFromPoint) range = frameDoc.caretRangeFromPoint(margin + dx, margin + dy);
      else if (frameDoc.caretPositionFromPoint) {
        const pos = frameDoc.caretPositionFromPoint(margin + dx, margin + dy);
        if (pos) { range = frameDoc.createRange(); range.setStart(pos.offsetNode, pos.offset); }
      }
      if (range && range.startContainer && frameDoc.querySelector('.epub-root').contains(range.startContainer)) return { range, fraction };
    }
    return { range: null, fraction };
  }

  function restoreAnchor(anchor) {
    if (!anchor) return;
    if (anchor.range) {
      const r = anchor.range.cloneRange();
      try {
        r.setEnd(r.startContainer, Math.min(r.startOffset + 1, r.startContainer.length || r.startOffset));
        const target = r.getClientRects().length ? r : (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement);
        const p = pageOf(target);
        if (Number.isFinite(p)) { goTo(p); return; }
      } catch (_) { /* fall back to the fraction */ }
    }
    goTo(Math.round(anchor.fraction * (pages - 1)));
  }

  function jumpTo(id) {
    const el = frameDoc && frameDoc.getElementById(id);
    if (el) goTo(pageOf(el));
  }

  function layoutSheet() {
    const { pageW, pageH } = geometry();
    const stage = $('stage');
    const fit = Math.min((stage.clientWidth - 24) / pageW, (stage.clientHeight - 24) / pageH);
    const scale = viewScale || Math.max(0.1, fit);
    frame.style.width = `${pageW}px`;
    frame.style.height = `${pageH}px`;
    frame.style.transform = `scale(${scale})`;
    $('sheet').style.width = `${pageW * scale}px`;
    $('sheet').style.height = `${pageH * scale}px`;
    $('viewFit').textContent = viewScale ? `${Math.round(scale * 100)}%` : 'Fit';
    $('viewFit').dataset.scale = scale;
  }

  function setViewScale(s) {
    viewScale = s ? Math.min(5, Math.max(0.2, s)) : 0;
    layoutSheet();
  }

  // (Re)build the book from the extracted PDF data and show it.
  async function rebuild() {
    const fraction = pages > 1 ? page / (pages - 1) : 0;
    const keepPlace = !!frameDoc;
    status('Building the book…');
    await new Promise((r) => setTimeout(r, 0));
    structured = PdfStructure.buildBook(extracted, settings);
    if ($('title').value.trim()) structured.title = $('title').value.trim();
    if ($('author').value.trim()) structured.author = $('author').value.trim();
    const epub = await EpubBuild.buildEpub(structured, {}, { includeCover: settings.includeCover });
    previewBook = await R.loadEpub(epub);
    showStats();
    fillToc();
    $('dropzone').hidden = true;
    $('stage').hidden = false;
    $('pager').hidden = false;
    layoutSheet();
    await new Promise((res) => { frame.onload = res; frame.srcdoc = R.buildHtml(previewBook, settings, 'preview'); });
    frameDoc = frame.contentDocument;
    await R.whenReady(frameDoc);
    wireFrame();
    page = 0;
    applyStyles();
    goTo(keepPlace ? Math.round(fraction * (pages - 1)) : 0);
    $('download').disabled = false;
    status('');
  }

  function showStats() {
    const s = structured.stats;
    const n = (k, word) => `${k} ${word}${k === 1 ? '' : 's'}`;
    $('stats').textContent = `${n(s.pages, 'PDF page')} → ${n(structured.chapters.length, 'chapter')}, ${n(s.headings, 'heading')}, ` +
      `${n(s.paragraphs, 'paragraph')}, ${n(s.images, 'picture')}`;
    $('scanWarn').hidden = !s.scannedPages;
    $('scanWarn').textContent = s.scannedPages
      ? `${s.scannedPages} page${s.scannedPages > 1 ? 's have' : ' has'} no text layer (scanned). They are kept as pictures; run the PDF through OCR first to get reflowable text.`
      : '';
  }

  function wireFrame() {
    frameDoc.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      e.preventDefault();
      const href = a.getAttribute('href');
      if (href.startsWith('#')) jumpTo(decodeURIComponent(href.slice(1)));
      else if (/^https?:/i.test(href)) window.open(href, '_blank', 'noopener');
    });
    frameDoc.addEventListener('wheel', onWheel, { passive: false });
    frameDoc.addEventListener('keydown', onKey);
    // touch: swipe to turn pages, pinch to zoom the text
    let t0 = null;
    frameDoc.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) t0 = { pinch: dist(e.touches), zoom: settings.zoom };
      else if (e.touches.length === 1) t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });
    frameDoc.addEventListener('touchmove', (e) => {
      if (t0 && t0.pinch && e.touches.length === 2) {
        e.preventDefault();
        t0.ratio = dist(e.touches) / t0.pinch;
        $('zoomVal').textContent = `${Math.round(t0.zoom * t0.ratio * 100)}%`;
      }
    }, { passive: false });
    frameDoc.addEventListener('touchend', (e) => {
      if (!t0) return;
      if (t0.pinch && t0.ratio) setZoom(t0.zoom * t0.ratio);
      else if (t0.x !== undefined && e.changedTouches.length) {
        const dx = e.changedTouches[0].clientX - t0.x;
        const dy = e.changedTouches[0].clientY - t0.y;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) goTo(page + (dx < 0 ? 1 : -1));
      }
      t0 = null;
    });
  }
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  // Ctrl + wheel (and trackpad pinch, which browsers report as Ctrl + wheel) changes the text zoom.
  let wheelAcc = 0;
  function onWheel(e) {
    if (!frameDoc) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom(settings.zoom * Math.exp(-Math.max(-50, Math.min(50, e.deltaY)) * 0.0025)); // ≈12% per wheel notch
      return;
    }
    if (viewScale) return; // magnified view: let the stage scroll
    e.preventDefault();
    wheelAcc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(wheelAcc) > 80) { goTo(page + Math.sign(wheelAcc)); wheelAcc = 0; }
  }

  function onKey(e) {
    if (!frameDoc || (e.target.matches && e.target.matches('input, select, textarea'))) return;
    const k = e.key;
    if (['ArrowRight', 'PageDown', ' '].includes(k)) goTo(page + 1);
    else if (['ArrowLeft', 'PageUp'].includes(k)) goTo(page - 1);
    else if (k === 'Home') goTo(0);
    else if (k === 'End') goTo(pages - 1);
    else if (k === '+' || k === '=') setZoom(settings.zoom + 0.1);
    else if (k === '-' || k === '_') setZoom(settings.zoom - 0.1);
    else if (k === 'i' || k === 'I') update({ theme: settings.theme === 'invert' ? 'original' : 'invert' }, true);
    else return;
    e.preventDefault();
  }

  // ---- loading ------------------------------------------------------------------------------------------------
  function status(msg) {
    $('status').hidden = !msg;
    $('status').textContent = msg;
  }

  async function open(file) {
    if (!file) return;
    try {
      status(`Opening ${file.name}…`);
      const data = new Uint8Array(await file.arrayBuffer());
      let password;
      for (;;) {
        try {
          extracted = await PdfExtract.extractPdf(data.slice(), {
            keepImages: true,
            password,
            onProgress: (f, msg) => status(`${msg} (${Math.round(f * 100)}%)`),
          });
          break;
        } catch (err) {
          if (err && err.name === 'PasswordException') {
            password = window.prompt(err.code === 2 ? 'Wrong password. Try again:' : 'This PDF is protected. Password:');
            if (password === null) { status(''); return; }
          } else throw err;
        }
      }
      fileName = file.name.replace(/\.pdf$/i, '');
      $('title').value = extracted.title || fileName;
      $('author').value = extracted.author || '';
      $('bookInfo').hidden = false;
      frameDoc = null;
      pages = 1;
      await rebuild();
      $('bookTitle').textContent = structured.author ? `${structured.title} — ${structured.author}` : structured.title;
      document.title = `${structured.title} · PDF to EPUB`;
    } catch (err) {
      console.error(err);
      status(`Could not convert this file: ${err.message || err}`);
    }
  }

  function fillToc() {
    const sel = $('toc');
    sel.length = 1;
    for (const t of previewBook.toc) sel.add(new Option(`${' '.repeat(Math.min(t.depth, 4))}${t.label}`, t.target));
    sel.hidden = previewBook.toc.length === 0;
  }

  // ---- export -----------------------------------------------------------------------------------------------
  async function download() {
    if (!structured) return;
    status('Writing the EPUB…');
    try {
      const book = Object.assign({}, structured, {
        title: $('title').value.trim() || structured.title,
        author: $('author').value.trim(),
      });
      const appearance = settings.bake
        ? { theme: settings.theme, fg: settings.fg, bg: settings.bg, invertImages: settings.invertImages, zoom: settings.zoom, font: settings.font, lineHeight: settings.lineHeight, justify: settings.justify }
        : {};
      const blob = await EpubBuild.buildEpub(book, appearance, { includeCover: settings.includeCover, type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${(book.title || fileName).replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 120) || 'book'}.epub`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      status('');
    } catch (err) {
      console.error(err);
      status(`Could not write the EPUB: ${err.message || err}`);
    }
  }

  // ---- wiring -------------------------------------------------------------------------------------------------
  $('file').addEventListener('change', (e) => open(e.target.files[0]));
  const viewer = $('viewer');
  ['dragenter', 'dragover'].forEach((t) => viewer.addEventListener(t, (e) => { e.preventDefault(); viewer.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((t) => viewer.addEventListener(t, (e) => { e.preventDefault(); viewer.classList.remove('drag'); }));
  viewer.addEventListener('drop', (e) => open(e.dataTransfer.files[0]));

  $('zoom').addEventListener('input', (e) => update({ zoom: e.target.value / 100 }));
  $('zoomIn').addEventListener('click', () => setZoom(settings.zoom + 0.1));
  $('zoomOut').addEventListener('click', () => setZoom(settings.zoom - 0.1));
  for (const r of document.querySelectorAll('input[name=theme]')) r.addEventListener('change', () => update({ theme: r.value }, true));
  $('fg').addEventListener('input', (e) => update({ fg: e.target.value, theme: 'custom' }));
  $('bg').addEventListener('input', (e) => update({ bg: e.target.value, theme: 'custom' }));
  $('invertImages').addEventListener('change', (e) => update({ invertImages: e.target.checked }, true));
  pageSel.addEventListener('change', () => update({ page: pageSel.value }, true));
  $('margin').addEventListener('input', (e) => update({ margin: +e.target.value }));
  $('font').addEventListener('change', (e) => update({ font: e.target.value }, true));
  $('lineHeight').addEventListener('change', (e) => update({ lineHeight: +e.target.value }, true));
  $('justify').addEventListener('change', (e) => update({ justify: e.target.checked }, true));
  $('bake').addEventListener('change', (e) => update({ bake: e.target.checked }));
  for (const k of [...CONVERSION_KEYS, 'includeCover']) {
    $(k).addEventListener('change', (e) => {
      settings[k] = e.target.checked;
      saveSettings();
      if (extracted) rebuild();
    });
  }
  for (const k of ['title', 'author']) {
    $(k).addEventListener('change', () => {
      if (!structured) return;
      structured.title = $('title').value.trim() || structured.title;
      structured.author = $('author').value.trim();
      $('bookTitle').textContent = structured.author ? `${structured.title} — ${structured.author}` : structured.title;
    });
  }

  $('prev').addEventListener('click', () => goTo(page - 1));
  $('next').addEventListener('click', () => goTo(page + 1));
  $('pageNum').addEventListener('change', (e) => goTo(e.target.value - 1));
  $('toc').addEventListener('change', (e) => { if (e.target.value) jumpTo(e.target.value); e.target.value = ''; });
  $('viewIn').addEventListener('click', () => setViewScale(+$('viewFit').dataset.scale * 1.25));
  $('viewOut').addEventListener('click', () => setViewScale(+$('viewFit').dataset.scale / 1.25));
  $('viewFit').addEventListener('click', () => setViewScale(0));
  $('stage').addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('keydown', onKey);
  $('download').addEventListener('click', download);
  window.addEventListener('resize', () => { if (frameDoc) layoutSheet(); });

  syncControls();
  window.PdfToEpubApp = { open, settings, update, goTo, get pages() { return pages; }, get page() { return page; }, get book() { return structured; } };
})();
