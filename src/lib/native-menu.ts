import { useEffect } from "react";
import { useNavigate } from "react-router";
import { listen } from "@tauri-apps/api/event";
import { useProjectStore } from "@/store/project-store";
import { desktop, fileName, isDesktop } from "./desktop";
import { undoOrRedo } from "./editing";

// Ids match src-tauri/src/menu.rs.
const PAGES: Record<string, string> = {
  "view:schematic": "/schematic",
  "view:communications": "/communications",
  "view:sketches": "/sketches",
  "view:documentation": "/notes",
  "view:report": "/report",
  "file:export-report-pdf": "/report?download=pdf",
  "file:export-report-png": "/report?download=png",
  "file:export-schematic-png": "/report?download=schematic",
};

async function pickJson(title: string): Promise<File | null> {
  const path = await desktop.pickFile(title, [{ name: "JSON", extensions: ["json"] }]);
  if (!path) return null;
  return new File([await desktop.readImportFile(path)], fileName(path), { type: "application/json" });
}

async function report(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : String(error));
  }
}

// Handles the native menu bar in the desktop app. The browser build has no native menu and
// shows an in-app File menu instead.
export function useNativeMenu(save: () => Promise<void>) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isDesktop()) return;
    const store = useProjectStore.getState;
    const handlers: Record<string, () => Promise<unknown>> = {
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

    // Packages double-clicked in Finder, including the one that launched the app.
    const openFiles = async () => {
      await store().load();
      // One bad package should not keep the others from opening.
      for (const path of await desktop.takeOpenedFiles()) await report(() => store().openPackage(path));
    };
    void report(openFiles);
    const unlistenOpen = listen("files-opened", () => void report(openFiles));

    const unlisten = listen<string>("menu", (event) => {
      const page = PAGES[event.payload];
      if (page) navigate(page);
      else if (handlers[event.payload]) void report(handlers[event.payload]);
    });
    return () => {
      void unlisten.then((stop) => stop());
      void unlistenOpen.then((stop) => stop());
    };
  }, [navigate, save]);
}
