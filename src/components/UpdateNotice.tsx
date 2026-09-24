import { CircleArrowDown } from "lucide-react";
import { installUpdate, useUpdates } from "@/lib/updates";
import { MenuPanel, useDropdown } from "./Menu";

// Shown in the header once a newer release is out.
// `versionClass` can hide the version in the label on narrow windows.
export function UpdateNotice({ versionClass = "" }: { versionClass?: string }) {
  const { update, phase, progress, error, dismissed } = useUpdates();
  const { open, setOpen, ref } = useDropdown();
  if (!update || dismissed) return null;

  const busy = phase === "downloading" || phase === "installing";
  const status =
    phase === "downloading"
      ? `Downloading${progress === null ? "..." : ` ${Math.round(progress * 100)}%`}`
      : phase === "installing"
        ? "Installing..."
        : null;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 whitespace-nowrap rounded-md bg-brand px-2.5 py-1 text-[13px] font-semibold text-white hover:bg-brand-hover"
        title={`Matics ${update.version} is available`}
      >
        <CircleArrowDown className="h-4 w-4" />
        {status ?? (
          <span>
            Update<span className={versionClass}> to {update.version}</span>
          </span>
        )}
      </button>
      {open && (
        <MenuPanel align="right">
          <div className="space-y-3 p-2">
            <div>
              <div className="font-semibold">Matics {update.version} is available</div>
              <div className="text-[12px] text-slate-500">You have {update.currentVersion}. Your project is saved before Matics restarts.</div>
            </div>
            {error && <div className="text-[12px] text-red-700">{error}</div>}
            <div className="flex justify-end gap-2">
              <button onClick={() => useUpdates.setState({ dismissed: true })} disabled={busy} className="rounded-md px-2.5 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-40">
                Later
              </button>
              <button onClick={() => void installUpdate()} disabled={busy} className="rounded-md bg-brand px-2.5 py-1 font-semibold text-white hover:bg-brand-hover disabled:opacity-60">
                {status ?? "Restart and update"}
              </button>
            </div>
          </div>
        </MenuPanel>
      )}
    </div>
  );
}
