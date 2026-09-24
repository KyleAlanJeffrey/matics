import { getFontEmbedCSS, toCanvas } from "html-to-image";
import { jsPDF } from "jspdf";
import { saveFile } from "./save-file";
import { pageBreaks, type Span } from "./page-breaks";

// WebKit (the desktop app's web view) refuses canvases much above 16 megapixels, so tall
// captures lower their pixel ratio and PDFs render one page at a time.
const MAX_CANVAS_PIXELS = 16_000_000;

const A4 = { width: 210, height: 297 };
const MARGIN = { top: 12, bottom: 16, side: 12 };

function safeRatio(width: number, height: number, wanted: number) {
  return Math.max(0.5, Math.min(wanted, Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, width * height))));
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the image."))), "image/png"));
}

const skipMarked = (node: HTMLElement) => !(node instanceof HTMLElement && node.dataset.exportIgnore !== undefined);

export async function exportElementPng(element: HTMLElement, filename: string, pixelRatio = 2) {
  const { width, height } = element.getBoundingClientRect();
  const canvas = await toCanvas(element, { pixelRatio: safeRatio(width, height, pixelRatio), backgroundColor: "#ffffff", filter: skipMarked });
  await saveFile(filename, await canvasToBlob(canvas));
}

function keepBlocks(root: HTMLElement): Span[] {
  const origin = root.getBoundingClientRect().top;
  const span = (el: Element): Span => {
    const rect = el.getBoundingClientRect();
    return { top: rect.top - origin, bottom: rect.bottom - origin };
  };
  const kept = Array.from(root.querySelectorAll("[data-keep]")).map(span);
  const withNext = Array.from(root.querySelectorAll("[data-keep-with-next]")).map((heading) => {
    const own = span(heading);
    const next = kept.find((block) => block.top >= own.bottom - 1);
    return next ? { top: own.top, bottom: next.bottom } : own;
  });
  return [...kept, ...withNext];
}

// A4 portrait PDF of `root`, laid out at its on-screen width. Each page is rendered on
// its own and placed as an image, with a vector footer.
export async function exportElementPdf(root: HTMLElement, filename: string, footer: string, onProgress?: (page: number, total: number) => void) {
  const { width, height } = root.getBoundingClientRect();
  const contentWidthMm = A4.width - MARGIN.side * 2;
  const contentHeightMm = A4.height - MARGIN.top - MARGIN.bottom;
  const pxPerMm = width / contentWidthMm;
  const pages = pageBreaks(height, contentHeightMm * pxPerMm, keepBlocks(root));

  const fontEmbedCSS = await getFontEmbedCSS(root);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  for (const [index, page] of pages.entries()) {
    onProgress?.(index + 1, pages.length);
    const sliceHeight = page.bottom - page.top;
    const canvas = await toCanvas(root, {
      pixelRatio: safeRatio(width, sliceHeight, 2),
      backgroundColor: "#ffffff",
      width,
      height: sliceHeight,
      fontEmbedCSS,
      filter: skipMarked,
      style: { transform: `translateY(${-page.top}px)`, transformOrigin: "top left", margin: "0" },
    });
    if (index > 0) pdf.addPage();
    pdf.addImage(canvas, "PNG", MARGIN.side, MARGIN.top, contentWidthMm, sliceHeight / pxPerMm, undefined, "FAST");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(footer, MARGIN.side, A4.height - 8);
    pdf.text(`Page ${index + 1} of ${pages.length}`, A4.width - MARGIN.side, A4.height - 8, { align: "right" });
  }
  await saveFile(filename, pdf.output("blob"));
}
