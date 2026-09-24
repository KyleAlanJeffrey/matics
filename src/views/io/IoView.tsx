import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AlertTriangle, ArrowRight, Info, Network, Plus, Search, Trash2 } from "lucide-react";
import { useProject, useProjectStore } from "@/store/project-store";
import { useSelection } from "@/lib/selection";
import { IO_FILTERS, IO_ISSUE_LABELS, channelNumber, ioControllers, isPhysical, modulesOf, signalIssues, signalLocation, signalsOf, type IoFilter, type IoIssue } from "@/model/io";
import type { IoSignal, Project } from "@/model/types";
import { CountBadge } from "@/views/frames/FramesView";
import { ControllerIcon, KindBadge, KindIcon } from "./io-ui";
import { SignalInspector } from "./SignalInspector";
import { MapSignalForm } from "./MapSignalForm";
import { IoImportButton } from "./IoImportButton";

const TABS = [
  { id: "signals", label: "Signals" },
  { id: "modules", label: "Modules" },
  { id: "review", label: "Mapping review" },
] as const;
type Tab = (typeof TABS)[number]["id"];

// What the Signals and Modules pages show: one module, or every module of a controller.
type Scope = { deviceId: string; moduleId?: string };

function resolveScope(project: Project, moduleParam: string | null, controllerParam: string | null, selected?: IoSignal): Scope | null {
  const module = moduleParam ? project.ioModules[moduleParam] : undefined;
  if (module) return { deviceId: module.deviceId, moduleId: module.id };
  if (controllerParam && project.devices[controllerParam] && modulesOf(project, controllerParam).length > 0) return { deviceId: controllerParam };
  const fallback = (selected && project.ioModules[selected.moduleId]) ?? Object.values(project.ioModules)[0];
  return fallback ? { deviceId: fallback.deviceId, moduleId: fallback.id } : null;
}

