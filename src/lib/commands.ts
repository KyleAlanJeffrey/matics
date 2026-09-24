import { createContext, useCallback, useContext, useEffect } from "react";
import { useNavigate } from "react-router";
import { useProjectStore } from "@/store/project-store";
import { desktop, fileName, hasNativeMenu, isDesktop } from "./desktop";
import { undoOrRedo } from "./editing";
import { checkForUpdates } from "./updates";

// Everything the File menu can do, run from the macOS menu bar (ids match
// src-tauri/src/menu.rs), the in-app File menu, and the shortcuts below.
export type CommandId =
  | "app:check-updates"
  | "file:new"
  | "file:open-folder"
  | "file:open-package"
  | "file:save"
  | "file:export-package"
  | "file:import-diagram"
  | "file:export-diagram"
  | "file:import-products"
  | "file:export-products"
  | "file:export-report-pdf"
  | "file:export-report-png"
  | "file:export-schematic-png"
  | "edit:undo"
  | "edit:redo"
  | "view:home"
  | "view:schematic"
  | "view:documentation"
  | "view:communications"
  | "view:sketches"
  | "view:report";

export const HOME_PATH = "/";

const PAGES: Partial<Record<CommandId, string>> = {
  "view:home": HOME_PATH,
  "view:schematic": "/schematic",
  "view:communications": "/communications",
  "view:sketches": "/sketches",
  "view:documentation": "/notes",
  "view:report": "/report",
  "file:export-report-pdf": "/report?download=pdf",
  "file:export-report-png": "/report?download=png",
  "file:export-schematic-png": "/report?download=schematic",
};

// The macOS menu bar owns these; on Windows and Linux the page handles them. Cmd/Ctrl+S
// and Z are handled by AppShell everywhere.
const SHORTCUTS: { key: string; shift?: boolean; command: CommandId }[] = [
  { key: "n", command: "file:new" },
  { key: "o", command: "file:open-folder" },
  { key: "o", shift: true, command: "file:open-package" },
  { key: "s", shift: true, command: "file:export-package" },
  { key: "i", shift: true, command: "file:import-diagram" },
  { key: "e", shift: true, command: "file:export-diagram" },
  { key: "p", command: "file:export-report-pdf" },
  { key: "0", command: "view:home" },
  { key: "1", command: "view:schematic" },
  { key: "2", command: "view:documentation" },
  { key: "3", command: "view:communications" },
  { key: "4", command: "view:sketches" },
  { key: "5", command: "view:report" },
];

export function shortcutFor(command: CommandId) {
  const shortcut = SHORTCUTS.find((s) => s.command === command);
  if (!shortcut) return undefined;
  const mod = hasNativeMenu() ? "Cmd" : "Ctrl";
  return `${mod}+${shortcut.shift ? "Shift+" : ""}${shortcut.key.toUpperCase()}`;
}

async function pickJson(title: string): Promise<File | null> {
  const path = await desktop.pickFile(title, [{ name: "JSON", extensions: ["json"] }]);
  if (!path) return null;
  return new File([await desktop.readImportFile(path)], fileName(path), { type: "application/json" });
}

export async function reportErrors(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : String(error));
  }
}

// The project home has no project on screen, so a command there that opens one (New,
// Open, Import) goes on to show it.
export function useShowOpenedProject() {
  const navigate = useNavigate();
  return useCallback(
    async (action: () => Promise<unknown>) => {
      const before = useProjectStore.getState().project.id;
      await action();
      if (window.location.pathname === HOME_PATH && useProjectStore.getState().project.id !== before) navigate("/schematic");
    },
    [navigate],
  );
}

export function useCommands(save: () => Promise<void>) {
  const navigate = useNavigate();
  const showOpened = useShowOpenedProject();
  return useCallback(
    (command: CommandId) => {
      const page = PAGES[command];
      if (page) {
        navigate(page);
        return;
      }
      const store = useProjectStore.getState;
      const handlers: Partial<Record<CommandId, () => Promise<unknown>>> = {
        "app:check-updates": () => checkForUpdates(true),
        "file:new": async () => {
          const name = window.prompt("Name for the new diagram", "New diagram");
          if (name?.trim()) await store().createProject(name.trim(), { copyLibrary: true });
        },
        "file:open-folder": () => store().openProjectFolder(),
        "file:open-package": () => store().openPackage(),
        "file:export-package": () => store().packageProject(),
        "file:save": save,
        "file:import-diagram": async () => {
          const file = await pickJson("Import diagram");
          if (file) await store().importProject(file);
        },
        "file:export-diagram": () => store().exportProject(),
        "file:import-products": async () => {
          const file = await pickJson("Import products");
          if (!file) return;
          const count = await store().importLibrary(file);
          window.alert(count === 1 ? "Imported 1 product." : `Imported ${count} products.`);
        },
        "file:export-products": () => store().exportLibrary(),
        "edit:undo": async () => undoOrRedo("undo"),
        "edit:redo": async () => undoOrRedo("redo"),
      };
      const handler = handlers[command];
      if (handler) void reportErrors(() => showOpened(handler));
    },
    [navigate, save, showOpened],
  );
}

// The header's commands, for pages that offer some of them too.
export const CommandsContext = createContext<(command: CommandId) => void>(() => {});

export function useRunCommand() {
  return useContext(CommandsContext);
}

// The browser keeps its own Ctrl+N, Ctrl+P and Ctrl+1 to 5, so only the desktop app
// takes them over.
export function useCommandShortcuts(run: (command: CommandId) => void) {
  useEffect(() => {
    if (!isDesktop() || hasNativeMenu()) return;
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.metaKey) return;
      const key = event.key.toLowerCase();
      const shortcut = SHORTCUTS.find((s) => s.key === key && !!s.shift === event.shiftKey);
      if (!shortcut) return;
      event.preventDefault();
      run(shortcut.command);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run]);
}
