# PDF → EPUB

A high-quality PDF to EPUB converter that runs entirely in the browser, so the file never leaves your device.

Open `pdf-to-epub/index.html` (on GitHub Pages: `…/pdf-to-epub/`), drop in a `.pdf`, check the live preview, and press
**Download EPUB**.

## What it does

A PDF stores lines of text at fixed positions. The converter rebuilds the book behind those positions, so the
EPUB has real reflowable text:

- **Paragraphs** are reassembled from lines. It uses first-line indents, short last lines, line spacing and font
  changes to tell where paragraphs end.
- **Multi-column pages:** each line is measured against its own column, so two-column text doesn't fall apart.
- **Words hyphenated at line ends** are re-joined ("thir‐ teen" → "thirteen").
- **Running headers, footers and page numbers** are removed, because the EPUB pages are different.
- **Headings and chapters** come from the PDF's bookmarks and from font sizes. They become a nested table of
  contents, and the book is split into one file per chapter.
- **Bold, italic, superscript and subscript** text keeps its styling, so footnote numbers stay superscript.
- **Pictures** are kept as sharp images, cropped from a high-resolution render of the page. Page 1 becomes the cover.
- **Right-to-left PDFs** (Hebrew, Arabic) come out in correct reading order, with RTL page progression.
- Rotated pages and password-protected PDFs work.
- **Scanned pages** have no text to reflow, so they are kept as full-page pictures and the app warns you.
  Run such PDFs through OCR first.

## Inverted colours and reflowing zoom

- **Colours:** Original, **Inverted** (white text on black), dark grey, sepia, or your own text and background colours.
  Pictures keep their real colours unless you tick *Invert pictures too*.
- **Text zoom (50–400%):** the text reflows, so the lines re-wrap to the screen and the book spreads over more pages
  instead of being cropped. The preview keeps your place in the book while you zoom. Use the slider, `A−`/`A+`, the
  `+`/`−` keys, Ctrl/⌘ + scroll, a trackpad pinch, or a two-finger pinch on touch screens.
- The preview is paginated like an e-reader screen (phone, 6″/7″ e-reader, tablet, or paper sizes).
- With *Save colours, text size and font into the EPUB* ticked, the chosen theme, text size, font, line spacing and
  justification are written into the EPUB's stylesheet. Readers that apply their own themes (Kindle, Apple Books)
  may override the colours; their night mode does the same inversion.
- Keyboard: `←`/`→` turn pages, `I` toggles inverted colours.

## Command line

The same engine runs in headless Chromium:

```sh
npm install playwright && npx playwright install chromium
node pdf-to-epub/cli.mjs book.pdf -o book.epub --invert --text-size 120%
```

Run `node pdf-to-epub/cli.mjs --help` for every option.

## Files

| File | |
|---|---|
| `pdf-extract.js` | reads the PDF with pdf.js: lines with positions, sizes and styles; pictures; bookmarks |
| `structure.js` | rebuilds paragraphs, headings and chapters, and removes headers and footers (no DOM, so it re-runs instantly) |
| `epub-build.js` | writes the EPUB 3 file (with an EPUB 2 NCX table of contents for older readers) |
| `reader.js` | the paginated EPUB preview (colour themes, reflowing zoom) |
| `app.js`, `index.html`, `style.css` | the web app |
| `cli.mjs`, `engine.html` | the command-line converter |
| `vendor/pdfjs/` | [pdf.js](https://mozilla.github.io/pdf.js/) 4.10.38 (Apache-2.0) |
| `vendor/jszip.min.js` | [JSZip](https://stuk.github.io/jszip/) 3.10.1 (MIT) |