// Physical I/O: which field signal is bound to which hardware channel. Network data
// lives in Communications.
export function IoView() {
  const project = useProject();
  const [params, setParams] = useSearchParams();
  const { selectedId, select } = useSelection();
  const [mapping, setMapping] = useState(false);
  const tabParam = params.get("tab");
  const tab: Tab = TABS.some((t) => t.id === tabParam) ? (tabParam as Tab) : "signals";
  const selected = selectedId ? project.ioSignals[selectedId] : undefined;
  const scope = resolveScope(project, params.get("module"), params.get("controller"), selected);

  const setParam = (changes: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  const setScope = (next: Scope) => setParam({ module: next.moduleId ?? null, controller: next.moduleId ? null : next.deviceId });
  const openSignal = (id: string) => {
    setMapping(false);
    select(id);
  };

  const hasModules = Object.keys(project.ioModules).length > 0;

  return (
    <div className="flex h-full flex-col bg-white text-[13px]">
      <div className="border-b border-slate-200 px-6 pt-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[24px] font-bold leading-tight text-slate-900">I/O</h1>
            <div className="mt-0.5 text-slate-500">Hardware channels and field-signal bindings</div>
          </div>
          <IoImportButton defaultDeviceId={scope?.deviceId} onImported={(moduleId) => setScope({ deviceId: project.ioModules[moduleId]?.deviceId ?? "", moduleId })} />
          <button
            onClick={() => {
              select(null);
              setMapping(true);
            }}
            className="flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-2 font-semibold text-charcoal hover:bg-brand-hover"
          >
            <Plus className="h-4 w-4" /> Map signal
          </button>
        </div>
        <div className="mt-3 flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setParam({ tab: t.id })}
              className={`-mb-px border-b-[3px] px-3 pb-2 pt-1 text-[14px] ${tab === t.id ? "border-brand font-semibold text-slate-900" : "border-transparent text-slate-600 hover:text-slate-900"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {!hasModules ? (
          <EmptyIo onMap={() => setMapping(true)} />
        ) : tab === "review" ? (
          <ReviewPanel project={project} selectedId={selectedId} onSelect={openSignal} />
        ) : (
          <>
            <HardwareTree project={project} scope={scope} onScope={setScope} />
            {tab === "signals" ? (
              <SignalsPanel project={project} scope={scope!} selectedId={selectedId} onSelect={openSignal} />
            ) : (
              <ModulePanel project={project} scope={scope!} selectedId={selectedId} onSelect={openSignal} onScope={setScope} />
            )}
          </>
        )}
        {mapping ? (
          <MapSignalForm
            defaultModuleId={scope?.moduleId}
            defaultDeviceId={scope?.deviceId}
            onCancel={() => setMapping(false)}
            onSaved={(id) => {
              const signal = useProjectStore.getState().project.ioSignals[id];
              if (signal) setScope({ deviceId: useProjectStore.getState().project.ioModules[signal.moduleId]?.deviceId ?? "", moduleId: signal.moduleId });
              openSignal(id);
            }}
          />
        ) : (
          // Keyed so an edit in progress never carries over to another signal.
          selected && <SignalInspector key={selected.id} signal={selected} onClose={() => select(null)} />
        )}
      </div>
    </div>
  );
}

function EmptyIo({ onMap }: { onMap: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-slate-50/60 p-6">
      <div className="max-w-md rounded-lg border border-dashed border-slate-300 bg-white px-6 py-8 text-center text-slate-600">
        <div className="text-[15px] font-semibold text-slate-900">No I/O mapped yet</div>
        <p className="mt-1">Import a controller's I/O mapping (a B&R IoMap.iom file), or map a signal to a channel by hand.</p>
        <button onClick={onMap} className="mt-3 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-brand-ink hover:bg-brand-wash">
          <Plus className="h-4 w-4" /> Map signal
        </button>
      </div>
    </div>
  );
}

function HardwareTree({ project, scope, onScope }: { project: Project; scope: Scope | null; onScope: (scope: Scope) => void }) {
  return (
    <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white">
      <div className="px-4 pt-4 text-[15px] font-semibold">Hardware</div>
      <div className="flex-1">
        {ioControllers(project).map((deviceId) => {
          const device = project.devices[deviceId];
          const preset = project.presets[device.presetId];
          const whole = scope?.deviceId === deviceId && !scope.moduleId;
          return (
            <div key={deviceId} className="flex flex-col gap-0.5 px-3 pb-2 pt-2">
              <button onClick={() => onScope({ deviceId })} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-left ${whole ? "bg-brand-wash" : "hover:bg-slate-50"}`} title="Every module on this controller">
                <ControllerIcon />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-slate-800">{device.name}</span>
                  {preset?.model && <span className="block truncate text-[12px] text-slate-500">{preset.model}</span>}
                </span>
              </button>
              {modulesOf(project, deviceId).map((module) => (
                <button
                  key={module.id}
                  onClick={() => onScope({ deviceId, moduleId: module.id })}
                  className={`ml-4 flex items-center gap-2 rounded-lg border-l-[3px] px-3 py-1.5 text-left ${scope?.moduleId === module.id ? "border-brand bg-brand-wash" : "border-transparent hover:bg-slate-50"}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-800">{module.name}</span>
                    {module.description && <span className="block truncate text-[12px] text-slate-500">{module.description}</span>}
                  </span>
                  <CountBadge active={scope?.moduleId === module.id}>{signalsOf(project, module.id).length}</CountBadge>
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <Link to="/communications" className="flex items-center gap-2 border-t border-slate-200 px-4 py-3 text-slate-600 hover:bg-slate-50">
        <Network className="h-4 w-4 text-slate-500" />
        <span className="flex-1">
          <span className="block font-medium text-slate-800">Network interfaces</span>
          <span className="flex items-center gap-1 text-[12px] text-brand-ink">
            Go to Communications <ArrowRight className="h-3 w-3" />
          </span>
        </span>
      </Link>
    </aside>
  );
}

function scopeSignals(project: Project, scope: Scope) {
  return scope.moduleId ? signalsOf(project, scope.moduleId) : modulesOf(project, scope.deviceId).flatMap((m) => signalsOf(project, m.id));
}

function scopeTitle(project: Project, scope: Scope) {
  const module = scope.moduleId ? project.ioModules[scope.moduleId] : undefined;
  if (!module) return { title: project.devices[scope.deviceId]?.name ?? "Controller", subtitle: "Every module" };
  return { title: module.name, subtitle: module.description };
}

// Task and field device drop out when the inspector leaves the table too narrow for them.
const SIGNAL_COLUMNS = "grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_48px] @xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_80px_90px_minmax(0,1fr)]";
const REVIEW_COLUMNS = "grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_112px] @xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_120px]";
const WIDE_ONLY = "hidden @xl:block";

function SignalsPanel({ project, scope, selectedId, onSelect }: { project: Project; scope: Scope; selectedId: string | null; onSelect: (id: string) => void }) {
  const [filter, setFilter] = useState<IoFilter>("all");
  const [query, setQuery] = useState("");
  const kinds = IO_FILTERS.find((f) => f.id === filter)!.kinds;
  const needle = query.trim().toLowerCase();
  const all = scopeSignals(project, scope);
  const visible = all.filter((s) => kinds.includes(s.kind) && (!needle || [s.name, s.channel, s.variable, s.task].some((t) => t?.toLowerCase().includes(needle))));
  const { title, subtitle } = scopeTitle(project, scope);
  const groups = [
    { label: "Inputs", rows: visible.filter((s) => isPhysical(s) && s.direction === "input") },
    { label: "Outputs", rows: visible.filter((s) => isPhysical(s) && s.direction === "output") },
    { label: "Module bindings", rows: visible.filter((s) => !isPhysical(s)) },
  ];
  const fieldSide = scope.moduleId ? undefined : scope.deviceId;

  return (
    <div className="min-w-0 flex-1 overflow-y-auto bg-slate-50/60 p-6">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-[20px] font-bold text-slate-900">
          {title}
          {subtitle && <span className="font-normal text-slate-500"> / {subtitle}</span>}
        </h2>
        <Link to={`/schematic?selected=${fieldSide ?? project.ioModules[scope.moduleId!]?.deviceId}`} className="flex items-center gap-1 text-brand-ink hover:underline">
          Show on schematic <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {IO_FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)} className={`rounded-md px-3 py-1 ${filter === f.id ? "bg-white font-semibold text-slate-900 shadow-[inset_0_-2px_0] shadow-brand" : "text-slate-600 hover:bg-white"}`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input className="input !pl-8" aria-label="Search signals" placeholder="Search signal, channel or variable..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <div className="@container overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className={`grid ${SIGNAL_COLUMNS} gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 font-semibold text-slate-600`}>
          <span>Signal</span>
          <span>Hardware channel</span>
          <span>Type</span>
          <span className={WIDE_ONLY}>Task</span>
          <span className={WIDE_ONLY}>Field device</span>
        </div>
        {visible.length === 0 && <div className="px-4 py-8 text-center text-slate-400">{all.length === 0 ? "No signals on this module yet." : "Nothing matches."}</div>}
        {groups
          .filter((g) => g.rows.length > 0)
          .map((group) => (
            <div key={group.label}>
              <div className="flex items-baseline gap-2 border-b border-slate-100 bg-slate-50/60 px-4 pb-1 pt-2.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-600">{group.label}</span>
                <span className="text-[12px] text-slate-500">
                  {group.rows.length} signal{group.rows.length === 1 ? "" : "s"}
                </span>
              </div>
              {group.rows.map((signal) => (
                <SignalRow key={signal.id} project={project} signal={signal} showModule={!scope.moduleId} selected={signal.id === selectedId} onSelect={() => onSelect(signal.id)} />
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}

function SignalRow({ project, signal, showModule, selected, onSelect }: { project: Project; signal: IoSignal; showModule: boolean; selected: boolean; onSelect: () => void }) {
  const field = signal.fieldDeviceId ? project.devices[signal.fieldDeviceId] : undefined;
  return (
    <button
      onClick={onSelect}
      className={`grid w-full ${SIGNAL_COLUMNS} items-center gap-3 border-b border-l-[3px] border-b-slate-100 px-4 py-2 text-left last:border-b-0 ${selected ? "border-l-brand bg-brand-wash" : "border-l-transparent hover:bg-slate-50"}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <KindIcon kind={signal.kind} />
        <span className="truncate font-medium text-slate-900">{signal.name}</span>
        {signal.settings.length > 0 && <span className="shrink-0 text-[11px] text-slate-500">+{signal.settings.length}</span>}
      </span>
      <span className="truncate font-mono text-[12px] text-slate-700">{showModule ? signalLocation(project, signal) : signal.channel}</span>
      <span>
        <KindBadge kind={signal.kind} />
      </span>
      <span className={`${WIDE_ONLY} truncate text-slate-600`}>{signal.task ?? ""}</span>
      <span className={`${WIDE_ONLY} truncate ${field ? "text-slate-700" : "text-slate-400"}`}>{field ? field.name : isPhysical(signal) ? "Not assigned" : ""}</span>
    </button>
  );
}

function ModulePanel({
  project,
  scope,
  selectedId,
  onSelect,
  onScope,
}: {
  project: Project;
  scope: Scope;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onScope: (scope: Scope) => void;
}) {
  const { updateIoModule, removeIoModule } = useProjectStore();
  const device = project.devices[scope.deviceId];
  const modules = scope.moduleId ? [project.ioModules[scope.moduleId]] : modulesOf(project, scope.deviceId);

  return (
    <div className="min-w-0 flex-1 overflow-y-auto bg-slate-50/60 p-6">
      <div className="mb-1 text-[13px] text-slate-500">
        {device?.name ?? "Controller"}
        {scope.moduleId && ` / ${project.ioModules[scope.moduleId].name}`}
      </div>
      {modules.map((module) => {
        const signals = signalsOf(project, module.id);
        const channels = signals.filter(isPhysical);
        const bindings = signals.filter((s) => !isPhysical(s));
        return (
          <section key={module.id} className="mb-6">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                {scope.moduleId ? (
                  <input
                    className="w-full bg-transparent text-[22px] font-bold text-slate-900 outline-none focus:rounded focus:ring-1 focus:ring-brand-line"
                    aria-label="Module name"
                    value={module.name}
                    onChange={(e) => updateIoModule(module.id, { name: e.target.value })}
                  />
                ) : (
                  <button onClick={() => onScope({ deviceId: scope.deviceId, moduleId: module.id })} className="text-[20px] font-bold text-slate-900 hover:underline">
                    {module.name}
                  </button>
                )}
                <input
                  className="w-full bg-transparent text-slate-500 outline-none placeholder:text-slate-400 focus:rounded focus:ring-1 focus:ring-brand-line"
                  aria-label="Module description"
                  placeholder="Add a description, e.g. Local I/O"
                  value={module.description ?? ""}
                  onChange={(e) => updateIoModule(module.id, { description: e.target.value || undefined })}
                />
              </div>
              {scope.moduleId && (
                <button
                  onClick={() => {
                    if (!window.confirm(`Remove ${module.name} and its ${signals.length} signal${signals.length === 1 ? "" : "s"}?`)) return;
                    removeIoModule(module.id);
                    onScope({ deviceId: scope.deviceId });
                  }}
                  className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-slate-500 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove module
                </button>
              )}
            </div>

            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
              <div className="mb-2 font-semibold text-slate-800">
                {channels.length} mapped channel{channels.length === 1 ? "" : "s"}
              </div>
              {channels.length === 0 ? (
                <div className="py-4 text-center text-slate-400">No channels mapped on this module.</div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {channels.map((signal) => (
                    <ChannelTile key={signal.id} project={project} signal={signal} selected={signal.id === selectedId} onSelect={() => onSelect(signal.id)} />
                  ))}
                </div>
              )}
            </div>

            {bindings.length > 0 && (
              <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-3 py-2 font-semibold text-slate-800">Module bindings</div>
                {bindings.map((signal) => (
                  <button
                    key={signal.id}
                    onClick={() => onSelect(signal.id)}
                    className={`grid w-full grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_70px_80px] gap-3 border-b border-slate-100 px-3 py-1.5 text-left last:border-b-0 ${signal.id === selectedId ? "bg-brand-wash" : "hover:bg-slate-50"}`}
                  >
                    <span className="truncate font-medium text-slate-800">{signal.channel}</span>
                    <span className="truncate font-mono text-[12px] text-slate-600">{signal.variable ?? signal.name}</span>
                    <span className="text-slate-600">{signal.direction === "input" ? "Input" : "Output"}</span>
                    <span className="truncate text-slate-600">{signal.task ?? ""}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ChannelTile({ project, signal, selected, onSelect }: { project: Project; signal: IoSignal; selected: boolean; onSelect: () => void }) {
  const number = channelNumber(signal.channel);
  const field = signal.fieldDeviceId ? project.devices[signal.fieldDeviceId] : undefined;
  return (
    <button onClick={onSelect} className={`rounded-md border px-3 py-2 text-left ${selected ? "border-brand bg-brand-wash" : "border-slate-200 hover:bg-slate-50"}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${selected ? "bg-brand" : field ? "bg-slate-500" : "bg-slate-300"}`} />
        <span className="font-semibold text-slate-900">{number !== undefined ? `Ch ${number}` : signal.channel}</span>
        <KindBadge kind={signal.kind} />
        <span className="ml-auto truncate text-[11px] text-slate-500">{field?.name ?? "No field device"}</span>
      </div>
      <div className="mt-1 truncate font-medium text-slate-800">{signal.channel}</div>
      <div className="truncate font-mono text-[12px] text-slate-500">{signal.name}</div>
    </button>
  );
}

type ReviewFilter = "all" | "assignment" | "details" | "resolved";

function ReviewPanel({ project, selectedId, onSelect }: { project: Project; selectedId: string | null; onSelect: (id: string) => void }) {
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const physical = Object.values(project.ioSignals)
    .filter(isPhysical)
    .sort((a, b) => signalLocation(project, a).localeCompare(signalLocation(project, b), undefined, { numeric: true }));
  const withIssues = physical.map((signal) => ({ signal, issues: signalIssues(signal) }));
  const lists: Record<ReviewFilter, typeof withIssues> = {
    all: withIssues.filter((row) => row.issues.length > 0),
    assignment: withIssues.filter((row) => row.issues.includes("field-device")),
    details: withIssues.filter((row) => row.issues.some((issue) => issue !== "field-device")),
    resolved: withIssues.filter((row) => row.issues.length === 0),
  };
  const filters: { id: ReviewFilter; label: string }[] = [
    { id: "all", label: "Open" },
    { id: "assignment", label: "Needs assignment" },
    { id: "details", label: "Missing details" },
    { id: "resolved", label: "Resolved" },
  ];
  const rows = lists[filter];

  return (
    <div className="min-w-0 flex-1 overflow-y-auto bg-slate-50/60 p-6">
      <h2 className="text-[20px] font-bold text-slate-900">Review mappings</h2>
      <div className="text-slate-500">Complete the physical context of each channel assignment.</div>
      <div className="mt-3 flex flex-wrap gap-1">
        {filters.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={`flex items-center gap-2 rounded-md px-3 py-1.5 ${filter === f.id ? "bg-white font-semibold text-slate-900 shadow-[inset_0_-2px_0] shadow-brand" : "text-slate-600 hover:bg-white"}`}>
            {f.label} <CountBadge active={filter === f.id}>{lists[f.id].length}</CountBadge>
          </button>
        ))}
      </div>

      <div className="@container mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className={`grid ${REVIEW_COLUMNS} gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 font-semibold text-slate-600`}>
          <span>{filter === "resolved" ? "Field device" : "Issue"}</span>
          <span>Signal</span>
          <span className={WIDE_ONLY}>Channel</span>
          <span />
        </div>
        {rows.length === 0 && <div className="px-4 py-8 text-center text-slate-400">{filter === "resolved" ? "No signal is fully documented yet." : "Nothing to review here."}</div>}
        {rows.map(({ signal, issues }) => (
          <ReviewRow key={signal.id} project={project} signal={signal} issues={issues} selected={signal.id === selectedId} onSelect={() => onSelect(signal.id)} />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-md border border-sky-100 bg-sky-50 px-3 py-2 text-slate-700">
        <Info className="h-4 w-4 shrink-0 text-sky-700" /> Missing documentation does not mean the channel mapping is wrong.
      </div>
    </div>
  );
}

function ReviewRow({ project, signal, issues, selected, onSelect }: { project: Project; signal: IoSignal; issues: IoIssue[]; selected: boolean; onSelect: () => void }) {
  const first = issues[0];
  const field = signal.fieldDeviceId ? project.devices[signal.fieldDeviceId] : undefined;
  return (
    <div className={`grid ${REVIEW_COLUMNS} items-center gap-3 border-b border-l-[3px] border-b-slate-100 px-4 py-2 last:border-b-0 ${selected ? "border-l-brand bg-brand-wash" : "border-l-transparent"}`}>
      <span className="flex min-w-0 items-center gap-2">
        {first ? (
          <>
            <AlertTriangle className={`h-4 w-4 shrink-0 ${first === "field-device" ? "text-amber-600" : "text-slate-400"}`} />
            <span className="truncate text-slate-800">{IO_ISSUE_LABELS[first]}</span>
            {issues.length > 1 && <span className="shrink-0 text-[12px] text-slate-500">+{issues.length - 1} more</span>}
          </>
        ) : (
          <span className="truncate text-slate-700">{field?.name}</span>
        )}
      </span>
      <span className="truncate font-medium text-slate-900">{signal.name}</span>
      <span className={`${WIDE_ONLY} truncate font-mono text-[12px] text-slate-600`}>{signalLocation(project, signal)}</span>
      <button onClick={onSelect} className={`rounded-md border px-2 py-1 font-medium ${first === "field-device" ? "border-brand text-brand-ink hover:bg-brand-wash" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
        {first === "field-device" ? "Assign device" : first ? "Add details" : "Open"}
      </button>
    </div>
  );
}
