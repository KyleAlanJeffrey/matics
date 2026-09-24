import { useState } from "react";
import { ImagePlus, Plus, Trash2, X } from "lucide-react";
import { useProjectDir, useProjectStore } from "@/store/project-store";
import { assetSrc } from "@/lib/assets";
import { isDesktop } from "@/lib/desktop";
import {
  CATEGORY_LABELS,
  PORT_KINDS,
  PORT_KIND_LABELS,
  type DeviceCategory,
  type DevicePreset,
  type PortTemplate,
} from "@/model/types";
import { fileToThumbnailDataUrl } from "@/lib/image";

type Draft = Omit<DevicePreset, "id">;

const CATEGORIES = Object.keys(CATEGORY_LABELS) as DeviceCategory[];

function emptyDraft(): Draft {
  return { name: "", manufacturer: "", model: "", category: "controller", summary: "", ports: [] };
}

function newPort(): PortTemplate {
  return { id: `port-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name: "", kind: "can", count: 1, direction: "bidirectional" };
}

export function PresetEditor({ preset, onClose }: { preset?: DevicePreset; onClose: (savedId?: string) => void }) {
  const { addPreset, updatePreset, pickAsset } = useProjectStore();
  const projectDir = useProjectDir();
  const [draft, setDraft] = useState<Draft>(() => (preset ? { ...preset, ports: preset.ports.map((p) => ({ ...p })) } : emptyDraft()));
  const [imageError, setImageError] = useState<string | null>(null);

  const patch = (changes: Partial<Draft>) => setDraft((d) => ({ ...d, ...changes }));
  const patchPort = (portId: string, changes: Partial<PortTemplate>) =>
    patch({ ports: draft.ports.map((p) => (p.id === portId ? { ...p, ...changes } : p)) });

  const onImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      patch({ imageUrl: await fileToThumbnailDataUrl(file) });
      setImageError(null);
    } catch {
      setImageError("Could not read that image.");
    }
  };

  const onPickImage = async () => {
    try {
      const picked = await pickAsset("image");
      if (picked) patch({ imageUrl: picked.rel });
      setImageError(null);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Could not copy that image into the project.");
    }
  };
  const previewSrc = assetSrc(draft.imageUrl, projectDir);

  const canSave = draft.name.trim().length > 0 && draft.ports.every((p) => p.name.trim().length > 0);

  const save = () => {
    if (!canSave) return;
    const clean: Draft = { ...draft, name: draft.name.trim(), summary: draft.summary.trim() || draft.ports.map((p) => p.name).join(", "), role: draft.role?.trim() || undefined };
    if (preset) {
      updatePreset(preset.id, clean);
      onClose(preset.id);
    } else {
      onClose(addPreset(clean));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4" onMouseDown={() => onClose()}>
      <div className="flex max-h-full w-[640px] flex-col overflow-hidden rounded-xl bg-white shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="font-semibold">{preset ? "Edit preset" : "New device preset"}</div>
          <button onClick={() => onClose()} className="rounded p-1 text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div className="flex gap-4">
            <label
              onClick={isDesktop() ? (e) => { e.preventDefault(); void onPickImage(); } : undefined}
              className="flex h-28 w-28 shrink-0 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-500 hover:border-brand hover:bg-brand-wash"
            >
              {previewSrc ? (
                <img src={previewSrc} alt="" className="h-full w-full object-contain p-1" />
              ) : (
                <>
                  <ImagePlus className="mb-1 h-6 w-6" />
                  <span className="text-[11px]">Add image</span>
                </>
              )}
              {!isDesktop() && <input type="file" accept="image/*" className="hidden" onChange={(e) => void onImage(e.target.files?.[0])} />}
            </label>
            <div className="grid flex-1 grid-cols-2 gap-3">
              <Field label="Name" className="col-span-2">
                <input className="input" autoFocus value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Motor driver MD-200" />
              </Field>
              <Field label="Manufacturer">
                <input className="input" value={draft.manufacturer} onChange={(e) => patch({ manufacturer: e.target.value })} />
              </Field>
              <Field label="Model">
                <input className="input" value={draft.model} onChange={(e) => patch({ model: e.target.value })} />
              </Field>
              <Field label="Category">
                <select className="input" value={draft.category} onChange={(e) => patch({ category: e.target.value as DeviceCategory })}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
          {draft.imageUrl && (
            <button className="self-start text-[11px] text-slate-500 hover:underline" onClick={() => patch({ imageUrl: undefined })}>
              Remove image
            </button>
          )}
          {imageError && <div className="text-[11px] text-red-600">{imageError}</div>}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Summary (shown in the library)">
              <input className="input" value={draft.summary} onChange={(e) => patch({ summary: e.target.value })} placeholder="1 CAN, 10 inputs" />
            </Field>
            <Field label="Role (shown on the card)">
              <input className="input" value={draft.role ?? ""} onChange={(e) => patch({ role: e.target.value || undefined })} placeholder="Gateway, Compute, I/O controller" />
            </Field>
            <Field label="Product page URL">
              <input
                className="input"
                type="url"
                value={draft.productUrl ?? ""}
                onChange={(e) => patch({ productUrl: e.target.value || undefined })}
                placeholder="https://manufacturer.com/product"
              />
            </Field>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500">Logical ports</span>
              <button className="flex items-center gap-1 text-brand-ink hover:underline" onClick={() => patch({ ports: [...draft.ports, newPort()] })}>
                <Plus className="h-3.5 w-3.5" /> Add port
              </button>
            </div>
            {draft.ports.length === 0 && (
              <div className="rounded border border-dashed border-slate-200 p-3 text-center text-slate-400">
                No ports yet. Ports are logical labels like CAN 1 or DI 1-6, not physical pins.
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              {draft.ports.map((port) => (
                <div key={port.id} className="grid grid-cols-[1fr_120px_96px_56px_104px_28px] items-center gap-2">
                  <input className="input" placeholder="Port name" value={port.name} onChange={(e) => patchPort(port.id, { name: e.target.value })} />
                  <select className="input" value={port.kind} onChange={(e) => patchPort(port.id, { kind: e.target.value as PortTemplate["kind"] })}>
                    {PORT_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {PORT_KIND_LABELS[k]}
                      </option>
                    ))}
                  </select>
                  <input className="input" placeholder="Variant" title="Protocol variant badge, e.g. Classic or 100BASE-TX" value={port.variant ?? ""} onChange={(e) => patchPort(port.id, { variant: e.target.value })} />
                  <input
                    className="input"
                    type="number"
                    min={1}
                    title="Line count"
                    value={port.count}
                    onChange={(e) => patchPort(port.id, { count: Math.max(1, Number(e.target.value) || 1) })}
                  />
                  <select className="input" value={port.direction} onChange={(e) => patchPort(port.id, { direction: e.target.value as PortTemplate["direction"] })}>
                    <option value="in">Input</option>
                    <option value="out">Output</option>
                    <option value="bidirectional">Bidirectional</option>
                  </select>
                  <button className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600" onClick={() => patch({ ports: draft.ports.filter((p) => p.id !== port.id) })}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button onClick={() => onClose()} className="rounded border border-slate-200 px-3 py-1.5 hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={save} disabled={!canSave} className="rounded bg-brand px-3 py-1.5 text-charcoal hover:bg-brand-hover disabled:opacity-40">
            {preset ? "Save preset" : "Create preset"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[11px] font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
