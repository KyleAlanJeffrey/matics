import { useEffect, useRef } from "react";
import { Excalidraw, hashElementsVersion } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, BinaryFiles } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import "@excalidraw/excalidraw/index.css";
import type { Sketch } from "@/model/types";
import { registerBufferedEditor } from "@/store/project-store";

const SAVE_DELAY_MS = 400;

// The Excalidraw editor for one sketch. Mounted per sketch (keyed by id), so its own undo
// history belongs to that sketch. Loaded lazily: Excalidraw is large.
export default function SketchCanvas({
  sketch,
  onScene,
  onApi,
  onOpenLink,
}: {
  sketch: Sketch;
  onScene: (elements: unknown[], files: Record<string, unknown>) => void;
  onApi: (api: ExcalidrawImperativeAPI | null) => void;
  onOpenLink: (link: string) => boolean;
}) {
  const lastVersion = useRef<number | null>(null);
  const pending = useRef<{ elements: readonly OrderedExcalidrawElement[]; files: BinaryFiles } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSceneRef = useRef(onScene);
  onSceneRef.current = onScene;

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const scene = pending.current;
    pending.current = null;
    if (!scene) return;
    // Excalidraw keeps mutating its elements; the store freezes what it is given, so it gets copies.
    const elements = scene.elements.filter((el) => !el.isDeleted);
    const used = new Set<string>(elements.flatMap((el) => ("fileId" in el && el.fileId ? [el.fileId] : [])));
    const files = Object.fromEntries(Object.entries(scene.files).filter(([id]) => used.has(id)));
    onSceneRef.current(structuredClone(elements), structuredClone(files));
  };

  useEffect(() => {
    const unregister = registerBufferedEditor(flush);
    return () => {
      unregister();
      flush();
    };
  }, []);

  return (
    <Excalidraw
      // Frozen store data must not reach Excalidraw, which edits elements in place.
      initialData={{
        elements: structuredClone(sketch.elements) as OrderedExcalidrawElement[],
        files: structuredClone(sketch.files ?? {}) as BinaryFiles,
        appState: { viewBackgroundColor: "#fbfbf9" },
        scrollToContent: true,
      }}
      excalidrawAPI={onApi}
      name={sketch.name}
      UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false, toggleTheme: false, saveAsImage: false } }}
      onLinkOpen={(_element, event) => {
        const link = _element.link;
        if (link && onOpenLink(link)) event.preventDefault();
      }}
      onChange={(elements, _appState, files) => {
        // Selection and scrolling fire onChange too; only element or file changes are saved.
        const version = hashElementsVersion(elements) + Object.keys(files).length;
        if (lastVersion.current === null) {
          lastVersion.current = version;
          return;
        }
        if (version === lastVersion.current) return;
        lastVersion.current = version;
        pending.current = { elements, files };
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(flush, SAVE_DELAY_MS);
      }}
    />
  );
}
