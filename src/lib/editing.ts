import { redo as redoText, undo as undoText } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { useProjectStore } from "@/store/project-store";

export type HistoryDirection = "undo" | "redo";

export function isEditingText(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

// A plain text field undoes its own typing while it has any; after that, undo reaches the
// project. The note editor keeps its own history (see undoOrRedo).
export function fieldHandles(direction: HistoryDirection, target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!isEditingText(el) || el?.closest(".cm-editor")) return false;
  return document.queryCommandEnabled(direction);
}

export function stepProjectHistory(direction: HistoryDirection) {
  const history = useProjectStore.temporal.getState();
  // History holds whole-project snapshots; sketches keep their own undo and must not roll back.
  const sketches = useProjectStore.getState().project.sketches;
  if (direction === "undo") history.undo();
  else history.redo();
  useProjectStore.getState().keepSketches(sketches);
}

// Excalidraw handles its own undo from key events. The desktop Edit menu takes the
// shortcut first, so it is replayed as a key event inside the sketch canvas.
function sketchCanvasHandles(direction: HistoryDirection, active: HTMLElement | null) {
  const canvas = active?.closest<HTMLElement>(".excalidraw");
  if (!canvas || isEditingText(active)) return false;
  const mac = /Mac/.test(navigator.platform);
  canvas.dispatchEvent(
    new KeyboardEvent("keydown", { key: "z", code: "KeyZ", metaKey: mac, ctrlKey: !mac, shiftKey: direction === "redo", bubbles: true, cancelable: true }),
  );
  return true;
}

export function inSketchCanvas(target: EventTarget | null) {
  return !!(target as HTMLElement | null)?.closest?.(".excalidraw");
}

// For the desktop Edit menu, whose shortcut arrives here instead of as a key event.
export function undoOrRedo(direction: HistoryDirection) {
  const active = document.activeElement as HTMLElement | null;
  if (sketchCanvasHandles(direction, active)) return;
  const editorDom = active?.closest<HTMLElement>(".cm-editor");
  const editor = editorDom ? EditorView.findFromDOM(editorDom) : null;
  if (editor && (direction === "undo" ? undoText : redoText)(editor)) return;
  if (fieldHandles(direction, active)) {
    document.execCommand(direction);
    return;
  }
  stepProjectHistory(direction);
}
