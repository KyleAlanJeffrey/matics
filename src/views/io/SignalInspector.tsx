import { Link } from "react-router";
import { Copy, Plus, Trash2, X } from "lucide-react";
import { useProject, useProjectStore } from "@/store/project-store";
import { DocumentLinks } from "@/components/DocumentLinks";
import { NoteEditor } from "@/views/notes/NoteEditor";
import { Field } from "@/views/frames/FramesView";
import { IO_KIND_LABELS, channelNumber, isPhysical, modulesOf } from "@/model/io";
import type { IoDirection, IoKind, IoSetting, IoSignal } from "@/model/types";
import { KindBadge } from "./io-ui";

const KINDS = Object.keys(IO_KIND_LABELS) as IoKind[];

// Every property is edited in place, like a CAN frame's.
export function SignalInspector({ signal, onClose }: { signal: IoSignal; onClose: () => void }) {
  const project = useProject();
  const { updateIoSignal, removeIoSignal } = useProjectStore();
  const module = project.ioModules[signal.moduleId];
  const controllerId = module?.deviceId;
  const update = (patch: Partial<IoSignal>) => updateIoSignal(signal.id, patch);
  const number = channelNumber(signal.channel);
  const devices = Object.values(project.devices)
    .filter((d) => d.id !== controllerId)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-start gap-2 px-4 pt-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[20px] font-bold text-slate-900">{signal.name || "Untitled signal"}</h2>
          <div className="mt-1 flex items-center gap-2 text-slate-500">
            <KindBadge kind={signal.kind} /> {IO_KIND_LABELS[signal.kind]}
            <span className="text-slate-400">
              {module?.name}
              {number !== undefined && isPhysical(signal) ? ` / Channel ${number}` : ""}
            </span>
          </div>
        </div>
        <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-4">
        <section className="flex flex-col gap-3">
          <h3 className="text-[15px] font-semibold text-slate-900">Binding</h3>
          <Field label="Signal name">
            <input className="input" value={signal.name} onChange={(e) => update({ name: e.target.value })} />
          </Field>
          <Field label="PLC variable" group>
            <div className="flex gap-1">
              <input className="input font-mono text-[12px]" aria-label="PLC variable" placeholder="gIo.Inputs.Level" value={signal.variable ?? ""} onChange={(e) => update({ variable: e.target.value || undefined })} />
              {signal.variable && (
                <button onClick={() => void navigator.clipboard?.writeText(signal.variable!)} className="rounded border border-slate-200 px-2 text-slate-500 hover:bg-slate-50" title="Copy the variable">
                  <Copy className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Module">
              <select className="input" value={signal.moduleId} onChange={(e) => update({ moduleId: e.target.value })}>
                {(controllerId ? modulesOf(project, controllerId) : []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Hardware channel">
              <input className="input font-mono text-[12px]" value={signal.channel} onChange={(e) => update({ channel: e.target.value })} />
            </Field>
            <Field label="Type">
              <select className="input" value={signal.kind} onChange={(e) => update({ kind: e.target.value as IoKind })}>
                {KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {IO_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Direction">
              <DirectionSelect value={signal.direction} onChange={(direction) => update({ direction })} />
            </Field>
            <Field label="Task class">
              <input className="input" placeholder="Cyclic#1" value={signal.task ?? ""} onChange={(e) => update({ task: e.target.value || undefined })} />
            </Field>
          </div>
        </section>

        <section className="flex flex-col gap-2 border-t border-slate-200 pt-4">
          <h3 className="text-[15px] font-semibold text-slate-900">Related channel settings</h3>
          <div className="text-[12px] text-slate-500">Bindings that configure this channel, such as a PWM period or current feedback. They are not separate wires.</div>
          <SettingsTable settings={signal.settings} onChange={(settings) => update({ settings })} />
        </section>

        {isPhysical(signal) && (
          <section className="flex flex-col gap-3 border-t border-slate-200 pt-4">
            <h3 className="text-[15px] font-semibold text-slate-900">Field side</h3>
            <Field label="Field device">
              <select className="input" value={signal.fieldDeviceId ?? ""} onChange={(e) => update({ fieldDeviceId: e.target.value || undefined })}>
                <option value="">Not assigned</option>
                {signal.fieldDeviceId && !project.devices[signal.fieldDeviceId] && <option value={signal.fieldDeviceId}>Unknown device</option>}
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Physical pin">
                <input className="input" placeholder="Not specified" value={signal.pin ?? ""} onChange={(e) => update({ pin: e.target.value || undefined })} />
              </Field>
              <Field label="Electrical range">
                <input className="input" placeholder="Not specified" value={signal.range ?? ""} onChange={(e) => update({ range: e.target.value || undefined })} />
              </Field>
            </div>
            <div className="text-[12px] text-slate-500">A channel name is not a connector pin; record the pin here when it is known.</div>
          </section>
        )}

        <section className="flex flex-col gap-3 border-t border-slate-200 pt-4">
          <h3 className="text-[15px] font-semibold text-slate-900">Documentation</h3>
          <DocumentLinks entityId={signal.id} compact />
          <div className="rounded-md border border-slate-200 px-3 py-2">
            <NoteEditor entityId={signal.id} />
          </div>
        </section>

        <div className="flex gap-2">
          <Link to={`/schematic?selected=${signal.fieldDeviceId ?? controllerId ?? ""}`} className="flex flex-1 items-center justify-center rounded border border-slate-300 px-2 py-1.5 font-medium text-slate-700 hover:bg-slate-50">
            Show on schematic
          </Link>
          <button
            onClick={() => {
              if (!window.confirm(`Remove ${signal.name || "this signal"}? Its notes and document links go with it.`)) return;
              removeIoSignal(signal.id);
              onClose();
            }}
            className="flex items-center justify-center gap-1 rounded border border-red-200 px-3 py-1.5 text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        </div>
      </div>
    </aside>
  );
}

export function DirectionSelect({ value, onChange }: { value: IoDirection; onChange: (value: IoDirection) => void }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value as IoDirection)}>
      <option value="input">Input</option>
      <option value="output">Output</option>
    </select>
  );
}

function SettingsTable({ settings, onChange }: { settings: IoSetting[]; onChange: (settings: IoSetting[]) => void }) {
  const set = (index: number, patch: Partial<IoSetting>) => onChange(settings.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const cell = "w-full min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-slate-200 focus:border-brand-line focus:outline-none";
  return (
    <div className="overflow-hidden rounded-md border border-slate-200">
      {settings.length > 0 && (
        <div className="grid grid-cols-[68px_minmax(0,1fr)_52px_64px_20px] gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500">
          <span>Role</span>
          <span>Channel</span>
          <span>Direction</span>
          <span>Task</span>
          <span />
        </div>
      )}
      {settings.map((setting, index) => (
        // Keyed by position, like the Protobuf fields table, so typing never remounts a row.
        <div key={index} className="grid grid-cols-[68px_minmax(0,1fr)_52px_64px_20px] items-center gap-1 border-b border-slate-100 px-2 py-0.5 last:border-b-0">
          <input className={cell} aria-label="Setting role" value={setting.role} onChange={(e) => set(index, { role: e.target.value })} />
          <input className={`${cell} font-mono text-[12px]`} aria-label="Setting channel" value={setting.channel} onChange={(e) => set(index, { channel: e.target.value })} title={setting.variable} />
          <select className={cell} aria-label="Setting direction" value={setting.direction} onChange={(e) => set(index, { direction: e.target.value as IoDirection })}>
            <option value="input">In</option>
            <option value="output">Out</option>
          </select>
          <input className={cell} aria-label="Setting task" value={setting.task ?? ""} onChange={(e) => set(index, { task: e.target.value || undefined })} />
          <button onClick={() => onChange(settings.filter((_, i) => i !== index))} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-600" title="Remove setting">
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button onClick={() => onChange([...settings, { role: "Setting", channel: "", direction: "output" }])} className="flex w-full items-center gap-1 px-2 py-1.5 text-left text-brand-ink hover:bg-brand-wash">
        <Plus className="h-3.5 w-3.5" /> Setting
      </button>
    </div>
  );
}
