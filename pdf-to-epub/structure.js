// Text lines from pdf-extract.js -> a reflowable book: paragraphs, headings, pictures and chapters.
// Pure data in, data out (no DOM), so it re-runs instantly when a conversion option changes.
(function (global) {
  'use strict';

  const DEFAULTS = {
    removeHeadersFooters: true,
    detectHeadings: true,
    joinHyphens: true,
    keepImages: true,
    useOutline: true,
    splitChapters: true,
  };

  const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const norm = (s) => s.toLowerCase().replace(/[\d\s.,;:!?'"“”‘’()[\]\-–—_]+/g, '');
  const SENTENCE_END = /[.!?:;"”’»)\]…。！？]$/;
  const BULLET = /^([•●○◦▪▫■□‣⁃∙·*–—-]\s|\(?\d{1,3}[.)]\s|\(?[a-z][.)]\s|[ivx]{1,4}[.)]\s)/i;
  const PAGE_NUMBER = /^[\s\-–—|[\]()]*(page\s*)?([\divxlc]{1,6}|\d+\s*(of|\/)\s*\d+)[\s\-–—|[\]()]*$/i;

  function buildBook(doc, options) {
    const o = Object.assign({}, DEFAULTS, options);
    const pages = doc.pages;

    // ---- body text size (the size most characters use) --------------------------------------------------------
    const sizeChars = new Map();
    for (const p of pages) for (const l of p.lines) { const k = Math.round(l.size * 2) / 2; sizeChars.set(k, (sizeChars.get(k) || 0) + l.text.length); }
    const bodySize = sizeChars.size ? [...sizeChars.entries()].sort((a, b) => b[1] - a[1])[0][0] : 11;

    // ---- running headers / footers and page numbers -----------------------------------------------------------
    const drop = new Set();
    if (o.removeHeadersFooters) {
      const zone = (p, l) => (l.bottom < p.height * 0.1 ? 'top' : l.top > p.height * 0.9 ? 'bottom' : null);
      const seen = new Map();
      pages.forEach((p) => {
        const keys = new Set();
        for (const l of p.lines) {
          const z = zone(p, l);
          if (!z) continue;
          const key = `${z}|${l.text.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase()}`;
          if (!keys.has(key)) { keys.add(key); seen.set(key, (seen.get(key) || 0) + 1); }
        }
      });
      const minRepeats = Math.max(2, Math.ceil(pages.length * 0.3));
      for (const p of pages) {
        for (const l of p.lines) {
          const z = zone(p, l);
          if (!z) continue;
          const key = `${z}|${l.text.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase()}`;
          if ((pages.length >= 3 && seen.get(key) >= minRepeats) || PAGE_NUMBER.test(l.text)) drop.add(l);
        }
      }
    }

    // ---- typical line spacing (relative to the font size) --------------------------------------------------------
    const gaps = [];
    for (const p of pages) {
      for (let i = 1; i < p.lines.length; i++) {
        const a = p.lines[i - 1];
        const b = p.lines[i];
        const g = b.base - a.base;
        if (g > 0 && g < a.size * 3 && Math.abs(a.size - b.size) < 0.6) gaps.push(g / a.size);
      }
    }
    const lineGap = median(gaps) || 1.2;

    // ---- outline (bookmarks) -> headings ------------------------------------------------------------------------
    const outlineMarks = new Map(); // line -> level
    const outlineInserts = []; // headings with no matching line
    if (o.useOutline && doc.outline && doc.outline.length) {
      for (const e of doc.outline) {
        const p = pages[e.page];
        if (!p) continue;
        const want = norm(e.title);
        const level = Math.min(6, e.depth + 1);
        const cand = p.lines.filter((l) => !drop.has(l) && l.bottom >= e.top - 4);
        const hit = cand.slice(0, 12).find((l) => {
          const t = norm(l.text);
          return t && want && (t.startsWith(want.slice(0, 24)) || want.startsWith(t));
        });
        if (hit && !outlineMarks.has(hit)) outlineMarks.set(hit, level);
        else if (!hit) outlineInserts.push({ page: e.page, top: e.top, title: e.title, level });
      }
    }
    const outlineDepth = outlineMarks.size ? Math.max(...outlineMarks.values()) : 0;

    // ---- heading levels from font sizes ---------------------------------------------------------------------------
    const headingSizes = [...sizeChars.keys()].filter((s) => s >= bodySize * 1.18).sort((a, b) => b - a);
    const sizeLevel = (s) => {
      const i = headingSizes.findIndex((h) => Math.abs(h - s) < 0.6);
      return i < 0 ? 0 : Math.min(6, outlineDepth + 1 + Math.min(i, 3));
    };

    // ---- walk every page: lines + pictures in reading order -> blocks ---------------------------------------------
    const blocks = [];
    let para = null; // { lines: [] }

    // ---- columns ------------------------------------------------------------------------------------------------
    // Positions are measured from where the writing starts: the left edge for left-to-right lines, the right
    // edge for right-to-left lines. Each page's columns are found from where its body lines start, and every
    // line is then judged against its own column (is it indented? does it stop short of the column's end?).
    const startOf = (l, w) => (l.rtl ? w - l.right : l.left);
    const endOf = (l, w) => (l.rtl ? w - l.left : l.right);
    const isBody = (l) => !drop.has(l) && Math.abs(l.size - bodySize) < 1;
    const pct = (arr, q) => { const s = [...arr].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };

    function findColumns(lines, w) {
      const body = lines.filter(isBody).sort((a, b) => startOf(a, w) - startOf(b, w));
      if (body.length < 4) return null;
      const clusters = [];
      for (const l of body) {
        const st = startOf(l, w);
        const c = clusters[clusters.length - 1];
        if (c && st < c.min + bodySize * 3) c.lines.push(l);
        else clusters.push({ min: st, lines: [l] });
      }
      const cols = clusters.filter((c) => c.lines.length >= Math.max(3, body.length * 0.12));
      if (!cols.length) return null;
      return cols.map((c, i) => {
        const next = cols[i + 1];
        // lines that run into the next column are full-width lines, not part of this column
        const own = c.lines.filter((l) => !next || endOf(l, w) < next.min - bodySize * 0.5);
        const starts = (own.length ? own : c.lines).map((l) => startOf(l, w));
        const ends = (own.length ? own : c.lines).map((l) => endOf(l, w));
        return { start: pct(starts, 0.25), end: pct(ends, 0.8) };
      });
    }

    const allBody = pages.flatMap((p) => p.lines.filter(isBody).map((l) => ({ st: startOf(l, p.width), en: endOf(l, p.width) })));
    const docColumn = allBody.length
      ? { start: pct(allBody.map((x) => x.st), 0.25), end: pct(allBody.map((x) => x.en), 0.8) }
      : { start: 0, end: pages[0] ? pages[0].width : 600 };
    const colOf = new Map();
    for (const p of pages) {
      const cols = findColumns(p.lines, p.width) || [docColumn];
      for (const l of p.lines) {
        const st = startOf(l, p.width);
        let col = cols[0];
        for (const c of cols) if (c.start <= st + bodySize) col = c;
        // a line that reaches past its column's end belongs to a full-width block
        if (endOf(l, p.width) > col.end + bodySize * 2) col = { start: col.start, end: Math.max(...cols.map((c) => c.end)) };
        colOf.set(l, { start: col.start, end: col.end, w: p.width });
      }
    }
    const geo = (l) => {
      const c = colOf.get(l);
      return { start: startOf(l, c.w), end: endOf(l, c.w), colStart: c.start, colEnd: c.end };
    };
    const isCentered = (l) => {
      const g = geo(l);
      return Math.abs((g.start + g.end) / 2 - (g.colStart + g.colEnd) / 2) < bodySize * 1.2 &&
        g.end - g.start < (g.colEnd - g.colStart) * 0.8 && g.start > g.colStart + bodySize;
    };

    const flush = () => { if (para) { blocks.push(finishParagraph(para)); para = null; } };

    function finishParagraph(pr) {
      const runs = [];
      pr.lines.forEach((l, i) => {
        const lr = l.runs.map((r) => Object.assign({}, r));
        if (i > 0) {
          const prev = runs[runs.length - 1];
          const first = lr[0];
          if (o.joinHyphens && prev && /\p{L}[-\u2010\u00AD]$/u.test(prev.text) && /^\p{Ll}/u.test(first.text)) {
            prev.text = prev.text.slice(0, -1); // re-join a word the PDF split at the line end
          } else if (prev && !/[\s­]$/.test(prev.text) && !/^\s/.test(first.text)) {
            prev.text += ' ';
          }
          if (prev && prev.text.endsWith('­')) prev.text = prev.text.slice(0, -1);
        }
        for (const r of lr) {
          const last = runs[runs.length - 1];
          if (last && last.b === r.b && last.i === r.i && last.m === r.m && last.sup === r.sup && last.sub === r.sub) last.text += r.text;
          else runs.push(r);
        }
      });
      const text = runs.map((r) => r.text).join('');
      const first = pr.lines[0];
      const rtl = pr.lines.filter((l) => l.rtl).length > pr.lines.length / 2;
      let level = pr.outlineLevel || 0;
      if (!level && o.detectHeadings && text.length < 220) {
        level = sizeLevel(first.size);
        // a short, all-bold line standing on its own, at body size or bigger
        if (!level && pr.lines.length <= 2 && text.length < 90 && first.size >= bodySize - 0.3 &&
            runs.every((r) => r.b || !r.text.trim()) && !/[.,;]$/.test(text) && pr.standalone) {
          level = Math.min(4, Math.max(2, outlineDepth + headingSizes.length + 1));
        }
      }
      const centered = pr.lines.length <= 3 && pr.lines.every(isCentered);
      if (level) return { type: 'h', level, runs: runs.map((r) => Object.assign(r, { b: false })), text, rtl, centered, size: first.size, fromOutline: !!pr.outlineLevel };
      return { type: 'p', runs, text, rtl, centered, size: first.size / bodySize };
    }

    pages.forEach((p, pi) => {
      const items = [];
      for (const l of p.lines) if (!drop.has(l)) items.push({ kind: 'line', l, top: l.top });
      if (o.keepImages) for (const im of p.images) items.push({ kind: 'img', im, top: im.top });
      for (const ins of outlineInserts.filter((x) => x.page === pi)) items.push({ kind: 'outline', ins, top: ins.top - 0.5 });
      // Lines keep their stream order (it follows columns); pictures and missing bookmarks are slotted in
      // before the first line that sits below them.
      const lineItems = items.filter((x) => x.kind === 'line');
      const extras = items.filter((x) => x.kind !== 'line').sort((a, b) => a.top - b.top);
      const ordered = [];
      let ei = 0;
      for (const li of lineItems) {
        while (ei < extras.length && extras[ei].top <= li.top) ordered.push(extras[ei++]);
        ordered.push(li);
      }
      while (ei < extras.length) ordered.push(extras[ei++]);

      let prevLine = null;
      for (const it of ordered) {
        if (it.kind === 'img') {
          flush();
          blocks.push({ type: 'img', src: it.im.src, width: it.im.width, height: it.im.height, fullPage: !!it.im.fullPage });
          prevLine = null;
          continue;
        }
        if (it.kind === 'outline') {
          flush();
          blocks.push({ type: 'h', level: it.ins.level, runs: [{ text: it.ins.title }], text: it.ins.title, fromOutline: true });
          prevLine = null;
          continue;
        }
        const l = it.l;
        const a = para && para.lines[para.lines.length - 1];
        let brk = !para || outlineMarks.has(l) || para.outlineLevel;
        if (!brk) {
          const samePage = para.page === pi && prevLine;
          const sizeChange = Math.abs(l.size - a.size) > Math.max(0.6, a.size * 0.12);
          const styleChange = (a.runs.every((r) => r.b) !== l.runs.every((r) => r.b)) && (l.text.length < 120 || a.text.length < 120);
          const gap = samePage ? (l.base - a.base) / a.size : lineGap;
          const bigGap = samePage && (gap > lineGap * 1.45 || gap < -0.5);
          const wentUp = samePage && l.base < a.base - a.size * 0.5; // new column
          const gl = geo(l);
          const ga = geo(a);
          const indent = gl.start > gl.colStart + bodySize * 0.9;
          const prevShort = ga.end < ga.colEnd - bodySize * 2.5;
          const centered = isCentered(l);
          brk = sizeChange || styleChange || (bigGap && !wentUp) || BULLET.test(l.text) ||
            // a first-line indent starts a paragraph
            (indent && !centered && (SENTENCE_END.test(a.text) || prevShort)) ||
            // the previous line stopped well before the right edge: end of a paragraph (or a short verse line)
            prevShort;
        }
        if (brk) {
          flush();
          const nextIdx = ordered.indexOf(it) + 1;
          const next = ordered[nextIdx];
          const gapBefore = prevLine ? (l.base - prevLine.base) / prevLine.size : 99;
          const gapAfter = next && next.kind === 'line' ? (next.l.base - l.base) / l.size : 99;
          para = { lines: [l], page: pi, outlineLevel: outlineMarks.get(l) || 0, standalone: gapBefore > lineGap * 1.3 || gapAfter > lineGap * 1.3 };
        } else {
          para.lines.push(l);
        }
        prevLine = l;
      }
    });
    flush();

    // merge consecutive headings of the same level that are one title broken over lines
    const merged = [];
    for (const b of blocks) {
      const last = merged[merged.length - 1];
      if (b.type === 'h' && last && last.type === 'h' && last.level === b.level && !last.fromOutline && last.text.length + b.text.length < 160 && !b.fromOutline && Math.abs((last.size || 0) - (b.size || 0)) < 0.6) {
        last.runs.push({ text: ' ' }, ...b.runs);
        last.text += ` ${b.text}`;
      } else merged.push(b);
    }

    return splitChapters(merged, doc, o);
  }

  function splitChapters(blocks, doc, o) {
    const chapters = [];
    let cur = null;
    const headingLevels = blocks.filter((b) => b.type === 'h').map((b) => b.level);
    const top = headingLevels.length ? Math.min(...headingLevels) : 0;
    const newChapter = (title) => { cur = { title, blocks: [] }; chapters.push(cur); };
    let chars = 0;
    for (const b of blocks) {
      const starts = o.splitChapters && b.type === 'h' && b.level === top && cur && cur.blocks.some((x) => x.type !== 'h');
      const tooBig = o.splitChapters && cur && chars > 120000 && b.type !== 'h';
      if (!cur || starts || tooBig) { newChapter(b.type === 'h' ? b.text : (cur ? `${cur.title} (cont.)` : 'Start')); chars = 0; }
      cur.blocks.push(b);
      chars += (b.text || '').length;
    }
    if (!chapters.length) newChapter('Start');

    const allText = blocks.map((b) => b.text || '').join(' ');
    const rtlChars = (allText.match(/[֐-ࣿיִ-﷿ﹰ-﻿]/g) || []).length;
    const latin = (allText.match(/[A-Za-z]/g) || []).length;
    let lang = doc.language || '';
    if (!lang) {
      if (rtlChars > latin) lang = (allText.match(/[֐-׿]/g) || []).length >= rtlChars / 2 ? 'he' : 'ar';
      else lang = 'en';
    }
    const firstHeading = blocks.find((b) => b.type === 'h');
    return {
      title: doc.title || (firstHeading && firstHeading.text.slice(0, 120)) || 'Untitled',
      author: doc.author || '',
      language: lang,
      rtl: rtlChars > latin,
      chapters,
      cover: doc.cover,
      stats: {
        pages: doc.numPages,
        paragraphs: blocks.filter((b) => b.type === 'p').length,
        headings: blocks.filter((b) => b.type === 'h').length,
        images: blocks.filter((b) => b.type === 'img').length,
        scannedPages: doc.pages.filter((p) => p.scanned).length,
      },
    };
  }

  global.PdfStructure = { buildBook, DEFAULTS };
})(typeof window !== 'undefined' ? window : globalThis);
