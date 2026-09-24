import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useProjectStore } from "@/store/project-store";
import { desktop, isDesktop } from "./desktop";
import { reportErrors, useShowOpenedProject, type CommandId } from "./commands";

// Runs the macOS menu bar's items and opens projects the app was handed: double-clicked in
// Finder, or named on the command line on Windows and Linux. Those two have no native menu;
// the header shows the in-app File menu instead.
export function useNativeMenu(run: (command: CommandId) => void) {
  const showOpened = useShowOpenedProject();
  useEffect(() => {
    if (!isDesktop()) return;
    const store = useProjectStore.getState;

    // Including the project that launched the app.
    const openFiles = async () => {
      await store().load();
      await showOpened(async () => {
        // One bad project should not keep the others from opening.
        for (const path of await desktop.takeOpenedFiles()) await reportErrors(() => store().openProjectPath(path));
      });
    };
    void reportErrors(openFiles);
    const unlistenOpen = listen("files-opened", () => void reportErrors(openFiles));

    const unlisten = listen<CommandId>("menu", (event) => run(event.payload));
    return () => {
      void unlisten.then((stop) => stop());
      void unlistenOpen.then((stop) => stop());
    };
  }, [run, showOpened]);
}
