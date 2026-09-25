import { useState } from "react";
import { Activity } from "lucide-react";
import { CreatePane, CreatePreview } from "@/components/CreatePane";
import { useProject, useProjectStore } from "@/store/project-store";
import { Field } from "@/views/frames/FramesView";
import { IO_KIND_LABELS, channelKind, modulesOf } from "@/model/io";
import type { IoDirection, IoKind, Project } from "@/model/types";
import { DirectionSelect } from "./SignalInspector";

const NEW_MODULE = "__new";
const KINDS = Object.keys(IO_KIND_LABELS) as IoKind[];

function defaultController(project: Project, preferred?: string) {
  if (preferred && project.devices[preferred]) return preferred;
  const devices = Object.values(project.devices);
  return (devices.find((d) => project.presets[d.presetId]?.category === "controller") ?? devices[0])?.id ?? "";
}

// A focused form for one binding. Type and direction follow the channel name until set.
export function MapSignalForm({ defaultDeviceId, defaultModuleId, onCancel, onSaved }: { defaultDeviceId?: string; defaultModuleId?: string; onCancel: () => void; onSaved: (signalId: string) => void }) {
  const project = useProject();
  const { addIoModule, addIoSignal } = useProjectStore();
  const [deviceId, setDeviceId] = useState(() => defaultController(project, defaultDeviceId));
  const modules = modulesOf(project, deviceId);
  const [moduleId, setModuleId] = useState(() => (defaultModuleId && project.ioModules[defaultModuleId]?.deviceId === deviceId ? defaultModuleId : (modules[0]?.id ?? NEW_MODULE)));
  const [moduleName, setModuleName] = useState("");
  const [channel, setChannel] = useState("");
  const [name, setName] = useState("");
  const [variable, setVariable] = useState("");
  const [task, setTask] = useState("");
  const [kind, setKind] = useState<IoKind | null>(null);
  const [direction, setDirection] = useState<IoDirection | null>(null);
  const [fieldDeviceId, setFieldDeviceId] = useState("");
  const [pin, setPin] = useState("");

  const guessed = channelKind(channel.trim());
  const effectiveKind = kind ?? guessed.kind;
  const effectiveDirection = direction ?? guessed.direction ?? "input";
  const moduleLabel = moduleId === NEW_MODULE ? moduleName.trim() : project.ioModules[moduleId]?.name;
  const ready = !!deviceId && !!moduleLabel && !!channel.trim() && !!name.trim();

  const save = () => {
    const targetModule = moduleId === NEW_MODULE ? addIoModule({ deviceId, name: moduleName.trim() }) : moduleId;
    const id = addIoSignal({
      moduleId: targetModule,
      name: name.trim(),
      channel: channel.trim(),
      kind: effectiveKind,
      direction: effectiveDirection,
      variable: variable.trim() || undefined,
      task: task.trim() || undefined,
      settings: [],
      fieldDeviceId: fieldDeviceId || undefined,
      pin: pin.trim() || undefined,
    });
    onSaved(id);
  };

  return (
    <CreatePane title="Map a signal" submitLabel="Map signal" ready={ready} onCancel={onCancel} onSubmit={save}>
      <Field label="Controller">
        <select
          className="input"
          value={deviceId}
          onChange={(e) => {
            setDeviceId(e.target.value);
            setModuleId(modulesOf(project, e.target.value)[0]?.id ?? NEW_MODULE);
          }}
        >
          {Object.values(project.devices).map((device) => (
            <option key={device.id} value={device.id}>
              {device.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Module">
        <select className="input" value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
          {modules.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.description ? ` (${m.description})` : ""}
            </option>
          ))}
          <option value={NEW_MODULE}>New module...</option>
        </select>
      </Field>
      {moduleId === NEW_MODULE && (
        <Field label="New module name">
          <input className="input" autoFocus placeholder="e.g. IO-1" value={moduleName} onChange={(e) => setModuleName(e.target.value)} />
        </Field>
      )}
      <Field label="Hardware channel">
        <input className="input font-mono text-[12px]" placeholder="e.g. AnalogInput01" value={channel} onChange={(e) => setChannel(e.target.value)} />
      </Field>
      <Field label="Signal name">
        <input className="input" placeholder="e.g. BatteryVoltage" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="PLC variable">
        <input className="input font-mono text-[12px]" placeholder="Optional, e.g. gIo.Inputs.BatteryVoltage" value={variable} onChange={(e) => setVariable(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <select className="input" value={effectiveKind} onChange={(e) => setKind(e.target.value as IoKind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {IO_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Direction">
          <DirectionSelect value={effectiveDirection} onChange={setDirection} />
        </Field>
        <Field label="Task class">
          <input className="input" placeholder="Optional" value={task} onChange={(e) => setTask(e.target.value)} />
        </Field>
        <Field label="Physical pin">
          <input className="input" placeholder="Not specified" value={pin} onChange={(e) => setPin(e.target.value)} />
        </Field>
      </div>
      <Field label="Field device">
        <select className="input" value={fieldDeviceId} onChange={(e) => setFieldDeviceId(e.target.value)}>
          <option value="">Not assigned</option>
          {Object.values(project.devices)
            .filter((d) => d.id !== deviceId)
            .map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
        </select>
      </Field>

      <CreatePreview icon={<Activity className="h-4 w-4 shrink-0 text-teal-600" />} label="Binding preview">
        {moduleLabel || "module"}.{channel.trim() || "channel"} {"->"} {name.trim() || "signal"}
      </CreatePreview>
    </CreatePane>
  );
}
