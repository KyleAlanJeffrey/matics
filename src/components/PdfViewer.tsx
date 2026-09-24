import { useEffect, useRef, useState } from "react";
import { ExternalLink, Minus, Plus } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";

// pdf.js is large; it loads the first time a PDF is shown.
async function loadPdfJs() {
  const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

type State = { status: "loading" } | { status: "ready"; pdf: PDFDocumentProxy; aspect: number } | { status: "error"; message: string };

// Renders a PDF inside the app with pdf.js, so it looks the same in the browser build and
// the desktop web view (which has no reliable built-in PDF viewer in iframes). Pages
// render as they scroll into view.
export function PdfViewer({ load, name, onOpenExternal, fallback }: { load: () => Promise<Uint8Array>; name: string; onOpenExternal?: () => void; fallback?: React.ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let task: { destroy: () => Promise<void> } | undefined;
    setState({ status: "loading" });
    (async () => {
      try {
        const [pdfjs, data] = await Promise.all([loadPdfJs(), load()]);
        if (cancelled) return;
        const loading = pdfjs.getDocument({ data });
        task = loading;
        const pdf = await loading.promise;
        const first = await pdf.getPage(1);
        const viewport = first.getViewport({ scale: 1 });
        if (!cancelled) setState({ status: "ready", pdf, aspect: viewport.height / viewport.width });
      } catch (error) {
        if (!cancelled) setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
    // `load` is recreated each render; the file name identifies the source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth - 32));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pageWidth = Math.max(200, Math.round(width * zoom));

  return (
    <section className="mb-6 overflow-hidden rounded-lg border border-slate-200">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[12px]">
        <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
        {state.status === "ready" && <span className="text-slate-500">{state.pdf.numPages} page{state.pdf.numPages === 1 ? "" : "s"}</span>}
        <div className="flex items-center overflow-hidden rounded border border-slate-200 bg-white">
          <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} className="px-1.5 py-0.5 hover:bg-slate-100" title="Zoom out" aria-label="Zoom out">
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setZoom(1)} className="w-11 border-x border-slate-200 py-0.5 font-mono text-[11px] hover:bg-slate-100" title="Fit width">
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={() => setZoom((z) => Math.min(3, z + 0.25))} className="px-1.5 py-0.5 hover:bg-slate-100" title="Zoom in" aria-label="Zoom in">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {onOpenExternal && (
          <button onClick={onOpenExternal} className="flex items-center gap-1 text-brand-ink hover:underline">
            <ExternalLink className="h-3.5 w-3.5" /> Open
          </button>
        )}
      </div>
      <div ref={body} className="max-h-[78vh] overflow-auto bg-concrete p-4">
        {state.status === "loading" && <div className="py-16 text-center text-slate-500">Loading PDF...</div>}
        {state.status === "error" &&
          (fallback ?? <div className="py-10 text-center text-slate-600">Could not show this PDF: {state.message}</div>)}
        {state.status === "ready" && width > 0 && (
          <div className="flex flex-col items-center gap-4">
            {Array.from({ length: state.pdf.numPages }, (_, i) => (
              <PdfPage key={i} pdf={state.pdf} pageNumber={i + 1} width={pageWidth} aspect={state.aspect} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function PdfPage({ pdf, pageNumber, width, aspect }: { pdf: PDFDocumentProxy; pageNumber: number; width: number; aspect: number }) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  // Pages can differ in size; until a page renders it borrows the first page's shape.
  const [pageAspect, setPageAspect] = useState(aspect);
  const height = Math.round(width * pageAspect);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setVisible(true), { rootMargin: "600px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !canvas.current) return;
    let task: { cancel: () => void; promise: Promise<void> } | undefined;
    let cancelled = false;
    void pdf.getPage(pageNumber).then((page) => {
      if (cancelled || !canvas.current) return;
      const natural = page.getViewport({ scale: 1 });
      const scale = width / natural.width;
      const ratio = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: scale * ratio });
      const el = canvas.current;
      el.width = Math.floor(viewport.width);
      el.height = Math.floor(viewport.height);
      setPageAspect(natural.height / natural.width);
      task = page.render({ canvas: el, viewport });
      task.promise.catch(() => undefined);
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [visible, pdf, pageNumber, width]);

  return (
    <div ref={holder} className="bg-white shadow-sm" style={{ width, height }}>
      <canvas ref={canvas} style={{ width, height }} aria-label={`Page ${pageNumber}`} />
    </div>
  );
}
