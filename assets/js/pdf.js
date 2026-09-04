/**
 * pdf.js - Raster-to-PDF pipeline.
 *
 * The poster DOM is painted by the browser engine itself (html2canvas) at a
 * high device scale, then embedded into a Letter- or Legal-size PDF via jsPDF.
 * This is what gives pixel-perfect Hebrew with nikud, RTL layout and custom
 * fonts - things that are essentially impossible to do well with text-drawing
 * PDF libraries in the browser.
 *
 * A vector-quality alternative is also available: the "Print" button, which
 * sends the very same DOM through the browser's native print-to-PDF.
 */

import { getPageSize, getPageSizeForElement } from './poster.js';

export const QUALITIES = {
  draft: { scale: 2, label: '192 DPI' },
  high: { scale: 3, label: '288 DPI' },
  ultra: { scale: 4, label: '384 DPI', png: true },
};

async function renderPage(pageEl, scale, pageSize = getPageSizeForElement(pageEl)) {
  const canvas = await html2canvas(pageEl, {
    scale,
    backgroundColor: '#ffffff',
    logging: false,
    width: pageSize.width,
    height: pageSize.height,
    windowWidth: pageSize.width,
    windowHeight: pageSize.height,
    useCORS: false,
    allowTaint: true,
  });
  return canvas;
}

/**
 * Generate the PDF from an array of built poster elements.
 * @param {HTMLElement[]} pages attached, auto-fitted poster elements
 * @param {{quality:string, pageSize:string, onProgress:Function}} opts
 * @returns {Promise<jsPDF>}
 */
export async function generatePdf(pages, { quality = 'high', pageSize, onProgress, filename = 'mishna-posters.pdf' } = {}) {
  if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('jsPDF failed to load');
  if (!pages || !pages.length) throw new Error('no pages');
  const q = QUALITIES[quality] || QUALITIES.high;
  // Explicit caller choice wins; otherwise each page brings its own format.
  // The app uses one format for a whole batch, but this keeps the utility
  // correct if it is reused elsewhere.
  const explicitSize = pageSize ? getPageSize(pageSize) : null;
  const sizeFor = (page) => explicitSize || getPageSizeForElement(page);
  const firstSize = sizeFor(pages[0]);
  const doc = new window.jspdf.jsPDF({
    unit: 'pt',
    format: firstSize.pdfFormat,
    orientation: 'portrait',
    compress: true,
  });

  for (let i = 0; i < pages.length; i++) {
    const currentSize = sizeFor(pages[i]);
    // let the UI paint the progress bar between pages
    await new Promise((r) => requestAnimationFrame(() => r()));
    const canvas = await renderPage(pages[i], q.scale, currentSize);
    const usePng = !!q.png;
    const dataUrl = usePng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.93);
    if (i > 0) doc.addPage(currentSize.pdfFormat, 'portrait');
    doc.addImage(
      dataUrl,
      usePng ? 'PNG' : 'JPEG',
      0,
      0,
      currentSize.widthPt,
      currentSize.heightPt,
      undefined,
      'FAST',
    );
    canvas.width = canvas.height = 0; // release memory
    if (onProgress) onProgress(i + 1, pages.length);
  }
  doc.__filename = filename;
  return doc;
}

/** Render a single poster element to a PNG data URL (WhatsApp-friendly). */
export async function renderPagePng(pageEl, scale = 3) {
  const canvas = await renderPage(pageEl, scale);
  return canvas.toDataURL('image/png');
}

export function savePdf(doc, filename) {
  doc.save(filename);
}

export function suggestedFilename(schedule, settings) {
  const first = schedule.entries[0];
  const n = schedule.entries.length;
  const nice = (first ? first.book : 'mishna').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return `mishna-${nice}-${first ? first.date : 'schedule'}-x${n}.pdf`;
}
