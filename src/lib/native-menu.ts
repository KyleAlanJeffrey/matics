import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useProjectStore } from "@/store/project-store";
import { desktop, isDesktop } from "./desktop";
import { reportErrors, type CommandId } from "./commands";

// Runs the macOS menu bar's items and opens packages handed over by Finder. Windows and
// Linux have no native menu; the header shows the in-app File menu instead.
export function useNativeMenu(run: (command: CommandId) => void) {
  useEffect(() => {
    if (!isDesktop()) return;
    const store = useProjectStore.getState;

    // Packages double-clicked in Finder, including the one that launched the app.
    const openFiles = async () => {
      await store().load();
      // One bad package should not keep the others from opening.
      for (const path of await desktop.takeOpenedFiles()) await reportErrors(() => store().openPackage(path));
    };
    void reportErrors(openFiles);
    const unlistenOpen = listen("files-opened", () => void reportErrors(openFiles));

    const unlisten = listen<CommandId>("menu", (event) => run(event.payload));
    return () => {
      void unlisten.then((stop) => stop());
      void unlistenOpen.then((stop) => stop());
    };
  }, [run]);
}
