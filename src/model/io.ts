import type { IoDirection, IoKind, IoModule, IoSetting, IoSignal, Project } from "./types";

export const IO_KIND_LABELS: Record<IoKind, string> = {
  ai: "Analog input",
  ao: "Analog output",
  di: "Digital input",
  do: "Digital output",
  pwm: "PWM output",
  encoder: "Encoder",
  other: "Module binding",
};

export const IO_KIND_BADGES: Record<IoKind, string> = {
  ai: "AI",
  ao: "AO",
  di: "DI",
  do: "DO",
  pwm: "PWM",
  encoder: "Encoder",
  other: "Other",
};

// Filters on the Signals page. "Analog" and "Digital" cover both directions.
export type IoFilter = "all" | "analog" | "digital" | "pwm" | "encoder";
export const IO_FILTERS: { id: IoFilter; label: string; kinds: IoKind[] }[] = [
  { id: "all", label: "All", kinds: ["ai", "ao", "di", "do", "pwm", "encoder", "other"] },
  { id: "analog", label: "Analog", kinds: ["ai", "ao"] },
  { id: "digital", label: "Digital", kinds: ["di", "do"] },
  { id: "pwm", label: "PWM", kinds: ["pwm"] },
  { id: "encoder", label: "Encoder", kinds: ["encoder"] },
];

const CHANNEL_KINDS: [RegExp, IoKind, IoDirection][] = [
  [/^AnalogInput\d+$/, "ai", "input"],
  [/^AnalogOutput\d+$/, "ao", "output"],
  [/^DigitalInput\d+$/, "di", "input"],
  [/^DigitalOutput\d+$/, "do", "output"],
  [/^PWMOutput\d+$/, "pwm", "output"],
  [/^Encoder\d+$/, "encoder", "input"],
];

// What a channel name says about the channel. Unrecognized names are module bindings.
export function channelKind(channel: string): { kind: IoKind; direction?: IoDirection } {
  const match = CHANNEL_KINDS.find(([pattern]) => pattern.test(channel));
  return match ? { kind: match[1], direction: match[2] } : { kind: "other" };
}

// The number a channel name ends with, which is how settings find their output.
export function channelNumber(channel: string): number | undefined {
  const match = /(\d+)$/.exec(channel);
  return match ? Number(match[1]) : undefined;
}

// Channels that configure the output with the same number instead of being wired.
const SETTING_ROLES: [RegExp, string][] = [
  [/^PWMPeriod\d+$/, "Period"],
  [/^Current\d+$/, "Feedback"],
  [/^DitherDisable\d+$/, "Dither"],
];

export function settingRole(channel: string): string | undefined {
  return SETTING_ROLES.find(([pattern]) => pattern.test(channel))?.[1];
}

export function isPhysical(signal: IoSignal) {
  return signal.kind !== "other";
}

export function modulesOf(project: Project, deviceId: string): IoModule[] {
  return Object.values(project.ioModules).filter((m) => m.deviceId === deviceId);
}

export function signalsOf(project: Project, moduleId: string): IoSignal[] {
  return Object.values(project.ioSignals)
    .filter((s) => s.moduleId === moduleId)
    .sort((a, b) => a.channel.localeCompare(b.channel, undefined, { numeric: true }));
}

// Devices that own at least one module, in the project's device order.
export function ioControllers(project: Project): string[] {
  const owners = new Set(Object.values(project.ioModules).map((m) => m.deviceId));
  return Object.keys(project.devices).filter((id) => owners.has(id));
}

export function signalLocation(project: Project, signal: IoSignal) {
  const module = project.ioModules[signal.moduleId];
  return module ? `${module.name}.${signal.channel}` : signal.channel;
}

export type IoIssue = "field-device" | "pin" | "range";

export const IO_ISSUE_LABELS: Record<IoIssue, string> = {
  "field-device": "Field device not assigned",
  pin: "Connector pin not documented",
  range: "Electrical range not documented",
};

