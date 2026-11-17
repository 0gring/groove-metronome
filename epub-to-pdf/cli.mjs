#!/usr/bin/env node
// Command line EPUB -> PDF converter. Uses the same engine as the web app (epub.js) inside headless Chromium,
// so the PDF has real (selectable, searchable, infinitely sharp) vector text, embedded fonts, working links
// and a bookmark outline built from the headings.
//
//   npm install playwright && npx playwright install chromium
//   node epub-to-pdf/cli.mjs book.epub -o book.pdf --zoom 1.5 --theme invert --page a5
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const HELP = `Usage: node cli.mjs <book.epub> [options]

  -o, --out <file.pdf>    output file (default: next to the EPUB)
  --zoom <n>              text zoom, e.g. 1.5 or 150%  (text reflows: bigger = more pages)   [1]
  --theme <name>          original | invert | dark | sepia | light | custom                [original]
  --fg <color> --bg <color>  text and background colour for --theme custom
  --invert-images         invert pictures too (default: pictures keep their real colours)
  --page <size>           a4 | a5 | a6 | letter | 6x9 | 5x8 | ereader | tablet | <W>x<H>mm   [a5]
  --margin <mm>           page margin in millimetres                                       [14]
  --font <name>           book | serif | sans | readable | mono                            [book]
  --line-height <n>       e.g. 1.6 (default: keep the book's)
  --justify               justify paragraphs
  --no-book-styles        ignore the book's own CSS
  --no-chapter-breaks     do not start every chapter on a new page
`;

function parseArgs(argv) {
  const opts = {};
  let input = null;
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    switch (a) {
      case '-h': case '--help': console.log(HELP); process.exit(0); break;
      case '-o': case '--out': out = next(); break;
      case '--zoom': { const v = next(); opts.zoom = v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v); break; }
      case '--theme': opts.theme = next(); break;
      case '--invert': opts.theme = 'invert'; break;
      case '--fg': opts.fg = next(); opts.theme = 'custom'; break;
      case '--bg': opts.bg = next(); opts.theme = 'custom'; break;
      case '--invert-images': opts.invertImages = true; break;
      case '--page': {
        const v = next().toLowerCase();
        const m = v.match(/^([\d.]+)x([\d.]+)(mm|in)?$/);
        if (m && !['6x9', '5x8'].includes(v)) {
          const k = m[3] === 'in' ? 25.4 : 1;
          Object.assign(opts, { page: 'custom', pageW: +m[1] * k, pageH: +m[2] * k });
        } else opts.page = v;
        break;
      }
      case '--margin': opts.margin = parseFloat(next()); break;
      case '--font': opts.font = next(); break;
      case '--line-height': opts.lineHeight = parseFloat(next()); break;
      case '--justify': opts.justify = true; break;
      case '--no-book-styles': opts.bookStyles = false; break;
      case '--no-chapter-breaks': opts.chapterBreaks = false; break;
      default:
        if (a.startsWith('-')) throw new Error(`Unknown option ${a}`);
        input = a;
    }
  }
  if (!input) { console.log(HELP); process.exit(1); }
  return { input, out: out || input.replace(/\.epub$/i, '') + '.pdf', opts };
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

const { input, out, opts } = parseArgs(process.argv.slice(2));
const { chromium } = await loadPlaywright();
const here = path.dirname(fileURLToPath(import.meta.url));
const epub = await readFile(input);

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(pathToFileURL(path.join(here, 'engine.html')).href);
  const html = await page.evaluate(async ({ b64, o }) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const book = await window.EpubPdf.loadEpub(bytes);
    return window.EpubPdf.buildHtml(book, o, 'print');
  }, { b64: epub.toString('base64'), o: opts });

  const printPage = await browser.newPage();
  await printPage.setContent(html, { waitUntil: 'load', timeout: 0 });
  await printPage.evaluate(() => document.fonts.ready);
  await printPage.emulateMedia({ media: 'print' });
  const pdf = await printPage.pdf({ preferCSSPageSize: true, printBackground: true, outline: true, tagged: true, timeout: 0 });
  await writeFile(out, pdf);
  console.log(`Saved ${out} (${(pdf.length / 1024 / 1024).toFixed(2)} MB)`);
} finally {
  await browser.close();
}
