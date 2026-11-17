// EPUB -> PDF web app: settings panel, paginated live preview, and PDF export through the browser's print engine.
/* global EpubPdf */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const E = window.EpubPdf;
  const MM = E.MM;
  const STORE_KEY = 'epub-to-pdf-settings';

  let book = null;
  let bookName = 'book';
  let page = 0;
  let pages = 1;
  let viewScale = 0; // 0 = fit to window
  let frameDoc = null;

  // ---- settings ---------------------------------------------------------------------------------------------
  const settings = Object.assign({}, E.DEFAULTS);
  try { Object.assign(settings, JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); } catch (_) { /* private mode */ }
  const saveSettings = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (_) { /* ignore */ } };

  const pageSel = $('page');
  for (const [key, p] of Object.entries(E.PAGE_SIZES)) pageSel.add(new Option(p.label, key));
  pageSel.add(new Option('Custom…', 'custom'));

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
    $('customSize').hidden = settings.page !== 'custom';
    $('pageW').value = Math.round(settings.pageW);
    $('pageH').value = Math.round(settings.pageH);
    $('margin').value = settings.margin;
    $('marginVal').textContent = `${settings.margin} mm`;
    $('chapterBreaks').checked = settings.chapterBreaks;
    $('font').value = settings.font;
    $('lineHeight').value = String(settings.lineHeight);
    $('justify').checked = settings.justify;
    $('bookStyles').checked = settings.bookStyles;
  }

  // Apply a settings change: restyle the preview in place and keep the reader on the same passage.
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
    const o = E.normalizeOptions(settings);
    const margin = o.margin * MM;
    const contentW = (o.pageW - 2 * o.margin) * MM;
    return { o, margin, contentW, step: contentW + 2 * margin, pageW: o.pageW * MM, pageH: o.pageH * MM };
  }

  function applyStyles() {
    const css = E.buildCss(book, settings, 'preview');
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
        const rects = r.getClientRects();
        const target = rects.length ? r : (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement);
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

  async function showBook() {
    status('Laying out pages…');
    $('dropzone').hidden = true;
    $('stage').hidden = false;
    $('pager').hidden = false;
    layoutSheet();
    await new Promise((res) => { frame.onload = res; frame.srcdoc = E.buildHtml(book, settings, 'preview'); });
    frameDoc = frame.contentDocument;
    await E.whenReady(frameDoc);
    wireFrame();
    page = 0;
    applyStyles();
    goTo(0);
    $('save').disabled = false;
    status('');
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
        const ratio = dist(e.touches) / t0.pinch;
        $('zoomVal').textContent = `${Math.round(t0.zoom * ratio * 100)}%`;
        t0.ratio = ratio;
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
    if (!book || e.target.matches && e.target.matches('input, select, textarea')) return;
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
      const data = await file.arrayBuffer();
      book = await E.loadEpub(data, (f, msg) => status(`${msg} (${Math.round(f * 100)}%)`));
      bookName = file.name.replace(/\.epub$/i, '');
      $('bookTitle').textContent = book.author ? `${book.title} — ${book.author}` : book.title;
      document.title = `${book.title} · EPUB to PDF`;
      fillToc();
      await showBook();
    } catch (err) {
      console.error(err);
      status(`Could not open this file: ${err.message}`);
    }
  }

  function fillToc() {
    const sel = $('toc');
    sel.length = 1;
    const entries = book.toc.length ? book.toc
      : book.chapters.filter((c) => c.label).map((c) => ({ label: c.label, target: `c${c.index}`, depth: 0 }));
    for (const t of entries) sel.add(new Option(`${' '.repeat(Math.min(t.depth, 4))}${t.label}`, t.target));
    sel.hidden = entries.length === 0;
  }

  // ---- export -----------------------------------------------------------------------------------------------
  async function savePdf() {
    if (!book) return;
    status('Preparing the PDF…');
    const old = document.getElementById('printFrame');
    if (old) old.remove();
    const pf = document.createElement('iframe');
    pf.id = 'printFrame';
    pf.setAttribute('aria-hidden', 'true');
    pf.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(pf);
    await new Promise((res) => { pf.onload = res; pf.srcdoc = E.buildHtml(book, settings, 'print'); });
    await E.whenReady(pf.contentDocument);
    status('');
    // Browsers name the PDF after the page title.
    const prevTitle = document.title;
    document.title = bookName;
    const restore = () => { document.title = prevTitle; };
    pf.contentWindow.addEventListener('afterprint', restore, { once: true });
    pf.contentWindow.focus();
    pf.contentWindow.print();
    setTimeout(restore, 1000);
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
  pageSel.addEventListener('change', () => {
    const p = E.PAGE_SIZES[pageSel.value];
    update(p ? { page: pageSel.value } : { page: 'custom', pageW: settings.pageW, pageH: settings.pageH }, true);
  });
  $('pageW').addEventListener('change', (e) => update({ page: 'custom', pageW: +e.target.value }, true));
  $('pageH').addEventListener('change', (e) => update({ page: 'custom', pageH: +e.target.value }, true));
  $('margin').addEventListener('input', (e) => update({ margin: +e.target.value }));
  $('chapterBreaks').addEventListener('change', (e) => update({ chapterBreaks: e.target.checked }, true));
  $('font').addEventListener('change', (e) => update({ font: e.target.value }, true));
  $('lineHeight').addEventListener('change', (e) => update({ lineHeight: +e.target.value }, true));
  $('justify').addEventListener('change', (e) => update({ justify: e.target.checked }, true));
  $('bookStyles').addEventListener('change', (e) => update({ bookStyles: e.target.checked }, true));

  $('prev').addEventListener('click', () => goTo(page - 1));
  $('next').addEventListener('click', () => goTo(page + 1));
  $('pageNum').addEventListener('change', (e) => goTo(e.target.value - 1));
  $('toc').addEventListener('change', (e) => { if (e.target.value) jumpTo(e.target.value); e.target.value = ''; });
  $('viewIn').addEventListener('click', () => setViewScale(+$('viewFit').dataset.scale * 1.25));
  $('viewOut').addEventListener('click', () => setViewScale(+$('viewFit').dataset.scale / 1.25));
  $('viewFit').addEventListener('click', () => setViewScale(0));
  $('stage').addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('keydown', onKey);
  $('save').addEventListener('click', savePdf);
  window.addEventListener('resize', () => { if (frameDoc) layoutSheet(); });

  syncControls();
  window.EpubPdfApp = { open, settings, update, goTo, get pages() { return pages; }, get page() { return page; } };
})();
