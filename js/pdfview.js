// PDF viewing + text extraction, using a bundled copy of pdf.js loaded on demand.

let pdfjsP = null;
function pdfjs() {
  pdfjsP ??= import('../vendor/pdfjs/pdf.min.mjs').then((m) => {
    m.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
    return m;
  });
  return pdfjsP;
}

export async function openPdf(buffer) {
  const lib = await pdfjs();
  // pdf.js takes ownership of the buffer it is given, so pass a copy
  return lib.getDocument({ data: new Uint8Array(buffer.slice(0)), isEvalSupported: false }).promise;
}

/** Render one page to fit the given CSS width. */
export async function renderPage(pdf, pageNo, canvas, cssWidth) {
  const page = await pdf.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  const scale = cssWidth / base.width;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const vp = page.getViewport({ scale: scale * dpr });
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  canvas.style.width = `${Math.floor(vp.width / dpr)}px`;
  canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
  if (canvas._task) canvas._task.cancel();
  canvas._task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
  try {
    await canvas._task.promise;
  } catch (e) {
    if (e?.name !== 'RenderingCancelledException') throw e;
  } finally {
    canvas._task = null;
  }
}

/**
 * Extract the text of all pages, rebuilding line layout so monospaced
 * tab lines keep their column alignment.
 */
export async function extractText(pdf) {
  const out = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const { items } = await page.getTextContent();
    const rows = new Map();
    let minX = Infinity;
    const widths = [];
    for (const it of items) {
      if (!it.str) continue;
      const [x, y] = [it.transform[4], it.transform[5]];
      const key = Math.round(y / 2);
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push({ x, s: it.str });
      minX = Math.min(minX, x);
      if (it.str.length > 3 && it.width) widths.push(it.width / it.str.length);
    }
    widths.sort((a, b) => a - b);
    const cw = widths[Math.floor(widths.length / 2)] || 6;
    [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, parts]) => {
        parts.sort((a, b) => a.x - b.x);
        let line = '';
        for (const part of parts) {
          const col = Math.round((part.x - minX) / cw);
          if (col > line.length) line = line.padEnd(col, ' ');
          line += part.s;
        }
        out.push(line);
      });
    out.push('');
  }
  return out.join('\n');
}
