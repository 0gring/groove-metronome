// PDF -> text lines and pictures, using pdf.js.
// A PDF only knows where each piece of text sits on the page. This file turns those pieces into lines with
// positions, font sizes, bold/italic/superscript runs and writing direction, and captures the pictures as
// images. structure.js then rebuilds paragraphs, headings and chapters from these lines.
(function (global) {
  'use strict';

  const BASE = new URL('.', (document.currentScript && document.currentScript.src) || location.href).href;
  let pdfjsPromise = null;
  function loadPdfjs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import(`${BASE}vendor/pdfjs/pdf.min.mjs`).then((lib) => {
        lib.GlobalWorkerOptions.workerSrc = `${BASE}vendor/pdfjs/pdf.worker.min.mjs`;
        return lib;
      });
    }
    return pdfjsPromise;
  }

  const RTL_CHARS = /[֐-ࣿיִ-﷿ﹰ-﻿]/g;
  const LTR_CHARS = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/g;
  const count = (s, re) => (s.match(re) || []).length;

  // ---------------------------------------------------------------------------------------------------------
  async function extractPdf(data, options) {
    const o = Object.assign({ imageScale: 2.5, keepImages: true, password: undefined, onProgress: () => {} }, options);
    const pdfjs = await loadPdfjs();
    const task = pdfjs.getDocument({
      data,
      password: o.password,
      isEvalSupported: false,
      cMapUrl: `${BASE}vendor/pdfjs/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${BASE}vendor/pdfjs/standard_fonts/`,
    });
    const pdf = await task.promise;

    let info = {};
    try { info = (await pdf.getMetadata()).info || {}; } catch (_) { /* no metadata */ }

    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      o.onProgress((n - 1) / pdf.numPages, `Reading page ${n} of ${pdf.numPages}`);
      const page = await pdf.getPage(n);
      pages.push(await extractPage(pdfjs, page, o));
      page.cleanup();
    }

    const outline = await readOutline(pdf, pages);
    let cover = null;
    try {
      const first = await pdf.getPage(1);
      cover = await renderToDataUrl(first, 1.6, null, 0.9);
    } catch (_) { /* no cover */ }
    o.onProgress(1, 'Done');
    const result = {
      title: (info.Title || '').trim(),
      author: (info.Author || '').trim(),
      language: (info.Language || '').trim(),
      numPages: pdf.numPages,
      pages,
      outline,
      cover,
    };
    await pdf.destroy();
    return result;
  }

  // ---------------------------------------------------------------------------------------------------------
  async function extractPage(pdfjs, page, o) {
    const opList = await page.getOperatorList(); // also loads the fonts, so their names (Bold/Italic) are known
    const tc = await page.getTextContent({ disableNormalization: false });

    // Read the page in the orientation that makes most of its text horizontal. That is usually the page's own
    // rotation, but some PDFs rotate the page without rotating the text (or scan sideways).
    let vp = page.getViewport({ scale: 1 });
    let best = -1;
    for (const rot of [page.rotate, 0, 90, 180, 270]) {
      const v = page.getViewport({ scale: 1, rotation: rot });
      let score = 0;
      for (const it of tc.items) {
        if (!it.str || !it.transform) continue;
        const m = pdfjs.Util.transform(v.transform, it.transform);
        if (m[0] > 0 && Math.abs(m[1]) < m[0] * 0.2) score += it.str.length;
      }
      if (score > best) { best = score; vp = v; }
    }
    const rotation = vp.rotation;

    const fontCache = new Map();
    const fontInfo = (name) => {
      if (fontCache.has(name)) return fontCache.get(name);
      let f = null;
      try { f = page.commonObjs.get(name); } catch (_) { /* not loaded */ }
      const style = (tc.styles && tc.styles[name]) || {};
      const fullName = `${(f && f.name) || ''} ${style.fontFamily || ''}`;
      const res = {
        bold: !!(f && (f.bold || f.black)) || /bold|black|heavy|semibold|demi|\bw[6-9]\b/i.test(fullName),
        italic: !!(f && f.italic) || /italic|oblique|\bit\b/i.test(fullName),
        mono: /mono|courier|consol/i.test(fullName),
      };
      fontCache.set(name, res);
      return res;
    };

    // 1. text pieces in page coordinates (top-left origin, CSS-like)
    const pieces = [];
    for (const it of tc.items) {
      if (typeof it.str !== 'string') continue;
      // measured after the page's own rotation, so landscape / rotated pages read normally
      const [a, b, c, d, x, y] = pdfjs.Util.transform(vp.transform, it.transform);
      const size = Math.hypot(c, d) || Math.hypot(a, b) || it.height || 10;
      if (Math.abs(b) > Math.abs(a) * 0.2) continue; // rotated text (margin notes, watermarks)
      const width = it.width;
      if (!it.str && !it.hasEOL) continue;
      pieces.push({ text: it.str, x, base: y, w: width, size, dir: it.dir, font: fontInfo(it.fontName), eol: it.hasEOL });
    }

    // 2. lines: pieces that share a baseline, in content-stream order (which follows columns in most PDFs)
    const lines = [];
    let cur = null;
    for (const p of pieces) {
      if (!p.text.trim()) {
        if (cur && p.text) cur.pieces.push(p);
        continue;
      }
      const sameLine = cur &&
        Math.abs(p.base - cur.base) < Math.max(p.size, cur.size) * 0.55 &&
        p.x < cur.right + cur.size * 3 && p.x + p.w > cur.left - cur.size * 3;
      if (!sameLine) {
        cur = { pieces: [], base: p.base, size: p.size, left: p.x, right: p.x + p.w };
        lines.push(cur);
      }
      cur.pieces.push(p);
      cur.left = Math.min(cur.left, p.x);
      cur.right = Math.max(cur.right, p.x + p.w);
      if (p.size > cur.size * 1.05 && p.text.trim().length > 1) { cur.size = p.size; cur.base = p.base; }
    }

    const outLines = [];
    for (const l of lines) {
      const text = l.pieces.map((p) => p.text).join('');
      const rtl = count(text, RTL_CHARS) > count(text, LTR_CHARS);
      const words = l.pieces.filter((p) => p.text.trim());
      words.sort((p, q) => (rtl ? (q.x + q.w) - (p.x + p.w) : p.x - q.x));
      // body size of the line = size covering most characters
      const sizes = new Map();
      for (const p of words) { const k = Math.round(p.size * 2) / 2; sizes.set(k, (sizes.get(k) || 0) + p.text.length); }
      const lineSize = [...sizes.entries()].sort((x, y) => y[1] - x[1])[0][0];
      const mainBase = (words.find((p) => Math.abs(p.size - lineSize) < 0.6) || words[0]).base;

      const runs = [];
      let prev = null;
      for (const p of words) {
        let t = p.text;
        if (prev) {
          const gap = rtl ? prev.x - (p.x + p.w) : p.x - (prev.x + prev.w);
          if (gap > Math.min(p.size, prev.size) * 0.18 && !/\s$/.test(prev.text) && !/^\s/.test(t)) runs[runs.length - 1].text += ' ';
        }
        const sup = p.size < lineSize * 0.85 && p.base < mainBase - lineSize * 0.15;
        const sub = p.size < lineSize * 0.85 && p.base > mainBase + lineSize * 0.1;
        const style = { b: p.font.bold, i: p.font.italic, m: p.font.mono, sup, sub };
        const last = runs[runs.length - 1];
        if (last && last.b === style.b && last.i === style.i && last.m === style.m && last.sup === style.sup && last.sub === style.sub) last.text += t;
        else runs.push(Object.assign({ text: t }, style));
        prev = p;
      }
      runs.forEach((r) => { r.text = r.text.replace(/\s+/g, ' '); });
      if (runs.length) { runs[0].text = runs[0].text.replace(/^\s+/, ''); runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, ''); }
      const lineText = runs.map((r) => r.text).join('');
      if (!lineText) continue;
      outLines.push({
        runs,
        text: lineText,
        size: lineSize,
        base: mainBase,
        top: mainBase - lineSize * 0.8,
        bottom: mainBase + lineSize * 0.25,
        left: l.left,
        right: l.right,
        rtl,
      });
    }

    // 3. pictures: follow the drawing operations to find where each image is painted
    const images = [];
    const textChars = outLines.reduce((s, l) => s + l.text.length, 0);
    const OPS = pdfjs.OPS;
    const Util = pdfjs.Util;
    let ctm = vp.transform.slice();
    const stack = [];
    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i];
      const args = opList.argsArray[i];
      if (fn === OPS.save) stack.push(ctm);
      else if (fn === OPS.restore) ctm = stack.pop() || ctm;
      else if (fn === OPS.transform) ctm = Util.transform(ctm, args);
      else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); if (args && args[0]) ctm = Util.transform(ctm, args[0]); }
      else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || ctm;
      else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageXObjectRepeat || fn === OPS.paintImageMaskXObject) {
        const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([px, py]) => Util.applyTransform([px, py], ctm));
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        const box = {
          left: Math.max(0, Math.min(...xs)), right: Math.min(vp.width, Math.max(...xs)),
          top: Math.max(0, Math.min(...ys)), bottom: Math.min(vp.height, Math.max(...ys)),
        };
        if (box.right - box.left < 16 || box.bottom - box.top < 16) continue; // bullets, rules, specks
        images.push(box);
      }
    }

    // merge overlapping boxes (pictures made of tiles)
    const merged = [];
    for (const b of images.sort((p, q) => p.top - q.top)) {
      const m = merged.find((x) => b.left < x.right + 2 && b.right > x.left - 2 && b.top < x.bottom + 2 && b.bottom > x.top - 2);
      if (m) { m.left = Math.min(m.left, b.left); m.right = Math.max(m.right, b.right); m.top = Math.min(m.top, b.top); m.bottom = Math.max(m.bottom, b.bottom); } else merged.push(Object.assign({}, b));
    }

    const pageArea = vp.width * vp.height;
    const scanned = textChars < 20;
    let pics = merged.filter((b) => {
      const area = (b.right - b.left) * (b.bottom - b.top);
      // a picture covering the whole page behind real text is a background (or a scan with a text layer)
      return scanned || area < pageArea * 0.8;
    });
    if (!o.keepImages) pics = [];

    if (scanned && (pics.length || textChars === 0)) {
      // a page without text (a scan or a full-page illustration): keep the whole page as one picture
      pics = [{ left: 0, top: 0, right: vp.width, bottom: vp.height, fullPage: true }];
    }

    if (pics.length) {
      const canvas = await renderPage(page, o.imageScale, rotation);
      for (const b of pics) {
        b.src = cropToDataUrl(canvas, b, o.imageScale);
        b.width = Math.round((b.right - b.left) * o.imageScale);
        b.height = Math.round((b.bottom - b.top) * o.imageScale);
      }
      canvas.width = canvas.height = 0;
    }

    return { width: vp.width, height: vp.height, rotation, lines: outLines, images: pics, scanned };
  }

  async function renderPage(page, scale, rotation) {
    const vp = page.getViewport(rotation === undefined ? { scale } : { scale, rotation });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return canvas;
  }

  function cropToDataUrl(canvas, b, scale) {
    const sx = Math.floor(b.left * scale);
    const sy = Math.floor(b.top * scale);
    const w = Math.max(1, Math.ceil((b.right - b.left) * scale));
    const h = Math.max(1, Math.ceil((b.bottom - b.top) * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(canvas, sx, sy, w, h, 0, 0, w, h);
    // photos compress far better as JPEG; small drawings stay sharp as PNG
    const url = w * h > 250000 ? c.toDataURL('image/jpeg', 0.92) : c.toDataURL('image/png');
    c.width = c.height = 0;
    return url;
  }

  async function renderToDataUrl(page, scale, box, quality) {
    const canvas = await renderPage(page, scale);
    const url = canvas.toDataURL('image/jpeg', quality);
    canvas.width = canvas.height = 0;
    return url;
  }

  // The PDF's bookmarks, resolved to page + vertical position.
  async function readOutline(pdf, pages) {
    let outline = null;
    try { outline = await pdf.getOutline(); } catch (_) { return []; }
    if (!outline) return [];
    const out = [];
    const walk = async (items, depth) => {
      for (const it of items) {
        try {
          let dest = it.dest;
          if (typeof dest === 'string') dest = await pdf.getDestination(dest);
          if (Array.isArray(dest) && dest[0]) {
            const pageIndex = typeof dest[0] === 'object' ? await pdf.getPageIndex(dest[0]) : dest[0];
            const pg = pages[pageIndex];
            let top = 0;
            if (pg && dest[1] && dest[1].name === 'XYZ' && typeof dest[3] === 'number') top = Math.max(0, pg.height - dest[3]);
            if (it.title && it.title.trim()) out.push({ title: it.title.replace(/\s+/g, ' ').trim(), depth, page: pageIndex, top });
          }
        } catch (_) { /* unresolvable bookmark */ }
        if (it.items && it.items.length) await walk(it.items, depth + 1);
      }
    };
    await walk(outline, 0);
    return out;
  }

  global.PdfExtract = { extractPdf, loadPdfjs };
})(typeof window !== 'undefined' ? window : globalThis);
