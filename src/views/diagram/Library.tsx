import { useRef, useState } from "react";
import { Download, Plus, Search, Upload } from "lucide-react";
import { useProject, useProjectDir, useProjectStore } from "@/store/project-store";
import { assetSrc } from "@/lib/assets";
import { categoryIcon } from "@/lib/icons";
import { CATEGORY_LABELS, type DeviceCategory } from "@/model/types";
import { PresetEditor } from "./PresetEditor";

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as DeviceCategory[];

export const PRESET_DRAG_TYPE = "application/x-diagram-preset";

export function Library({ onAdd }: { onAdd: (presetId: string) => void }) {
  const project = useProject();
  const projectDir = useProjectDir();
  const { exportLibrary, importLibrary } = useProjectStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const count = await importLibrary(file);
      window.alert(`Imported ${count} product${count === 1 ? "" : "s"}.`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not import that file.");
    }
  };
  const q = search.trim().toLowerCase();
  const placed: Record<string, number> = {};
  for (const device of Object.values(project.devices)) placed[device.presetId] = (placed[device.presetId] ?? 0) + device.qty;
  const presets = Object.values(project.presets).filter((p) => !q || `${p.name} ${p.manufacturer} ${p.model} ${p.summary}`.toLowerCase().includes(q));

  return (
    <aside className="flex w-[272px] shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center justify-between px-4 pb-1 pt-3">
        <span className="text-[15px] font-bold text-slate-900">Device library</span>
        <button onClick={() => setCreating(true)} className="flex items-center gap-1 text-brand-ink hover:underline">
          <Plus className="h-3.5 w-3.5" /> New preset
        </button>
      </div>
      <div className="relative px-3 py-2">
        <Search className="pointer-events-none absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input className="input !pl-7" placeholder="Search devices..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {CATEGORY_ORDER.map((category) => {
          const group = presets.filter((p) => p.category === category);
          if (group.length === 0) return null;
          const Icon = categoryIcon(category);
          return (
            <div key={category} className="mt-2">
              <div className="flex items-baseline justify-between px-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                {CATEGORY_LABELS[category]}
                <span className="font-medium tracking-normal text-slate-400">{group.length}</span>
              </div>
              {group.map((preset) => (
                <div
                  key={preset.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData(PRESET_DRAG_TYPE, preset.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  className="group flex cursor-grab items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-100/70 active:cursor-grabbing"
                >
                  <div className="flex h-11 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white p-1">
                    {assetSrc(preset.imageUrl, projectDir) ? (
                      <img src={assetSrc(preset.imageUrl, projectDir)} alt="" draggable={false} className="max-h-full max-w-full object-contain" />
                    ) : (
                      <Icon className="h-5 w-5 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold leading-snug text-slate-900">{preset.name}</div>
                    <div className="truncate text-[11.5px] leading-snug text-slate-500">{preset.summary}</div>
                  </div>
                  {placed[preset.id] > 0 && (
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 text-[10.5px] font-semibold text-slate-600 group-focus-within:hidden group-hover:hidden" title={`${placed[preset.id]} placed in this diagram`}>
                      {placed[preset.id]}
                    </span>
                  )}
                  <button
                    onClick={() => onAdd(preset.id)}
                    title="Add to canvas"
                    className="rounded p-1 text-brand-ink opacity-0 hover:bg-brand-wash focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          );
        })}
        {presets.length === 0 && <div className="p-3 text-center text-slate-400">No presets match.</div>}
      </div>
      <div className="border-t border-slate-200 px-4 py-2 text-[11px] text-slate-500">Drag a device onto the canvas, or hover and click +</div>
      <div className="flex items-center gap-1 border-t border-slate-200 px-2 py-1.5 text-[11px]">
        <span className="mr-auto pl-1 font-semibold text-slate-500">Products</span>
        <button onClick={() => void exportLibrary()} className="flex items-center gap-1 rounded px-1.5 py-1 text-slate-600 hover:bg-slate-100" title="Export the product library as JSON">
          <Download className="h-3.5 w-3.5" /> Export
        </button>
        <button onClick={() => fileInput.current?.click()} className="flex items-center gap-1 rounded px-1.5 py-1 text-slate-600 hover:bg-slate-100" title="Import products from a JSON file">
          <Upload className="h-3.5 w-3.5" /> Import
        </button>
        <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onImport(e.target.files?.[0])} />
      </div>
      {creating && <PresetEditor onClose={() => setCreating(false)} />}
    </aside>
  );
}
