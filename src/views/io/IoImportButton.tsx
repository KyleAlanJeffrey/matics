import { useRef, useState } from "react";
import { FileUp, Info } from "lucide-react";
import { useProject, useProjectStore } from "@/store/project-store";
import { ioMapModules, parseIoMap, type ImportedModule } from "@/model/io";
import type { Project } from "@/model/types";

interface Pending {
  fileName: string;
  modules: ImportedModule[];
  interfaceBindings: number;
  skipped: number;
}

// The device a mapping most likely belongs to: one named after a module in the file
// (the CPU usually is), else the controller in view.
function guessController(project: Project, modules: ImportedModule[], fallback?: string) {
  const names = modules.map((m) => m.name.toLowerCase());
  const named = Object.values(project.devices).find((device) => {
    const model = project.presets[device.presetId]?.model.toLowerCase();
    return names.includes(device.name.toLowerCase()) || (!!model && names.includes(model));
  });
  return named?.id ?? (fallback && project.devices[fallback] ? fallback : Object.keys(project.devices)[0] ?? "");
}

export function IoImportButton({ defaultDeviceId, onImported }: { defaultDeviceId?: string; onImported: (moduleId: string) => void }) {
  const project = useProject();
  const importIoMap = useProjectStore((s) => s.importIoMap);
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const read = async (file: File) => {
    setNotice(null);
    try {
      const parsed = parseIoMap(await file.text());
      const modules = ioMapModules(parsed);
      if (modules.length === 0) {
        setNotice(`${file.name}: no channel bindings found.`);
        return;
      }
      setPending({ fileName: file.name, modules, interfaceBindings: parsed.interfaceBindings, skipped: parsed.skipped.length });
      setDeviceId(guessController(project, modules, defaultDeviceId));
    } catch (error) {
      setNotice(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const confirm = () => {
    if (!pending || !deviceId) return;
    const result = importIoMap(deviceId, pending.modules);
    const extras = [
      pending.interfaceBindings > 0 && `${pending.interfaceBindings} network interface mapping${pending.interfaceBindings === 1 ? " was" : "s were"} not imported`,
      pending.skipped > 0 && `${pending.skipped} line${pending.skipped === 1 ? "" : "s"} could not be read`,
    ].filter(Boolean);
    setNotice(
      `${pending.fileName}: ${result.added} signal${result.added === 1 ? "" : "s"} added${result.updated ? `, ${result.updated} updated` : ""}${result.modules ? `, ${result.modules} new module${result.modules === 1 ? "" : "s"}` : ""}.${extras.length ? ` ${extras.join("; ")}.` : ""}`,
    );
    const first = Object.values(useProjectStore.getState().project.ioModules).find((m) => m.deviceId === deviceId && m.name === pending.modules[0].name);
    setPending(null);
    if (first) onImported(first.id);
  };

  const signalCount = pending?.modules.reduce((n, m) => n + m.signals.length, 0) ?? 0;

  return (
    <div className="relative">
      <button onClick={() => input.current?.click()} className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-slate-700 hover:bg-slate-50" title="Add channel bindings from a B&R IoMap.iom file">
        <FileUp className="h-4 w-4" /> Import
      </button>
      <input
        ref={input}
        type="file"
        accept=".iom,.txt"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void read(file);
          e.target.value = "";
        }}
      />
      {pending && (
        <div className="absolute right-0 top-full z-40 mt-1 flex w-96 flex-col gap-2 rounded-md border border-slate-200 bg-white p-3 text-slate-700 shadow-lg">
          <div className="font-semibold text-slate-900">Import {pending.fileName}</div>
          <div className="text-[12px] text-slate-500">
            {signalCount} bindings on {pending.modules.length} module{pending.modules.length === 1 ? "" : "s"}. Existing channels get the new binding and keep their field device, pin and notes.
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-slate-500">Controller</span>
            <select className="input" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
              {Object.values(project.devices).map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <button onClick={() => setPending(null)} className="rounded-md border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button onClick={confirm} disabled={!deviceId} className="rounded-md bg-brand px-3 py-1 font-semibold text-charcoal hover:bg-brand-hover disabled:opacity-50">
              Import
            </button>
          </div>
        </div>
      )}
      {notice && !pending && (
        <div className="absolute right-0 top-full z-40 mt-1 flex w-80 items-start gap-2 rounded-md border border-slate-200 bg-white p-2.5 text-[12px] text-slate-700 shadow-lg">
          <Info className="mt-px h-3.5 w-3.5 shrink-0 text-slate-500" />
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice(null)} className="text-slate-400 hover:text-slate-700">
            Close
          </button>
        </div>
      )}
    </div>
  );
}
