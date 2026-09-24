import { createContext, useCallback, useContext, useEffect } from "react";
import { useNavigate } from "react-router";
import { MATICS_FILTER, useProjectStore } from "@/store/project-store";
import { desktop, desktopPlatform, hasNativeMenu, isDesktop } from "./desktop";
import { undoOrRedo } from "./editing";
import { checkForUpdates } from "./updates";

// Everything the File menu can do, run from the macOS menu bar (ids match
// src-tauri/src/menu.rs), the in-app File menu, and the shortcuts below.
export type CommandId =
  | "app:check-updates"
  | "file:new"
  | "file:open-project"
  | "file:open-compressed"
  | "file:save"
  | "file:save-compressed"
  | "file:export-report-pdf"
  | "file:export-report-png"
  | "file:export-schematic-png"
  | "edit:undo"
  | "edit:redo"
  | "view:home"
  | "view:schematic"
  | "view:documentation"
  | "view:io"
  | "view:communications"
  | "view:sketches"
  | "view:report";

export const HOME_PATH = "/";

const PAGES: Partial<Record<CommandId, string>> = {
  "view:home": HOME_PATH,
  "view:schematic": "/schematic",
  "view:io": "/io",
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
  { key: "o", command: "file:open-project" },
  { key: "o", shift: true, command: "file:open-compressed" },
  { key: "s", shift: true, command: "file:save-compressed" },
  { key: "p", command: "file:export-report-pdf" },
  { key: "0", command: "view:home" },
  { key: "1", command: "view:schematic" },
  { key: "2", command: "view:documentation" },
  { key: "3", command: "view:io" },
  { key: "4", command: "view:communications" },
  { key: "5", command: "view:sketches" },
  { key: "6", command: "view:report" },
];

export function shortcutFor(command: CommandId) {
  const shortcut = SHORTCUTS.find((s) => s.command === command);
  if (!shortcut) return undefined;
  const mod = hasNativeMenu() ? "Cmd" : "Ctrl";
  return `${mod}+${shortcut.shift ? "Shift+" : ""}${shortcut.key.toUpperCase()}`;
}

// macOS shows a .matics folder as a single document, which only a file panel can pick; there
// it also picks compressed files. Elsewhere a .matics folder is picked as a folder.
async function pickProject() {
  if (desktopPlatform() === "mac") return desktop.pickFile("Open project", [MATICS_FILTER]);
  return desktop.pickFolder("Open a .matics project folder");
}

async function openPicked(path: string | null) {
  if (path) await useProjectStore.getState().openProjectPath(path);
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
        "file:open-project": async () => openPicked(await pickProject()),
        "file:open-compressed": async () => openPicked(await desktop.pickFile("Open compressed project", [MATICS_FILTER])),
        "file:save-compressed": () => store().saveCompressedCopy(),
        "file:save": save,
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
