/**
 * SimVentory — PDF Utility
 * Renders PDF documents into high-resolution image frames and extracts text
 * for visual AI inspection and browser preview.
 */
import * as pdfjsLib from 'pdfjs-dist/build/pdf.min.mjs';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

if (pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

/**
 * Render pages of a PDF into high-res images and extract text content.
 * @param {ArrayBuffer|Uint8Array} pdfData 
 * @param {number} [maxPages=5] 
 * @returns {Promise<Array<{ pageNumber: number, totalPages: number, dataUrl: string, text: string }>>}
 */
export async function renderPdfPages(pdfData, maxPages = 5) {
  const loadingTask = pdfjsLib.getDocument({
    data: pdfData,
    standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/',
  });
  const pdfDoc = await loadingTask.promise;
  const numPages = Math.min(pdfDoc.numPages, maxPages);
  const pages = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    // Render at scale 1.8 for crisp AI OCR and user readability
    const viewport = page.getViewport({ scale: 1.8 });

    let textContent = '';
    try {
      const text = await page.getTextContent();
      textContent = text.items.map(item => item.str || '').join(' ').trim();
    } catch (_) {}

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');

    // Fill white background for transparent PDF elements
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport: viewport,
    }).promise;

    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    pages.push({
      pageNumber: pageNum,
      totalPages: pdfDoc.numPages,
      dataUrl,
      text: textContent,
    });
  }

  return pages;
}
