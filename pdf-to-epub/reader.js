// EPUB reader used for the live preview: the EPUB is unzipped with JSZip, every chapter is merged into one HTML
// document with its images, fonts and styles inlined, and the document is paginated on screen with CSS columns.
// Colour themes and the text zoom are applied as style sheets that can be swapped in place.
/* global JSZip */
(function (global) {
  'use strict';

  const MM = 96 / 25.4; // CSS px per millimetre

  const PAGE_SIZES = {
    phone: { label: 'Phone (68 × 140 mm)', w: 68, h: 140 },
    ereader: { label: 'E-reader 6″ (90 × 122 mm)', w: 90, h: 122 },
    ereader7: { label: 'E-reader 7″ (107 × 143 mm)', w: 107, h: 143 },
    tablet: { label: 'Tablet 10″ (136 × 217 mm)', w: 136, h: 217 },
    a4: { label: 'A4 (210 × 297 mm)', w: 210, h: 297 },
    a5: { label: 'A5 (148 × 210 mm)', w: 148, h: 210 },
    a6: { label: 'A6 (105 × 148 mm)', w: 105, h: 148 },
    letter: { label: 'US Letter (8.5 × 11 in)', w: 215.9, h: 279.4 },
    '6x9': { label: 'Book 6 × 9 in', w: 152.4, h: 228.6 },
    '5x8': { label: 'Book 5 × 8 in', w: 127, h: 203.2 },
  };

  const THEMES = {
    original: null, // the book's own colours
    invert: { fg: '#ffffff', bg: '#000000', link: '#8ab4ff' },
    dark: { fg: '#e6e6e6', bg: '#1b1b1d', link: '#8ab4ff' },
    sepia: { fg: '#3b2f22', bg: '#f4ecd8', link: '#7a4b12' },
    light: { fg: '#000000', bg: '#ffffff', link: '#1a4fd6' },
  };

  const FONTS = {
    book: null,
    serif: 'Georgia, "Times New Roman", "Noto Serif", "Noto Serif Hebrew", "David Libre", serif',
    sans: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Hebrew", Arial, sans-serif',
    readable: 'Verdana, "DejaVu Sans", "Noto Sans", Tahoma, sans-serif',
    mono: '"SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace',
  };

  const DEFAULTS = {
    page: 'ereader', // key of PAGE_SIZES or 'custom'
    pageW: 148, // mm, used when page === 'custom'
    pageH: 210,
    margin: 6, // mm
    zoom: 1, // text zoom: 1 = 100%. Text reflows, so a bigger zoom spreads the book over more pages.
    theme: 'original', // key of THEMES or 'custom'
    fg: '#ffffff',
    bg: '#000000',
    invertImages: false,
    bookStyles: true,
    font: 'book', // key of FONTS
    lineHeight: 0, // 0 = keep the book's
    justify: false,
    chapterBreaks: true,
  };

  const RTL_LANGS = /^(he|iw|yi|ar|fa|ur|ps|sd|ug|ku|dv|syr)\b/i;
  const MIME = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', svg: 'image/svg+xml',
    webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', ttf: 'font/ttf', otf: 'font/otf',
    woff: 'font/woff', woff2: 'font/woff2', css: 'text/css', mp3: 'audio/mpeg', mp4: 'video/mp4',
  };

  const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '');
  const hasScheme = (u) => /^[a-z][a-z0-9+.-]*:/i.test(u);

  function resolvePath(baseDir, rel) {
    let r = rel.split('#')[0].split('?')[0];
    try { r = decodeURIComponent(r); } catch (_) { /* keep as is */ }
    const full = r.startsWith('/') ? r.slice(1) : baseDir + r;
    const out = [];
    for (const part of full.split('/')) {
      if (part === '..') out.pop();
      else if (part && part !== '.') out.push(part);
    }
    return out.join('/');
  }

  function fragOf(u) {
    const i = u.indexOf('#');
    if (i < 0) return '';
    try { return decodeURIComponent(u.slice(i + 1)); } catch (_) { return u.slice(i + 1); }
  }

  function bytesToBase64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  // ---------------------------------------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------------------------------------

  async function loadEpub(data, onProgress) {
    const progress = onProgress || (() => {});
    const zip = await JSZip.loadAsync(data);
    const lowerIndex = new Map(Object.keys(zip.files).map((k) => [k.toLowerCase(), k]));
    const entry = (p) => zip.file(p) || (lowerIndex.has(p.toLowerCase()) ? zip.file(lowerIndex.get(p.toLowerCase())) : null);
    const readText = async (p) => { const f = entry(p); return f ? f.async('string') : null; };
    const parseXml = (s) => new DOMParser().parseFromString(s, 'application/xml');
    const byTag = (doc, tag) => Array.from(doc.getElementsByTagNameNS('*', tag));

    // container.xml -> OPF
    let opfPath = null;
    const container = await readText('META-INF/container.xml');
    if (container) {
      const rf = byTag(parseXml(container), 'rootfile')[0];
      opfPath = rf && rf.getAttribute('full-path');
    }
    if (!opfPath || !entry(opfPath)) opfPath = Object.keys(zip.files).find((k) => /\.opf$/i.test(k));
    if (!opfPath) throw new Error('This file is not a valid EPUB (no package document found).');
    const opf = parseXml(await readText(opfPath));
    const opfDir = dirOf(opfPath);

    const meta = (tag) => { const el = byTag(opf, tag)[0]; return el ? el.textContent.trim() : ''; };
    const title = meta('title') || 'Untitled';
    const author = byTag(opf, 'creator').map((e) => e.textContent.trim()).filter(Boolean).join(', ');
    const lang = meta('language');

    const manifest = new Map(); // id -> item
    const byPath = new Map(); // path -> item
    for (const it of byTag(opf, 'item')) {
      const item = {
        id: it.getAttribute('id'),
        path: resolvePath(opfDir, it.getAttribute('href') || ''),
        type: (it.getAttribute('media-type') || '').toLowerCase(),
        props: it.getAttribute('properties') || '',
      };
      manifest.set(item.id, item);
      byPath.set(item.path, item);
    }

    const spineEl = byTag(opf, 'spine')[0];
    const ppd = spineEl && spineEl.getAttribute('page-progression-direction');
    const dir = ppd === 'rtl' || (ppd !== 'ltr' && RTL_LANGS.test(lang)) ? 'rtl' : 'ltr';
    const spine = byTag(opf, 'itemref')
      .map((r) => manifest.get(r.getAttribute('idref')))
      .filter((it) => it && /html|xml/.test(it.type) && entry(it.path));

    // Resource inlining ------------------------------------------------------------------------------------
    const dataUrls = new Map();
    async function dataUrl(path) {
      if (dataUrls.has(path)) return dataUrls.get(path);
      const f = entry(path);
      let url = null;
      if (f) {
        const ext = path.split('.').pop().toLowerCase();
        const type = (byPath.get(path) && byPath.get(path).type) || MIME[ext] || 'application/octet-stream';
        url = `data:${type};base64,${bytesToBase64(await f.async('uint8array'))}`;
      }
      dataUrls.set(path, url);
      return url;
    }

    async function inlineCss(cssText, cssDir, seen) {
      // @import: inline the imported sheet (resolved relative to this sheet)
      const imports = [];
      cssText = cssText.replace(/@import\s+(?:url\()?\s*['"]?([^'")\s;]+)['"]?\s*\)?[^;]*;/gi, (m, href) => {
        if (hasScheme(href)) return '';
        imports.push(resolvePath(cssDir, href));
        return '';
      });
      let prefix = '';
      for (const p of imports) {
        if (seen.has(p)) continue;
        seen.add(p);
        const t = await readText(p);
        if (t) prefix += (await inlineCss(t, dirOf(p), seen)) + '\n';
      }
      // url(...) -> data: URLs
      const refs = new Set();
      cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q, u) => { if (!hasScheme(u) && !u.startsWith('#')) refs.add(u); return m; });
      const map = new Map();
      for (const u of refs) map.set(u, await dataUrl(resolvePath(cssDir, u)));
      cssText = cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q, u) => (map.get(u) ? `url("${map.get(u)}")` : m));
      return prefix + cssText;
    }

    // Chapters --------------------------------------------------------------------------------------------
    const chapterIndex = new Map(spine.map((it, i) => [it.path, i]));
    const anchorFor = (path, frag) => {
      const i = chapterIndex.get(path);
      if (i === undefined) return null;
      return frag ? `c${i}__${frag}` : `c${i}`;
    };

    const styles = []; // ordered, de-duplicated
    const styleSeen = new Set();
    const htmlDoc = document.implementation.createHTMLDocument('');
    const chapters = [];
    const XLINK = 'http://www.w3.org/1999/xlink';

    for (let i = 0; i < spine.length; i++) {
      progress((i / spine.length) * 0.95, `Reading chapter ${i + 1} of ${spine.length}`);
      const item = spine[i];
      const base = dirOf(item.path);
      const src = await readText(item.path);
      let doc = new DOMParser().parseFromString(src, 'application/xhtml+xml');
      if (doc.getElementsByTagName('parsererror').length || !doc.body) {
        doc = new DOMParser().parseFromString(src, 'text/html');
      }
      const head = doc.head || doc.querySelector('head');
      const body = doc.body || doc.querySelector('body');
      if (!body) continue;

      // styles referenced by this chapter
      if (head) {
        for (const el of head.querySelectorAll('link, style')) {
          if (el.localName === 'link') {
            if (!/stylesheet/i.test(el.getAttribute('rel') || '')) continue;
            const href = el.getAttribute('href');
            if (!href || hasScheme(href)) continue;
            const p = resolvePath(base, href);
            if (styleSeen.has(p)) continue;
            styleSeen.add(p);
            const t = await readText(p);
            if (t) styles.push(await inlineCss(t, dirOf(p), new Set([p])));
          } else {
            const t = el.textContent;
            if (t && !styleSeen.has(t)) { styleSeen.add(t); styles.push(await inlineCss(t, base, new Set())); }
          }
        }
      }

      for (const s of body.querySelectorAll('script, noscript')) s.remove();

      // images and other media
      const mediaAttrs = [['img', 'src'], ['input', 'src'], ['video', 'poster'], ['source', 'src'], ['audio', 'src'], ['video', 'src']];
      for (const [tag, attr] of mediaAttrs) {
        for (const el of body.getElementsByTagNameNS('*', tag)) {
          const v = el.getAttribute(attr);
          if (v && !hasScheme(v)) {
            const url = await dataUrl(resolvePath(base, v));
            if (url) el.setAttribute(attr, url);
          }
          if (tag === 'img') el.removeAttribute('srcset');
        }
      }
      for (const el of body.getElementsByTagNameNS('*', 'image')) { // SVG <image>
        const v = el.getAttributeNS(XLINK, 'href') || el.getAttribute('href');
        if (v && !hasScheme(v)) {
          const url = await dataUrl(resolvePath(base, v));
          if (url) { el.setAttributeNS(XLINK, 'xlink:href', url); el.setAttribute('href', url); }
        }
      }
      for (const el of body.querySelectorAll('[style*="url("]')) {
        el.setAttribute('style', await inlineCss(el.getAttribute('style'), base, new Set()));
      }

      // ids get a chapter prefix so they stay unique once every chapter lives in one document
      for (const el of body.querySelectorAll('[id]')) el.setAttribute('id', `c${i}__${el.getAttribute('id')}`);
      for (const el of body.getElementsByTagNameNS('*', 'a')) {
        const href = el.getAttribute('href') || el.getAttributeNS(XLINK, 'href');
        if (!href) continue;
        if (hasScheme(href)) { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener'); continue; }
        const target = href.startsWith('#') ? anchorFor(item.path, fragOf(href)) : anchorFor(resolvePath(base, href), fragOf(href));
        if (target) el.setAttribute('href', `#${target}`);
        else el.removeAttribute('href');
        el.removeAttributeNS(XLINK, 'href');
      }

      // serialise with the HTML serializer (an XML serializer would emit <div/>, which HTML mis-parses)
      const section = htmlDoc.createElement('section');
      for (const n of Array.from(body.childNodes)) section.appendChild(htmlDoc.importNode(n, true));
      const firstHeading = section.querySelector('h1, h2, h3, h4, title');
      const label = (firstHeading && firstHeading.textContent.replace(/\s+/g, ' ').trim()) || '';
      chapters.push({
        index: i,
        html: section.innerHTML,
        cls: [body.getAttribute('class') || ''].join(' ').trim(),
        bodyId: body.getAttribute('id') ? `c${i}__${body.getAttribute('id')}` : '',
        style: body.getAttribute('style') || '',
        dir: body.getAttribute('dir') || (doc.documentElement && doc.documentElement.getAttribute('dir')) || '',
        lang: (doc.documentElement && (doc.documentElement.getAttribute('xml:lang') || doc.documentElement.getAttribute('lang'))) || '',
        label,
        textLength: section.textContent.trim().length,
        hasImage: !!section.querySelector('img, svg, image'),
      });
    }

    // Table of contents: EPUB3 nav, else EPUB2 NCX, else chapter headings
    const toc = await readToc({ manifest, opf, byTag, readText, parseXml, anchorFor });
    progress(1, 'Done');
    return { title, author, lang, dir, styles, chapters, toc };
  }

  async function readToc({ manifest, opf, byTag, readText, parseXml, anchorFor }) {
    const items = Array.from(manifest.values());
    const nav = items.find((it) => /\bnav\b/.test(it.props));
    const out = [];
    try {
      if (nav) {
        const doc = new DOMParser().parseFromString(await readText(nav.path), 'application/xhtml+xml');
        const navEl = Array.from(doc.getElementsByTagNameNS('*', 'nav')).find((n) => /toc/.test(n.getAttribute('epub:type') || n.getAttributeNS('http://www.idpf.org/2007/ops', 'type') || '')) ||
          doc.getElementsByTagNameNS('*', 'nav')[0];
        if (navEl) {
          const walk = (ol, depth) => {
            for (const li of Array.from(ol.children).filter((c) => c.localName === 'li')) {
              const a = Array.from(li.children).find((c) => c.localName === 'a' || c.localName === 'span');
              const href = a && a.getAttribute('href');
              const target = href && anchorFor(resolvePath(dirOf(nav.path), href), fragOf(href));
              if (a && target) out.push({ label: a.textContent.replace(/\s+/g, ' ').trim(), target, depth });
              const sub = Array.from(li.children).find((c) => c.localName === 'ol' || c.localName === 'ul');
              if (sub) walk(sub, depth + 1);
            }
          };
          const ol = Array.from(navEl.children).find((c) => c.localName === 'ol' || c.localName === 'ul');
          if (ol) walk(ol, 0);
        }
      }
      if (!out.length) {
        const spine = byTag(opf, 'spine')[0];
        const ncx = manifest.get(spine && spine.getAttribute('toc')) || items.find((it) => it.type === 'application/x-dtbncx+xml');
        if (ncx) {
          const doc = parseXml(await readText(ncx.path));
          const walk = (parent, depth) => {
            for (const np of Array.from(parent.children).filter((c) => c.localName === 'navPoint')) {
              const label = np.getElementsByTagNameNS('*', 'text')[0];
              const content = np.getElementsByTagNameNS('*', 'content')[0];
              const href = content && content.getAttribute('src');
              const target = href && anchorFor(resolvePath(dirOf(ncx.path), href), fragOf(href));
              if (label && target) out.push({ label: label.textContent.replace(/\s+/g, ' ').trim(), target, depth });
              walk(np, depth + 1);
            }
          };
          const navMap = doc.getElementsByTagNameNS('*', 'navMap')[0];
          if (navMap) walk(navMap, 0);
        }
      }
    } catch (_) { /* a broken TOC should never stop the conversion */ }
    return out;
  }

  // ---------------------------------------------------------------------------------------------------------
  // Building the document
  // ---------------------------------------------------------------------------------------------------------

  function normalizeOptions(o) {
    const opts = Object.assign({}, DEFAULTS, o || {});
    const preset = PAGE_SIZES[opts.page];
    if (preset) { opts.pageW = preset.w; opts.pageH = preset.h; }
    opts.pageW = Math.max(40, Number(opts.pageW) || DEFAULTS.pageW);
    opts.pageH = Math.max(40, Number(opts.pageH) || DEFAULTS.pageH);
    opts.margin = Math.min(Math.max(0, Number(opts.margin) || 0), Math.min(opts.pageW, opts.pageH) / 3);
    opts.zoom = Math.min(Math.max(0.3, Number(opts.zoom) || 1), 6);
    return opts;
  }

  function colorsFor(opts) {
    if (opts.theme === 'custom') return { fg: opts.fg, bg: opts.bg, link: opts.fg };
    return THEMES[opts.theme] || null;
  }

  // Book CSS is written for one chapter per document, so `html`/`body` selectors are moved onto our wrappers,
  // and page-level rules that would fight our pagination are dropped.
  function rewriteBookCss(cssText) {
    let sheet;
    try {
      sheet = new CSSStyleSheet();
      sheet.replaceSync(cssText);
    } catch (_) {
      return '';
    }
    const fixSelector = (sel) => sel.split(',').map((s) => {
      let t = s.trim();
      t = t.replace(/(^|[\s>+~(])(html|:root)(?=$|[\s>+~.#:[)])/gi, '$1.epub-html');
      t = t.replace(/(^|[\s>+~(])body(?=$|[\s>+~.#:[)])/gi, '$1.epub-body');
      if (!/\.epub-(html|body)/.test(t)) t = `.epub-html ${t}`; // keep book rules inside the book
      return t;
    }).join(', ');
    const walk = (rules) => {
      let out = '';
      for (const r of Array.from(rules)) {
        if (r instanceof CSSStyleRule) {
          out += `${fixSelector(r.selectorText)} { ${r.style.cssText} }\n`;
        } else if (r instanceof CSSMediaRule) {
          out += `@media ${r.conditionText || r.media.mediaText} {\n${walk(r.cssRules)}}\n`;
        } else if (typeof CSSSupportsRule !== 'undefined' && r instanceof CSSSupportsRule) {
          out += `@supports ${r.conditionText} {\n${walk(r.cssRules)}}\n`;
        } else if (r instanceof CSSFontFaceRule) {
          out += `${r.cssText}\n`;
        } else if (typeof CSSPageRule !== 'undefined' && r instanceof CSSPageRule) {
          // ignored: the converter owns the page size and margins
        } else if (r.cssText && !/^@(import|namespace)/i.test(r.cssText)) {
          out += `${r.cssText}\n`;
        }
      }
      return out;
    };
    return walk(sheet.cssRules);
  }

  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // mode: 'print' -> a document for the browser's print engine (PDF)
  //       'preview' -> a document paginated with CSS columns, sized exactly like one PDF page
  // Returns the three style sheets of the document: layout (`base`), the book's own CSS (`book`) and the
  // user's overrides (`override`). The preview swaps these in place when a setting changes.
  function buildCss(book, rawOpts, mode) {
    const opts = normalizeOptions(rawOpts);
    const z = opts.zoom;
    const contentW = (opts.pageW - 2 * opts.margin) * MM;
    const contentH = (opts.pageH - 2 * opts.margin) * MM;
    const colors = colorsFor(opts);
    const bg = colors ? colors.bg : '#ffffff';
    const preview = mode === 'preview';
    const brk = preview ? 'column' : 'page';

    // Under CSS zoom, lengths written inside the zoomed subtree are multiplied by the zoom, so limits that
    // must match the real page are divided by it.
    const maxImgH = Math.floor((contentH * 0.97) / z);

    let css = '';
    if (!preview) {
      css += `@page { size: ${opts.pageW}mm ${opts.pageH}mm; margin: ${opts.margin}mm; background: ${bg}; }\n`;
    }
    css += `
html { background: ${bg}; -webkit-print-color-adjust: exact; print-color-adjust: exact; -webkit-text-size-adjust: 100%; }
html, body { margin: 0; padding: 0; }
body { font-size: 16px; line-height: 1.45; ${colors ? '' : 'color: #000;'} overflow-wrap: break-word; }
.epub-root { zoom: ${z}; }
.epub-body { display: block; position: relative; }
.epub-body + .epub-body { ${opts.chapterBreaks ? `break-before: ${brk};` : ''} }
.epub-root img, .epub-root svg, .epub-root video { max-width: 100% !important; }
.epub-root img { max-height: ${maxImgH}px !important; height: auto; object-fit: contain; break-inside: avoid; }
.epub-root svg { max-height: ${maxImgH}px; }
.epub-root h1, .epub-root h2, .epub-root h3, .epub-root h4, .epub-root h5, .epub-root h6 { break-after: avoid; break-inside: avoid; }
.epub-root p { orphans: 2; widows: 2; }
.epub-root table { max-width: 100%; }
.epub-root pre { white-space: pre-wrap; }
`;
    if (preview) {
      css += `
html, body { width: ${opts.pageW * MM}px; height: ${opts.pageH * MM}px; overflow: hidden; }
body { padding: ${opts.margin * MM}px; box-sizing: border-box; }
.epub-pages { width: ${contentW}px; height: ${contentH}px; overflow: hidden;
  column-width: ${contentW}px; column-gap: ${2 * opts.margin * MM}px; column-fill: auto; }
`;
    }

    let bookCss = '';
    if (opts.bookStyles) {
      if (!book.rewrittenCss) book.rewrittenCss = book.styles.map(rewriteBookCss).join('\n');
      bookCss = book.rewrittenCss;
    }

    let override = '';
    if (colors) {
      override += `
.epub-root, .epub-root * { color: ${colors.fg} !important; background-color: transparent !important;
  border-color: color-mix(in srgb, ${colors.fg} 45%, transparent) !important; text-shadow: none !important;
  -webkit-text-fill-color: currentColor !important; }
.epub-root a[href], .epub-root a[href] * { color: ${colors.link} !important; }
.epub-root hr { border-color: color-mix(in srgb, ${colors.fg} 45%, transparent) !important; }
.epub-root svg text { fill: ${colors.fg} !important; }
`;
    }
    if (opts.invertImages) {
      override += '.epub-root img, .epub-root svg image, .epub-root video { filter: invert(1) hue-rotate(180deg); }\n';
    }
    if (FONTS[opts.font]) {
      override += `.epub-root, .epub-root :not(code):not(pre):not(kbd):not(samp):not(tt):not(code *):not(pre *) { font-family: ${FONTS[opts.font]} !important; }\n`;
    }
    if (opts.lineHeight > 0) {
      override += `.epub-root p, .epub-root li, .epub-root div, .epub-root blockquote, .epub-root dd, .epub-root td { line-height: ${opts.lineHeight} !important; }\n`;
    }
    if (opts.justify) {
      override += '.epub-root p { text-align: justify !important; hyphens: auto; -webkit-hyphens: auto; }\n';
    }

    return { base: css, book: bookCss, override };
  }

  function buildHtml(book, rawOpts, mode) {
    const opts = normalizeOptions(rawOpts);
    const css = buildCss(book, opts, mode);
    const preview = mode === 'preview';
    const chapters = book.chapters.map((c) => {
      const attrs = [`id="c${c.index}"`, `class="epub-body ${escapeHtml(c.cls)}"`, `data-chapter="${c.index}"`];
      if (c.style) attrs.push(`style="${escapeHtml(c.style)}"`);
      if (c.dir) attrs.push(`dir="${escapeHtml(c.dir)}"`);
      if (c.lang) attrs.push(`lang="${escapeHtml(c.lang)}"`);
      const inner = c.bodyId ? `<div id="${escapeHtml(c.bodyId)}"></div>${c.html}` : c.html;
      return `<section ${attrs.join(' ')}>${inner}</section>`;
    }).join('\n');

    const lang = book.lang ? ` lang="${escapeHtml(book.lang)}"` : '';
    // The multicol container stays left-to-right so pages advance left to right; the text keeps its direction.
    const root = `<div class="epub-root epub-html" dir="${book.dir}">${chapters}</div>`;
    return `<!doctype html>
<html${lang}><head><meta charset="utf-8">
<title>${escapeHtml(book.title)}${book.author ? ` — ${escapeHtml(book.author)}` : ''}</title>
<meta name="author" content="${escapeHtml(book.author || '')}">
<style id="epub-base">${css.base}</style>
<style id="epub-book">${css.book}</style>
<style id="epub-override">${css.override}</style>
</head><body>${preview ? `<div class="epub-pages" dir="ltr">${root}</div>` : root}</body></html>`;
  }

  // Resolves once every image and web font in `doc` has loaded (or failed).
  async function whenReady(doc) {
    const imgs = Array.from(doc.images).filter((i) => !i.complete);
    await Promise.all(imgs.map((i) => new Promise((res) => { i.addEventListener('load', res, { once: true }); i.addEventListener('error', res, { once: true }); })));
    if (doc.fonts && doc.fonts.ready) await doc.fonts.ready;
  }

  global.EpubReader = { loadEpub, buildHtml, buildCss, normalizeOptions, whenReady, PAGE_SIZES, THEMES, FONTS, DEFAULTS, MM };
})(typeof window !== 'undefined' ? window : globalThis);
