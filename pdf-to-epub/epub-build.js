// Book structure (structure.js) -> a valid EPUB 3 file (with an EPUB 2 table of contents for older readers).
/* global JSZip */
(function (global) {
  'use strict';

  const APPEARANCE = {
    theme: 'original', // original | invert | dark | sepia | custom
    fg: '#ffffff',
    bg: '#000000',
    invertImages: false,
    zoom: 1, // default text size in the EPUB (readers still let you zoom; the text reflows)
    font: 'book',
    lineHeight: 0,
    justify: false,
  };

  const THEMES = {
    invert: { fg: '#ffffff', bg: '#000000', link: '#8ab4ff' },
    dark: { fg: '#e6e6e6', bg: '#1b1b1d', link: '#8ab4ff' },
    sepia: { fg: '#3b2f22', bg: '#f4ecd8', link: '#7a4b12' },
  };
  const FONTS = {
    serif: 'Georgia, "Times New Roman", "Noto Serif", serif',
    sans: '"Helvetica Neue", Arial, "Noto Sans", sans-serif',
    readable: 'Verdana, Tahoma, sans-serif',
    mono: 'Menlo, Consolas, "Courier New", monospace',
  };

  const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
  const esc = (s) => String(s).replace(INVALID_XML, '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Structural CSS: what makes the converted text look like a book. Always present.
  const BASE_CSS = `
body { margin: 0 4%; line-height: 1.5; widows: 2; orphans: 2; }
p { margin: 0; text-indent: 1.4em; }
p.first, h1 + p, h2 + p, h3 + p, h4 + p, h5 + p, h6 + p, figure + p, p.center { text-indent: 0; }
p.center { text-align: center; margin: 0.4em 0; }
p.gap { margin-top: 0.8em; }
p.small { font-size: 0.85em; }
h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.4em 0 0.6em; page-break-after: avoid; break-after: avoid; }
h1 { font-size: 1.7em; text-align: center; margin-top: 2em; }
h2 { font-size: 1.4em; }
h3 { font-size: 1.2em; }
h4, h5, h6 { font-size: 1.05em; }
.center { text-align: center; }
figure { margin: 1em 0; text-align: center; page-break-inside: avoid; break-inside: avoid; }
figure img { max-width: 100%; height: auto; }
figure.page img { max-height: 98vh; }
sup, sub { font-size: 0.7em; line-height: 0; }
code { font-family: monospace; }
[dir="rtl"] p { text-align: right; }
[dir="rtl"] h2, [dir="rtl"] h3, [dir="rtl"] h4 { text-align: right; }
`;

  function appearanceCss(a) {
    a = Object.assign({}, APPEARANCE, a);
    let css = '';
    const colors = a.theme === 'custom' ? { fg: a.fg, bg: a.bg, link: a.fg } : THEMES[a.theme];
    if (colors) {
      css += `html, body { background-color: ${colors.bg}; color: ${colors.fg}; }\n`;
      css += `p, h1, h2, h3, h4, h5, h6, li, span, b, i, strong, em, figure, figcaption { color: ${colors.fg}; }\n`;
      css += `a { color: ${colors.link}; }\n`;
    }
    if (a.invertImages) css += 'img { filter: invert(1) hue-rotate(180deg); }\n';
    if (a.zoom && Math.abs(a.zoom - 1) > 0.01) css += `body { font-size: ${Math.round(a.zoom * 100)}%; }\n`;
    if (FONTS[a.font]) css += `body, p, h1, h2, h3, h4, h5, h6 { font-family: ${FONTS[a.font]}; }\n`;
    if (a.lineHeight > 0) css += `body, p { line-height: ${a.lineHeight}; }\n`;
    if (a.justify) css += 'p { text-align: justify; hyphens: auto; -webkit-hyphens: auto; }\n';
    return css;
  }

  function runsToXhtml(runs) {
    let out = '';
    for (const r of runs) {
      if (!r.text) continue;
      let t = esc(r.text);
      if (r.m) t = `<code>${t}</code>`;
      if (r.i) t = `<i>${t}</i>`;
      if (r.b) t = `<b>${t}</b>`;
      if (r.sup) t = `<sup>${t}</sup>`;
      else if (r.sub) t = `<sub>${t}</sub>`;
      out += t;
    }
    return out.replace(/<\/(b|i|code)><\1>/g, '');
  }

  function dataUrlToBytes(url) {
    const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
    const bin = atob(m[3]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { type: m[1] || 'application/octet-stream', bytes };
  }

  // book: from PdfStructure.buildBook. Returns a Uint8Array (or Blob with { type: 'blob' }).
  async function buildEpub(book, appearance, opts) {
    const options = Object.assign({ includeCover: true, type: 'uint8array' }, opts);
    const zip = new JSZip();
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
    zip.file('META-INF/container.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>\n</container>\n');

    const lang = book.language || 'en';
    const dir = book.rtl ? 'rtl' : 'ltr';
    const uid = `urn:uuid:${(global.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
    const manifest = [];
    const spine = [];
    const toc = [];
    let imageNo = 0;
    const addImage = (src) => {
      const { type, bytes } = dataUrlToBytes(src);
      const ext = type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpg' : type.split('/')[1] || 'bin';
      const name = `images/img${String(++imageNo).padStart(4, '0')}.${ext}`;
      zip.file(`OEBPS/${name}`, bytes);
      manifest.push({ id: `img${imageNo}`, href: name, type });
      return name;
    };

    const page = (title, body, extraHead) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${esc(lang)}" xml:lang="${esc(lang)}" dir="${dir}">
<head>
<meta charset="UTF-8"/>
<title>${esc(title)}</title>
<link rel="stylesheet" type="text/css" href="../styles/book.css"/>${extraHead || ''}
</head>
<body dir="${dir}">
${body}
</body>
</html>
`;

    // cover
    if (options.includeCover && book.cover) {
      const { type, bytes } = dataUrlToBytes(book.cover);
      zip.file('OEBPS/images/cover.jpg', bytes);
      manifest.push({ id: 'cover-image', href: 'images/cover.jpg', type, props: 'cover-image' });
      zip.file('OEBPS/text/cover.xhtml', page('Cover', '<div class="center" epub:type="cover"><img src="../images/cover.jpg" alt="Cover" style="max-width:100%;max-height:98vh"/></div>'));
      manifest.push({ id: 'cover', href: 'text/cover.xhtml', type: 'application/xhtml+xml' });
      spine.push({ id: 'cover', linear: 'no' });
    }

    // chapters
    let hid = 0;
    book.chapters.forEach((ch, ci) => {
      const file = `text/chapter${String(ci + 1).padStart(3, '0')}.xhtml`;
      let body = '';
      let afterHeading = true;
      for (const b of ch.blocks) {
        const bdir = b.rtl !== undefined && b.rtl !== book.rtl ? ` dir="${b.rtl ? 'rtl' : 'ltr'}"` : '';
        if (b.type === 'h') {
          const id = `h${++hid}`;
          const lvl = Math.min(6, Math.max(1, b.level));
          body += `<h${lvl} id="${id}"${bdir}${b.centered && lvl > 1 ? ' class="center"' : ''}>${runsToXhtml(b.runs)}</h${lvl}>\n`;
          if (lvl <= 3) toc.push({ level: lvl, title: b.text, href: `${file}#${id}` });
          afterHeading = true;
        } else if (b.type === 'img') {
          const name = addImage(b.src);
          body += `<figure${b.fullPage ? ' class="page"' : ''}><img src="../${name}" alt=""${b.width ? ` width="${b.width}" height="${b.height}"` : ''}/></figure>\n`;
          afterHeading = true;
        } else {
          const cls = [];
          if (afterHeading) cls.push('first');
          if (b.centered) cls.push('center');
          if (b.size && b.size < 0.85) cls.push('small');
          body += `<p${cls.length ? ` class="${cls.join(' ')}"` : ''}${bdir}>${runsToXhtml(b.runs)}</p>\n`;
          afterHeading = false;
        }
      }
      zip.file(`OEBPS/${file}`, page(ch.title || book.title, body));
      const id = `ch${ci + 1}`;
      manifest.push({ id, href: file, type: 'application/xhtml+xml' });
      spine.push({ id });
      if (!toc.some((t) => t.href.startsWith(file))) toc.push({ level: 1, title: ch.title || `Part ${ci + 1}`, href: file });
    });

    // styles
    zip.file('OEBPS/styles/book.css', `${BASE_CSS}\n/* Appearance chosen in the converter */\n${appearanceCss(appearance)}`);
    manifest.push({ id: 'css', href: 'styles/book.css', type: 'text/css' });

    // navigation document (EPUB 3) + NCX (EPUB 2 readers)
    const minLevel = toc.length ? Math.min(...toc.map((t) => t.level)) : 1;
    const tree = [];
    const stack = [{ level: minLevel - 1, children: tree }];
    for (const t of toc) {
      const node = { level: t.level, title: t.title, href: t.href, children: [] };
      while (stack.length > 1 && stack[stack.length - 1].level >= t.level) stack.pop();
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    }
    const navList = (nodes) => `<ol>${nodes.map((n) => `<li><a href="${esc(n.href.replace(/^text\//, ''))}">${esc(n.title.slice(0, 200) || '…')}</a>${n.children.length ? navList(n.children) : ''}</li>`).join('')}</ol>`;
    zip.file('OEBPS/text/nav.xhtml', page('Contents', `<nav epub:type="toc" id="toc"><h1>Contents</h1>${navList(tree)}</nav>`));
    manifest.push({ id: 'nav', href: 'text/nav.xhtml', type: 'application/xhtml+xml', props: 'nav' });

    let playOrder = 0;
    const ncxPoints = (nodes) => nodes.map((n) => `<navPoint id="np${++playOrder}" playOrder="${playOrder}"><navLabel><text>${esc(n.title.slice(0, 200) || '…')}</text></navLabel><content src="${esc(n.href)}"/>${ncxPoints(n.children)}</navPoint>`).join('');
    zip.file('OEBPS/toc.ncx', `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${esc(uid)}"/><meta name="dtb:depth" content="3"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>
<docTitle><text>${esc(book.title)}</text></docTitle>
<navMap>${ncxPoints(tree)}</navMap>
</ncx>
`);
    manifest.push({ id: 'ncx', href: 'toc.ncx', type: 'application/x-dtbncx+xml' });

    const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${esc(lang)}" dir="${dir}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${esc(uid)}</dc:identifier>
<dc:title>${esc(book.title)}</dc:title>
${book.author ? `<dc:creator>${esc(book.author)}</dc:creator>\n` : ''}<dc:language>${esc(lang)}</dc:language>
<meta property="dcterms:modified">${modified}</meta>
${manifest.some((m) => m.props === 'cover-image') ? '<meta name="cover" content="cover-image"/>\n' : ''}</metadata>
<manifest>
${manifest.map((m) => `<item id="${m.id}" href="${esc(m.href)}" media-type="${m.type}"${m.props ? ` properties="${m.props}"` : ''}/>`).join('\n')}
</manifest>
<spine toc="ncx"${book.rtl ? ' page-progression-direction="rtl"' : ''}>
${spine.map((s) => `<itemref idref="${s.id}"${s.linear ? ` linear="${s.linear}"` : ''}/>`).join('\n')}
</spine>
</package>
`);

    return zip.generateAsync({ type: options.type, mimeType: 'application/epub+zip', compression: 'DEFLATE', compressionOptions: { level: 9 } });
  }

  global.EpubBuild = { buildEpub, appearanceCss, APPEARANCE };
})(typeof window !== 'undefined' ? window : globalThis);
