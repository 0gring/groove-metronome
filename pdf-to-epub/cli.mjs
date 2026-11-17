#!/usr/bin/env node
// Command line PDF -> EPUB converter. Runs the same engine as the web app inside headless Chromium.
//
//   npm install playwright && npx playwright install chromium
//   node pdf-to-epub/cli.mjs book.pdf -o book.epub --theme invert --text-size 120%
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HELP = `Usage: node cli.mjs <book.pdf> [options]

  -o, --out <file.epub>     output file (default: next to the PDF)
  --title <text>            book title (default: from the PDF)
  --author <text>           author (default: from the PDF)
  --password <text>         password for a protected PDF

Appearance saved into the EPUB:
  --theme <name>            original | invert | dark | sepia | custom                      [original]
  --invert                  same as --theme invert (white text on black)
  --fg <color> --bg <color> text and background colour (implies --theme custom)
  --invert-images           invert pictures too
  --text-size <n>           default text size, e.g. 1.2 or 120%                             [100%]
  --font <name>             book | serif | sans | readable | mono                           [book]
  --line-height <n>         e.g. 1.7
  --justify                 justify paragraphs

Conversion:
  --keep-headers            keep running page headers, footers and page numbers
  --no-join-hyphens         keep words hyphenated at line ends split
  --no-headings             do not detect headings / chapters from font sizes
  --no-outline              ignore the PDF's bookmarks
  --no-images               leave pictures out
  --no-cover                no cover image
`;

function parseArgs(argv) {
  const conv = {};
  const look = {};
  const meta = {};
  let input = null;
  let out = null;
  let includeCover = true;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    switch (a) {
      case '-h': case '--help': console.log(HELP); process.exit(0); break;
      case '-o': case '--out': out = next(); break;
      case '--title': meta.title = next(); break;
      case '--author': meta.author = next(); break;
      case '--password': meta.password = next(); break;
      case '--theme': look.theme = next(); break;
      case '--invert': look.theme = 'invert'; break;
      case '--fg': look.fg = next(); look.theme = 'custom'; break;
      case '--bg': look.bg = next(); look.theme = 'custom'; break;
      case '--invert-images': look.invertImages = true; break;
      case '--text-size': case '--zoom': { const v = next(); look.zoom = v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v); break; }
      case '--font': look.font = next(); break;
      case '--line-height': look.lineHeight = parseFloat(next()); break;
      case '--justify': look.justify = true; break;
      case '--keep-headers': conv.removeHeadersFooters = false; break;
      case '--no-join-hyphens': conv.joinHyphens = false; break;
      case '--no-headings': conv.detectHeadings = false; break;
      case '--no-outline': conv.useOutline = false; break;
      case '--no-images': conv.keepImages = false; break;
      case '--no-cover': includeCover = false; break;
      default:
        if (a.startsWith('-')) throw new Error(`Unknown option ${a}`);
        input = a;
    }
  }
  if (!input) { console.log(HELP); process.exit(1); }
  return { input, out: out || `${input.replace(/\.pdf$/i, '')}.epub`, conv, look, meta, includeCover };
}

async function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const id of ['playwright', 'playwright-core', '/opt/node-tools/node_modules/playwright']) {
    try { return require(id); } catch (_) { /* try next */ }
  }
  try { return createRequire(path.join(process.cwd(), 'x.js'))('playwright'); } catch (_) { /* fall through */ }
  console.error('Playwright is needed:  npm install playwright && npx playwright install chromium');
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const { chromium } = await loadPlaywright();
const here = path.dirname(fileURLToPath(import.meta.url));
const pdf = await readFile(args.input);
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css' };

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  // pdf.js is an ES module, which browsers will not load from file:// URLs, so the engine is served from memory
  await page.route('http://pdf-to-epub.local/**', async (route) => {
    const file = path.join(here, decodeURIComponent(new URL(route.request().url()).pathname));
    if (!file.startsWith(here) || !existsSync(file)) return route.fulfill({ status: 404 });
    return route.fulfill({ body: await readFile(file), contentType: MIME[path.extname(file)] || 'application/octet-stream' });
  });
  await page.goto('http://pdf-to-epub.local/engine.html');
  const result = await page.evaluate(async ({ b64, a }) => {
    const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const doc = await window.PdfExtract.extractPdf(data, { password: a.meta.password });
    const book = window.PdfStructure.buildBook(doc, a.conv);
    if (a.meta.title) book.title = a.meta.title;
    else if (!doc.title && book.title === 'Untitled') book.title = a.fileTitle;
    if (a.meta.author) book.author = a.meta.author;
    const bytes = await window.EpubBuild.buildEpub(book, a.look, { includeCover: a.includeCover });
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return { epub: btoa(s), stats: book.stats, chapters: book.chapters.length, title: book.title };
  }, { b64: pdf.toString('base64'), a: { ...args, fileTitle: path.basename(args.input).replace(/\.pdf$/i, '') } });
  const out = Buffer.from(result.epub, 'base64');
  await writeFile(args.out, out);
  const s = result.stats;
  console.log(`Saved ${args.out} (${(out.length / 1024).toFixed(0)} KB): "${result.title}", ${s.pages} pages -> ` +
    `${result.chapters} chapters, ${s.headings} headings, ${s.paragraphs} paragraphs, ${s.images} pictures`);
  if (s.scannedPages) console.log(`Note: ${s.scannedPages} page(s) have no text layer (scanned) and were kept as pictures.`);
} finally {
  await browser.close();
}