// Physical context still to document. Missing details do not make a binding wrong.
export function signalIssues(signal: IoSignal): IoIssue[] {
  if (!isPhysical(signal)) return [];
  const issues: IoIssue[] = [];
  if (!signal.fieldDeviceId) issues.push("field-device");
  if (!signal.pin?.trim()) issues.push("pin");
  if ((signal.kind === "ai" || signal.kind === "ao") && !signal.range?.trim()) issues.push("range");
  return issues;
}

// The readable part of a PLC variable: no namespace, task prefix or type suffix, so
// "::gIo.Outputs.ActuatorSpeed.Output_INT32767" reads "ActuatorSpeed".
export function signalName(variable: string, channel: string): string {
  const local = variable.replace(/^::/, "");
  const withoutTask = local.slice(local.lastIndexOf(":") + 1);
  const parts = withoutTask.split(".");
  if (parts.length > 2 && /^(Inputs|Outputs)$/.test(parts[1])) parts.splice(0, 2);
  if (parts.length > 1 && /^(Output|Input|Current|Period|Frequency|Value)(_\w+)?$/.test(parts[parts.length - 1])) parts.pop();
  return parts.join(".") || channel;
}

export interface IoMapBinding {
  task?: string;
  variable: string;
  direction: IoDirection;
  module: string;
  channel: string;
}

export interface IoMapFile {
  bindings: IoMapBinding[];
  // Mappings onto a module's interface, such as `"CPU".IF2.symbol`; they are network data.
  interfaceBindings: number;
  skipped: string[];
}

const BINDING = /^(?:([A-Za-z]+#\d+)\.)?(\S+)\s+AT\s+%([IQ])[A-Z]\."([^"]+)"\.([^\s;]+)\s*;$/;

// Reads the VAR_CONFIG blocks of a B&R Automation Studio I/O mapping (IoMap.iom).
export function parseIoMap(text: string): IoMapFile {
  const result: IoMapFile = { bindings: [], interfaceBindings: 0, skipped: [] };
  const lines = text.replace(/\(\*[\s\S]*?\*\)/g, "").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^(VAR_CONFIG|END_VAR)$/.test(line)) continue;
    const match = BINDING.exec(line);
    if (!match) {
      result.skipped.push(line);
      continue;
    }
    const [, task, variable, io, module, channel] = match;
    if (channel.includes(".")) {
      result.interfaceBindings++;
      continue;
    }
    result.bindings.push({ task, variable: variable.replace(/^::/, ""), direction: io === "I" ? "input" : "output", module, channel });
  }
  return result;
}

export interface ImportedModule {
  name: string;
  signals: Omit<IoSignal, "id" | "moduleId">[];
}

// Groups bindings into modules and signals. A period, feedback or dither channel joins the
// output with the same number on its module; with no such output it stays a binding.
export function ioMapModules(file: IoMapFile): ImportedModule[] {
  const modules = new Map<string, ImportedModule>();
  const settings: { module: string; number: number; setting: IoSetting }[] = [];
  for (const binding of file.bindings) {
    if (!modules.has(binding.module)) modules.set(binding.module, { name: binding.module, signals: [] });
    const role = settingRole(binding.channel);
    const number = channelNumber(binding.channel);
    if (role && number !== undefined) {
      settings.push({ module: binding.module, number, setting: { role, channel: binding.channel, direction: binding.direction, variable: binding.variable, task: binding.task } });
      continue;
    }
    const { kind, direction } = channelKind(binding.channel);
    modules.get(binding.module)!.signals.push({
      name: signalName(binding.variable, binding.channel),
      channel: binding.channel,
      kind,
      direction: direction ?? binding.direction,
      variable: binding.variable,
      task: binding.task,
      settings: [],
    });
  }
  for (const { module, number, setting } of settings) {
    const signals = modules.get(module)!.signals;
    const output = signals.find((s) => s.direction === "output" && s.kind !== "other" && channelNumber(s.channel) === number);
    if (output) output.settings.push(setting);
    else signals.push({ name: signalName(setting.variable ?? "", setting.channel), channel: setting.channel, kind: "other", direction: setting.direction, variable: setting.variable, task: setting.task, settings: [] });
  }
  return Array.from(modules.values());
}
