import { useRef, useState } from "react";
import { Plus, SlidersHorizontal, X } from "lucide-react";
import { useProject, useProjectStore } from "@/store/project-store";
import { instancesOf } from "@/model/derived";
import { CATEGORY_LABELS, type DeviceCategory } from "@/model/types";
import { PresetEditor } from "@/views/diagram/PresetEditor";

// Edits a product from its documentation page: the product's own fields, then each copy
// placed in the diagram (name, quantity, zone, custom properties). Every change goes
// straight to the store, like the diagram inspector.
export function DeviceDetailsEditor({ presetId, onDone }: { presetId: string; onDone: () => void }) {
  const project = useProject();
  const { updatePreset } = useProjectStore();
  const [fullEditor, setFullEditor] = useState(false);
  const preset = project.presets[presetId];
  if (!preset) return null;
  const copies = instancesOf(project, presetId);

  return (
    <div className="mb-4 flex flex-col gap-4 border-b border-slate-200 pb-4 text-[13px]">
      <section className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
        <Field label="Name">
          <NameInput value={preset.name} onCommit={(name) => updatePreset(presetId, { name })} />
        </Field>
        <Field label="Category">
          <select className="input" value={preset.category} onChange={(e) => updatePreset(presetId, { category: e.target.value as DeviceCategory })}>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Manufacturer">
          <input className="input" value={preset.manufacturer} onChange={(e) => updatePreset(presetId, { manufacturer: e.target.value })} />
        </Field>
        <Field label="Model">
          <input className="input" value={preset.model} onChange={(e) => updatePreset(presetId, { model: e.target.value })} />
        </Field>
        <Field label="Product page">
          <input className="input" value={preset.productUrl ?? ""} placeholder="https://..." onChange={(e) => updatePreset(presetId, { productUrl: e.target.value.trim() || undefined })} />
        </Field>
        <Field label="Card summary">
          <input className="input" value={preset.summary} onChange={(e) => updatePreset(presetId, { summary: e.target.value })} />
        </Field>
      </section>

      {copies.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{copies.length === 1 ? "In this diagram" : `${copies.length} copies in this diagram`}</h3>
          {copies.map((id) => (
            <CopyEditor key={id} deviceId={id} />
          ))}
        </section>
      )}

      <div className="flex items-center gap-2">
        <button onClick={onDone} className="rounded bg-brand px-3 py-1.5 font-medium text-charcoal hover:bg-brand-hover">
          Done
        </button>
        <button onClick={() => setFullEditor(true)} className="flex items-center gap-1 rounded border border-slate-200 px-3 py-1.5 text-slate-700 hover:bg-slate-50">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Ports and picture
        </button>
      </div>
      {fullEditor && <PresetEditor preset={preset} onClose={() => setFullEditor(false)} />}
    </div>
  );
}

function CopyEditor({ deviceId }: { deviceId: string }) {
  const project = useProject();
  const { updateDevice, setDeviceProp, removeDeviceProp } = useProjectStore();
  const [newKey, setNewKey] = useState("");
  const [addedKey, setAddedKey] = useState<string | null>(null);
  const device = project.devices[deviceId];
  if (!device) return null;

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="grid grid-cols-[1fr_88px_1fr] gap-2">
        <Field label="Name">
          <NameInput value={device.name} onCommit={(name) => updateDevice(deviceId, { name })} />
        </Field>
        <Field label="Quantity">
          <input className="input" type="number" min={1} value={device.qty} onChange={(e) => updateDevice(deviceId, { qty: Math.max(1, Math.floor(Number(e.target.value)) || 1) })} />
        </Field>
        <Field label="Zone">
          <select className="input" value={device.zoneId ?? ""} onChange={(e) => updateDevice(deviceId, { zoneId: e.target.value || null })}>
            <option value="">No zone</option>
            {Object.values(project.zones).map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-2 flex flex-col gap-1.5">
        {Object.entries(device.props).map(([key, value]) => (
          <div key={key} className="grid grid-cols-[124px_1fr_auto] items-center gap-2">
            <span className="truncate text-slate-500" title={key}>
              {key}
            </span>
            <input className="input" autoFocus={key === addedKey} value={value} onChange={(e) => setDeviceProp(deviceId, key, e.target.value)} />
            <button className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600" onClick={() => removeDeviceProp(deviceId, key)} title={`Remove ${key}`}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <form
          className="grid grid-cols-[1fr_auto] gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const key = newKey.trim();
            if (!key || device.props[key] !== undefined) return;
            setDeviceProp(deviceId, key, "");
            setAddedKey(key);
            setNewKey("");
          }}
        >
          <input className="input" placeholder="Add property (ip, canAddress, firmware...)" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
          <button type="submit" className="rounded border border-slate-200 p-1 text-slate-600 hover:bg-slate-50" title="Add property">
            <Plus className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

// Names commit once, on blur or Enter, so a rename rewrites wiki links from the name
// before editing rather than from each half-typed step. An emptied field keeps the stored
// name; Escape abandons the edit.
export function NameInput({ value, onCommit }: { value: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const commit = () => {
    const trimmed = (draft ?? value).trim();
    if (!cancelled.current && trimmed && trimmed !== value) onCommit(trimmed);
    cancelled.current = false;
    setDraft(null);
  };
  return (
    <input
      className="input"
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}
