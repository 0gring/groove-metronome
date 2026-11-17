# EPUB → PDF

A high-quality EPUB to PDF converter that runs entirely in the browser — the book never leaves your device.

Open `epub-to-pdf/index.html` (on GitHub Pages: `…/epub-to-pdf/`), drop in an `.epub`, adjust, and press **Save as PDF**.

## Features

- **Vector-quality PDF.** The PDF comes from the browser's own print engine, so text stays real text. It is sharp at
  any zoom level, searchable and copyable, and the book's fonts are embedded. Internal links work, and chapters
  appear as PDF bookmarks.
- **Inverted colours.** One click turns black-on-white into white-on-black (also: dark grey, sepia, or your own text
  and background colours). The colours cover the whole page, margins included. Pictures keep their real colours
  unless you tick *Invert pictures too*. Colours are swapped with CSS, not an image filter, so the text stays vector.
- **Reflowing zoom.** Text zoom (50–400%) re-wraps the lines to the page instead of cropping them, so a larger zoom
  spreads the book over more pages. The live preview is paginated exactly like the PDF and shows the page count.
  It keeps your place when you zoom. Use the slider, `A−`/`A+`, `+`/`−` keys, Ctrl/⌘ + scroll, a trackpad pinch,
  or a two-finger pinch on touch screens.
- **Page setup:** A4, A5, A6, US Letter, 6×9″, 5×8″, e-reader and tablet sizes, or a custom size; adjustable margins;
  each chapter can start on a new page.
- **Typography:** keep the book's fonts or switch to serif / sans / extra-readable / mono, set the line spacing, and
  justify paragraphs. You can also turn the book's own styles off.
- Right-to-left books (Hebrew, Arabic…), EPUB 2 and EPUB 3, SVG covers, `@import`ed and embedded fonts, and a chapter
  menu built from the book's table of contents.
- Keyboard: `←`/`→` turn pages, `I` toggles inverted colours.

When the print window opens, choose **Save as PDF** as the destination. Keep *Background graphics* on and leave
margins on *Default*. Chrome and Edge give the best results.

## Command line

The same engine runs in headless Chromium and writes the PDF directly:

```sh
npm install playwright && npx playwright install chromium
node epub-to-pdf/cli.mjs book.epub -o book.pdf --zoom 150% --theme invert --page a5 --margin 12
```

Run `node epub-to-pdf/cli.mjs --help` for every option.

## Files

| File | |
|---|---|
| `epub.js` | EPUB parsing and HTML/CSS building, shared by the web app and the CLI |
| `app.js`, `index.html`, `style.css` | the web app |
| `cli.mjs`, `engine.html` | the command-line converter |
| `vendor/jszip.min.js` | [JSZip](https://stuk.github.io/jszip/) 3.10.1 (MIT) for reading the EPUB zip |
