import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink } from "react-router";
import { useStore } from "zustand";
import { AlertTriangle, Check, Redo2, Undo2 } from "lucide-react";
import { useProjectStore } from "@/store/project-store";
import { useSelection } from "@/lib/selection";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { hasOverlayTitleBar, isDesktop } from "@/lib/desktop";
import { MaticsLogo } from "./MaticsLogo";
import { ProjectMenu } from "./ProjectMenu";
import { FileMenu } from "./FileMenu";
import { useNativeMenu } from "@/lib/native-menu";
import { fieldHandles, inSketchCanvas, stepProjectHistory } from "@/lib/editing";

const navItems = [
  { to: "/schematic", label: "Diagram" },
  { to: "/notes", label: "Documentation" },
  { to: "/communications", label: "Communications" },
  { to: "/sketches", label: "Sketches" },
];

// Room for the macOS window controls, which hide in full screen.
function useTrafficLightInset() {
  const [inset, setInset] = useState(hasOverlayTitleBar);
  useEffect(() => {
    if (!hasOverlayTitleBar()) return;
    const win = getCurrentWindow();
    const update = () => void win.isFullscreen().then((full) => setInset(!full));
    update();
    const unlisten = win.onResized(update);
    return () => void unlisten.then((stop) => stop());
  }, []);
  return inset;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { selectedId, select } = useSelection();
  const projectDir = useProjectStore((s) => s.projectDir);
  const projectId = useProjectStore((s) => s.project.id);
  const saveError = useProjectStore((s) => s.saveError);

  // The selection lives in the URL and means nothing in another project.
  const lastProjectId = useRef(projectId);
  useEffect(() => {
    if (lastProjectId.current !== projectId) select(null);
    lastProjectId.current = projectId;
  }, [projectId, select]);
  const { pastStates, futureStates } = useStore(useProjectStore.temporal);
  const saveNow = useProjectStore((s) => s.saveNow);

  // "Saved" stays up briefly after an explicit save so the click visibly did something.
  const [justSaved, setJustSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = useCallback(async () => {
    await saveNow();
    if (useProjectStore.getState().saveError) return;
    setJustSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setJustSaved(false), 1600);
  }, [saveNow]);
  useNativeMenu(save);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      // Save works from inside text fields too, and keeps the browser's save dialog away.
      if (key === "s") {
        event.preventDefault();
        void save();
        return;
      }
      const direction = key === "z" ? (event.shiftKey ? "redo" : "undo") : key === "y" ? "redo" : null;
      // The note editor already undid its own text, or the field still has typing to undo.
      // The sketch canvas keeps its own history.
      if (!direction || event.defaultPrevented || inSketchCanvas(event.target) || fieldHandles(direction, event.target)) return;
      event.preventDefault();
      stepProjectHistory(direction);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  return (
    <div className="flex h-full flex-col">
      {/* The header doubles as the window title bar: drag it to move, double-click to zoom. */}
      <header data-tauri-drag-region className={`flex h-14 shrink-0 select-none items-center gap-3 bg-charcoal pr-5 text-white ${useTrafficLightInset() ? "pl-[104px]" : "pl-5"}`}>
        <MaticsLogo inverse />
        <span className="h-6 w-px bg-white/20" />
        <ProjectMenu />
        {/* The desktop app has these in the native menu bar. */}
        {!isDesktop() && <FileMenu onSave={() => void save()} />}
        <nav className="mx-auto flex h-full gap-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={selectedId ? `${item.to}?selected=${selectedId}` : item.to}
              className={({ isActive }) =>
                `flex items-center border-b-[3px] px-4 pt-[3px] text-[15px] font-semibold ${isActive ? "border-brand text-white" : "border-transparent text-white/70 hover:text-white"}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <button
            className="rounded-md p-1.5 text-white/80 hover:bg-white/10 disabled:opacity-30"
            onClick={() => stepProjectHistory("undo")}
            disabled={pastStates.length === 0}
            title="Undo (Cmd/Ctrl+Z)"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            className="rounded-md p-1.5 text-white/80 hover:bg-white/10 disabled:opacity-30"
            onClick={() => stepProjectHistory("redo")}
            disabled={futureStates.length === 0}
            title="Redo (Shift+Cmd/Ctrl+Z)"
          >
            <Redo2 className="h-4 w-4" />
          </button>
        </div>
        {saveError ? (
          <div className="flex items-center gap-1 text-red-300" title={saveError}>
            <AlertTriangle className="h-4 w-4" /> Not saved
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-white/75" title={projectDir ?? undefined}>
            <Check className="h-4 w-4 text-white" />
            <span className={justSaved ? "font-semibold text-white" : undefined}>{justSaved ? "Saved" : isDesktop() ? "Saved to folder" : "Saved in browser"}</span>
          </div>
        )}
      </header>
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}

