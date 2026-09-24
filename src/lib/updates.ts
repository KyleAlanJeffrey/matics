import { create } from "zustand";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { useProjectStore } from "@/store/project-store";
import { isDesktop } from "./desktop";

// In-app updates from the GitHub releases (see .github/workflows/release.yml). The desktop
// app checks at launch and every few hours; Check for Updates in the menu asks right away.

type Phase = "idle" | "checking" | "downloading" | "installing";

interface UpdateState {
  update: Update | null;
  phase: Phase;
  // Share of the download received, or null while the size is unknown.
  progress: number | null;
  error: string | null;
  dismissed: boolean;
}

export const useUpdates = create<UpdateState>(() => ({ update: null, phase: "idle", progress: null, error: null, dismissed: false }));

const RECHECK_MS = 6 * 60 * 60 * 1000;

export function watchForUpdates() {
  // A dev build is always older than the latest release.
  if (!isDesktop() || import.meta.env.DEV) return () => {};
  const first = setTimeout(() => void checkForUpdates(false), 5000);
  const repeat = setInterval(() => void checkForUpdates(false), RECHECK_MS);
  return () => {
    clearTimeout(first);
    clearInterval(repeat);
  };
}

// A background check stays quiet about being offline or up to date; a manual one says so.
export async function checkForUpdates(manual: boolean) {
  if (!isDesktop() || useUpdates.getState().phase !== "idle") return;
  useUpdates.setState({ phase: "checking", error: null });
  try {
    const update = await check();
    useUpdates.setState({ update, phase: "idle", dismissed: false });
    if (manual && !update) window.alert(`Matics ${await getVersion()} is the latest version.`);
  } catch (error) {
    useUpdates.setState({ phase: "idle" });
    if (manual) window.alert(`Could not check for updates: ${message(error)}`);
  }
}

export async function installUpdate() {
  const { update } = useUpdates.getState();
  if (!update) return;
  useUpdates.setState({ phase: "downloading", progress: null, error: null });
  try {
    let total = 0;
    let received = 0;
    await update.download((event) => {
      if (event.event === "Started") total = event.data.contentLength ?? 0;
      if (event.event === "Progress") {
        received += event.data.chunkLength;
        useUpdates.setState({ progress: total > 0 ? received / total : null });
      }
    });
    // On Windows the installer closes the app as soon as it starts.
    const store = useProjectStore.getState();
    await store.saveNow();
    const saveError = useProjectStore.getState().saveError;
    if (saveError) throw new Error(`the project could not be saved (${saveError})`);
    useUpdates.setState({ phase: "installing" });
    await update.install();
    await relaunch();
  } catch (error) {
    useUpdates.setState({ phase: "idle", error: `The update was not installed: ${message(error)}` });
  }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
