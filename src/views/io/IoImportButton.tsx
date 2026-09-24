import { useRef, useState } from "react";
import { FileUp, Info } from "lucide-react";
import { useProject, useProjectStore } from "@/store/project-store";
import { ioMapModules, parseIoMap, type ImportedModule } from "@/model/io";
import { ioMapInterfaces, type ImportedInterface } from "@/model/net";
import type { Project } from "@/model/types";

interface Pending {
  fileName: string;
  modules: ImportedModule[];
  interfaces: ImportedInterface[];
  skipped: number;
}

export interface IoMapImported {
  deviceId: string;
  moduleId?: string;
  interfaceId?: string;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

// The device a mapping most likely belongs to: one named after a module in the file
// (the CPU usually is), else the controller in view.
function guessController(project: Project, pending: Pick<Pending, "modules" | "interfaces">, fallback?: string) {
  const names = [...pending.modules, ...pending.interfaces.map((i) => ({ name: i.module }))].map((m) => m.name.toLowerCase());
  const named = Object.values(project.devices).find((device) => {
    const model = project.presets[device.presetId]?.model.toLowerCase();
    return names.includes(device.name.toLowerCase()) || (!!model && names.includes(model));
  });
  return named?.id ?? (fallback && project.devices[fallback] ? fallback : Object.keys(project.devices)[0] ?? "");
}

// Reads a B&R IoMap.iom: channel bindings go to I/O and interface mappings to Communications.
export function IoImportButton({ defaultDeviceId, onImported }: { defaultDeviceId?: string; onImported: (imported: IoMapImported) => void }) {
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
      const found = { modules: ioMapModules(parsed), interfaces: ioMapInterfaces(parsed) };
      if (found.modules.length === 0 && found.interfaces.length === 0) {
        setNotice(`${file.name}: no bindings found.`);
        return;
      }
      setPending({ fileName: file.name, ...found, skipped: parsed.skipped.length });
      setDeviceId(guessController(project, found, defaultDeviceId));
    } catch (error) {
      setNotice(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const confirm = () => {
    if (!pending || !deviceId) return;
    const result = importIoMap(deviceId, pending.modules, pending.interfaces);
    const parts = [
      pending.modules.length > 0 && `${plural(result.added, "signal")} added${result.updated ? `, ${result.updated} updated` : ""}${result.modules ? ` (${plural(result.modules, "new module")})` : ""}`,
      pending.interfaces.length > 0 &&
        `${plural(result.mappingsAdded, "network mapping")} added${result.mappingsUpdated ? `, ${result.mappingsUpdated} updated` : ""}${result.interfaces ? ` (${plural(result.interfaces, "new interface")})` : ""}`,
      result.unpaired > 0 && `${plural(result.unpaired, "earlier binding")} left as it was, because its variable changed along with another on the same channel or symbol; check which to keep`,
      pending.skipped > 0 && `${plural(pending.skipped, "line")} could not be read`,
    ].filter(Boolean);
    setNotice(`${pending.fileName}: ${parts.join("; ")}.`);
    const { ioModules, netInterfaces } = useProjectStore.getState().project;
    const firstModule = pending.modules[0] && Object.values(ioModules).find((m) => m.deviceId === deviceId && m.name === pending.modules[0].name);
    const firstInterface = pending.interfaces[0] && Object.values(netInterfaces).find((i) => i.deviceId === deviceId && i.module === pending.interfaces[0].module && i.name === pending.interfaces[0].name);
    setPending(null);
    onImported({ deviceId, moduleId: firstModule?.id, interfaceId: firstInterface?.id });
  };

  const signalCount = pending?.modules.reduce((n, m) => n + m.signals.length, 0) ?? 0;
  const mappingCount = pending?.interfaces.reduce((n, i) => n + i.mappings.length, 0) ?? 0;

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
            {[signalCount > 0 && `${plural(signalCount, "channel binding")} on ${plural(pending.modules.length, "module")}`, mappingCount > 0 && `${plural(mappingCount, "network mapping")} on ${plural(pending.interfaces.length, "interface")}`]
              .filter(Boolean)
              .join(" and ")}
            . Existing channels and mappings get the new binding and keep what you documented.
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
