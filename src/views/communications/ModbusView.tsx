import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ArrowLeft, ArrowRight, Copy, Info, Plus, Search, Trash2, X } from "lucide-react";
import { useProject, useProjectStore } from "@/store/project-store";
import { useSelection } from "@/lib/selection";
import { DocumentLinks } from "@/components/DocumentLinks";
import { NoteEditor } from "@/views/notes/NoteEditor";
import { CountBadge, Field } from "@/views/frames/FramesView";
import { ControllerIcon, NotSpecified } from "@/views/io/io-ui";
import { DirectionSelect } from "@/views/io/SignalInspector";
import { ioControllers } from "@/model/io";
import { interfacesOf, mappingsOf, netControllers } from "@/model/net";
import type { IoDirection, NetInterface, NetMapping, Project } from "@/model/types";

// The interface in view: the selected mapping's, else the one in the URL, else the first.
export function resolveInterface(project: Project, interfaceParam: string | null, selectedId: string | null): NetInterface | undefined {
  const selected = selectedId ? project.netMappings[selectedId] : undefined;
  if (selected && project.netInterfaces[selected.interfaceId]) return project.netInterfaces[selected.interfaceId];
  if (interfaceParam && project.netInterfaces[interfaceParam]) return project.netInterfaces[interfaceParam];
  return netControllers(project).flatMap((id) => interfacesOf(project, id))[0];
}

// Symbolic data a controller exchanges over a fieldbus interface. Physical channels are on
// the I/O page; register addresses and peers stay unspecified until someone records them.
export function ModbusView() {
  const project = useProject();
  const [params, setParams] = useSearchParams();
  const { selectedId, select } = useSelection();
  const [addingInterface, setAddingInterface] = useState(false);
  const current = resolveInterface(project, params.get("interface"), selectedId);
  const selected = selectedId ? project.netMappings[selectedId] : undefined;

  const pick = (interfaceId: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("interface", interfaceId);
        next.delete("selected");
        return next;
      },
      { replace: true },
    );

  return (
    <div className="flex h-full">
      <InterfaceTree
        project={project}
        current={current}
        adding={addingInterface}
        onAdding={setAddingInterface}
        onPick={(id) => {
          setAddingInterface(false);
          pick(id);
        }}
      />
      {current ? (
        <InterfacePanel key={current.id} project={project} netInterface={current} selectedId={selectedId} onSelect={select} />
      ) : (
        <div className="flex flex-1 items-center justify-center bg-slate-50/60 p-6">
          <div className="max-w-md rounded-lg border border-dashed border-slate-300 bg-white px-6 py-8 text-center text-slate-600">
            <div className="text-[15px] font-semibold text-slate-900">No network interfaces yet</div>
            <p className="mt-1">Import a controller's IoMap.iom (its interface mappings land here), or add an interface by hand.</p>
            <button onClick={() => setAddingInterface(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-brand-ink hover:bg-brand-wash">
              <Plus className="h-4 w-4" /> Add interface
            </button>
          </div>
        </div>
      )}
      {/* Closing keeps the mapping's interface in view: it may not be the one in the URL. */}
      {selected && <MappingInspector key={selected.id} mapping={selected} onClose={() => pick(selected.interfaceId)} />}
    </div>
  );
}

function InterfaceTree({
  project,
  current,
  adding,
  onAdding,
  onPick,
}: {
  project: Project;
  current?: NetInterface;
  adding: boolean;
  onAdding: (adding: boolean) => void;
  onPick: (interfaceId: string) => void;
}) {
  const controllers = netControllers(project);
  const currentId = current?.id;
  return (
    <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white">
      <div className="flex items-center px-4 pt-4">
        <span className="flex-1 text-[15px] font-semibold">Interfaces</span>
        <button onClick={() => onAdding(!adding)} className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Add an interface">
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {adding && <AddInterfaceForm defaultDeviceId={current?.deviceId} onCancel={() => onAdding(false)} onSaved={onPick} />}
      <div className="flex-1">
        {controllers.length === 0 && !adding && <div className="px-4 py-3 text-slate-400">No interfaces yet.</div>}
        {controllers.map((deviceId) => (
          <div key={deviceId} className="flex flex-col gap-0.5 px-3 pb-2 pt-2">
            <div className="flex items-center gap-2 px-3 py-1.5">
              <ControllerIcon />
              <span className="truncate font-semibold text-slate-800">{project.devices[deviceId].name}</span>
            </div>
            {interfacesOf(project, deviceId).map((netInterface) => {
              const active = netInterface.id === currentId;
              return (
                <button
                  key={netInterface.id}
                  onClick={() => onPick(netInterface.id)}
                  className={`ml-4 flex items-center gap-2 rounded-lg border-l-[3px] px-3 py-1.5 text-left ${active ? "border-brand bg-brand-wash" : "border-transparent hover:bg-slate-50"}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-800">{netInterface.name}</span>
                    <span className="block truncate text-[12px] text-slate-500">{[netInterface.module, netInterface.protocol].filter(Boolean).join(" / ")}</span>
                  </span>
                  <CountBadge active={active}>{mappingsOf(project, netInterface.id).length}</CountBadge>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <Link to="/io" className="flex items-center gap-2 border-t border-slate-200 px-4 py-3 text-slate-600 hover:bg-slate-50">
        <ControllerIcon />
        <span className="flex-1">
          <span className="block font-medium text-slate-800">Physical channels</span>
          <span className="flex items-center gap-1 text-[12px] text-brand-ink">
            Go to I/O <ArrowRight className="h-3 w-3" />
          </span>
        </span>
      </Link>
    </aside>
  );
}

// The controller in view, else one that already has interfaces or I/O.
function defaultController(project: Project, preferred?: string) {
  if (preferred && project.devices[preferred]) return preferred;
  const devices = Object.values(project.devices);
  return netControllers(project)[0] ?? ioControllers(project)[0] ?? (devices.find((d) => project.presets[d.presetId]?.category === "controller") ?? devices[0])?.id ?? "";
}

function AddInterfaceForm({ defaultDeviceId, onCancel, onSaved }: { defaultDeviceId?: string; onCancel: () => void; onSaved: (interfaceId: string) => void }) {
  const project = useProject();
  const addNetInterface = useProjectStore((s) => s.addNetInterface);
  const devices = Object.values(project.devices);
  const [deviceId, setDeviceId] = useState(() => defaultController(project, defaultDeviceId));
  const [name, setName] = useState("");
  const [protocol, setProtocol] = useState("Modbus");
  const ready = !!deviceId && !!name.trim();
  return (
    <form
      className="mx-3 mt-2 flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onSaved(addNetInterface({ deviceId, name: name.trim(), protocol: protocol.trim() }));
      }}
    >
      <Field label="Controller">
        <select className="input" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
          {devices.map((device) => (
            <option key={device.id} value={device.id}>
              {device.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Name">
          <input className="input" autoFocus placeholder="e.g. IF2" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Protocol">
          <input className="input" value={protocol} onChange={(e) => setProtocol(e.target.value)} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-slate-300 bg-white px-3 py-1 text-slate-700 hover:bg-slate-50">
          Cancel
        </button>
        <button type="submit" disabled={!ready} className="rounded-md bg-brand px-3 py-1 font-semibold text-charcoal hover:bg-brand-hover disabled:opacity-50">
          Add
        </button>
      </div>
    </form>
  );
}

// The table drops the PLC variable and task when the inspector leaves it too narrow for them.
const MAPPING_COLUMNS = "grid-cols-[minmax(0,1.2fr)_76px_minmax(0,1fr)] @2xl:grid-cols-[minmax(0,1.2fr)_76px_minmax(0,1.3fr)_minmax(0,1fr)_80px]";
const WIDE_ONLY = "hidden @2xl:block";

function InterfacePanel({ project, netInterface, selectedId, onSelect }: { project: Project; netInterface: NetInterface; selectedId: string | null; onSelect: (id: string) => void }) {
  const { removeNetInterface } = useProjectStore();
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<IoDirection | "all">("all");
  const all = mappingsOf(project, netInterface.id);
  const needle = query.trim().toLowerCase();
  const rows = all.filter((m) => (direction === "all" || m.direction === direction) && (!needle || [m.name, m.symbol, m.variable].some((text) => text?.toLowerCase().includes(needle))));

  return (
    <div className="min-w-0 flex-1 overflow-y-auto bg-slate-50/60 p-6">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-[20px] font-bold text-slate-900">
          {netInterface.name || "Interface"}
          <span className="font-normal text-slate-500"> / {netInterface.protocol || "Network"} mappings</span>
        </h2>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-[12px] text-slate-600">Symbolic mappings</span>
        <button
          onClick={() => {
            if (window.confirm(`Remove ${netInterface.name || "this interface"} and its ${all.length} mapping${all.length === 1 ? "" : "s"}?`)) removeNetInterface(netInterface.id);
          }}
          className="ml-auto flex items-center gap-1 text-slate-500 hover:text-red-600"
        >
          <Trash2 className="h-3.5 w-3.5" /> Remove interface
        </button>
      </div>
      <InterfaceCard project={project} netInterface={netInterface} />

      <div className="mb-3 mt-4 flex flex-wrap items-center gap-2">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input className="input !pl-8" aria-label="Search mappings" placeholder="Search mapping or PLC variable..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <label className="ml-auto flex items-center gap-2 text-slate-600">
          Direction
          <select className="input !w-auto" value={direction} onChange={(e) => setDirection(e.target.value as IoDirection | "all")}>
            <option value="all">All</option>
            <option value="input">Input</option>
            <option value="output">Output</option>
          </select>
        </label>
      </div>

      <div className="@container overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className={`grid ${MAPPING_COLUMNS} gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 font-semibold text-slate-600`}>
          <span>Mapped value</span>
          <span>Direction</span>
          <span className={WIDE_ONLY}>PLC variable</span>
          <span>Interface symbol</span>
          <span className={WIDE_ONLY}>Task</span>
        </div>
        {rows.length === 0 && (
          <div className="px-4 py-8 text-center text-slate-400">
            {all.length === 0 ? (
              "No mappings on this interface yet."
            ) : (
              <button
                onClick={() => {
                  setQuery("");
                  setDirection("all");
                }}
                className="text-brand-ink hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
        {rows.map((mapping) => (
          <button
            key={mapping.id}
            onClick={() => onSelect(mapping.id)}
            className={`grid w-full ${MAPPING_COLUMNS} items-center gap-3 border-b border-l-[3px] border-b-slate-100 px-4 py-2 text-left last:border-b-0 ${mapping.id === selectedId ? "border-l-brand bg-brand-wash" : "border-l-transparent hover:bg-slate-50"}`}
          >
            <span className="truncate font-medium text-slate-900">{mapping.name || "Untitled mapping"}</span>
            <DirectionLabel direction={mapping.direction} />
            <span className={`${WIDE_ONLY} truncate font-mono text-[12px] text-slate-700`}>{mapping.variable ?? ""}</span>
            <span className="truncate font-mono text-[12px] text-slate-700">{mapping.symbol}</span>
            <span className={`${WIDE_ONLY} truncate text-slate-600`}>{mapping.task ?? ""}</span>
          </button>
        ))}
      </div>
      <div className="mt-2 text-[12px] text-slate-500">Network mappings are separate from the controller's physical channels.</div>
    </div>
  );
}

function DirectionLabel({ direction }: { direction: IoDirection }) {
  const Arrow = direction === "output" ? ArrowRight : ArrowLeft;
  return (
    <span className="flex items-center gap-1 text-slate-700">
      <Arrow className="h-3.5 w-3.5 shrink-0 text-slate-500" />
      {direction === "output" ? "Output" : "Input"}
    </span>
  );
}

// The interface's own details, edited in place. Unknown values stay empty, never guessed.
function InterfaceCard({ project, netInterface }: { project: Project; netInterface: NetInterface }) {
  const updateNetInterface = useProjectStore((s) => s.updateNetInterface);
  const update = (patch: Partial<NetInterface>) => updateNetInterface(netInterface.id, patch);
  const controller = project.devices[netInterface.deviceId];
  const peers = Object.values(project.devices)
    .filter((d) => d.id !== netInterface.deviceId)
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 xl:grid-cols-3">
      <Field label="Controller" group>
        <span className="flex items-center gap-2 py-1.5 text-slate-800">
          <ControllerIcon /> <span className="truncate">{[controller?.name, netInterface.module].filter(Boolean).join(" / ")}</span>
        </span>
      </Field>
      <Field label="Name">
        <input className="input" value={netInterface.name} onChange={(e) => update({ name: e.target.value })} />
      </Field>
      <Field label="Protocol">
        <input className="input" placeholder="Not specified" value={netInterface.protocol} onChange={(e) => update({ protocol: e.target.value })} />
      </Field>
      <Field label="Peer device">
        <select className="input" value={netInterface.peerDeviceId ?? ""} onChange={(e) => update({ peerDeviceId: e.target.value || undefined })}>
          <option value="">Not assigned</option>
          {peers.map((device) => (
            <option key={device.id} value={device.id}>
              {device.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Transport">
        <input className="input" placeholder="Not specified" value={netInterface.transport ?? ""} onChange={(e) => update({ transport: e.target.value || undefined })} />
      </Field>
      <Field label="Unit ID">
        <input className="input" placeholder="Not specified" value={netInterface.unitId ?? ""} onChange={(e) => update({ unitId: e.target.value || undefined })} />
      </Field>
    </div>
  );
}

function MappingInspector({ mapping, onClose }: { mapping: NetMapping; onClose: () => void }) {
  const project = useProject();
  const { updateNetMapping, removeNetMapping } = useProjectStore();
  const netInterface = project.netInterfaces[mapping.interfaceId];
  const peer = netInterface?.peerDeviceId ? project.devices[netInterface.peerDeviceId] : undefined;
  const update = (patch: Partial<NetMapping>) => updateNetMapping(mapping.id, patch);

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-start gap-2 px-4 pt-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[20px] font-bold text-slate-900">{mapping.name || "Untitled mapping"}</h2>
          <div className="mt-1 text-slate-500">
            Interface {netInterface?.name}
            {netInterface?.protocol ? ` / ${netInterface.protocol}` : ""}
          </div>
        </div>
        <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-4">
        <section className="flex flex-col gap-3">
          <h3 className="text-[15px] font-semibold text-slate-900">Binding</h3>
          <Field label="Name">
            <input className="input" value={mapping.name} onChange={(e) => update({ name: e.target.value })} />
          </Field>
          <Field label="PLC variable" group>
            <div className="flex gap-1">
              <input className="input font-mono text-[12px]" aria-label="PLC variable" placeholder="Not specified" value={mapping.variable ?? ""} onChange={(e) => update({ variable: e.target.value || undefined })} />
              {mapping.variable && (
                <button onClick={() => void navigator.clipboard?.writeText(mapping.variable!)} className="rounded border border-slate-200 px-2 text-slate-500 hover:bg-slate-50" title="Copy the variable">
                  <Copy className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </Field>
          <Field label="Interface symbol">
            <input className="input font-mono text-[12px]" value={mapping.symbol} onChange={(e) => update({ symbol: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Direction">
              <DirectionSelect value={mapping.direction} onChange={(direction) => update({ direction })} />
            </Field>
            <Field label="Task class">
              <input className="input" placeholder="Not specified" value={mapping.task ?? ""} onChange={(e) => update({ task: e.target.value || undefined })} />
            </Field>
            <Field label="Register address">
              <input className="input" placeholder="Not specified" value={mapping.register ?? ""} onChange={(e) => update({ register: e.target.value || undefined })} />
            </Field>
          </div>
        </section>

        <section className="flex flex-col gap-2 border-t border-slate-200 pt-4">
          <h3 className="text-[15px] font-semibold text-slate-900">Network details</h3>
          <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1.5">
            <dt className="text-slate-500">Remote device</dt>
            <dd className="truncate">{peer ? peer.name : <span className="text-slate-400">Not assigned</span>}</dd>
            <dt className="text-slate-500">Transport</dt>
            <dd className="truncate">{netInterface?.transport ?? <NotSpecified />}</dd>
            <dt className="text-slate-500">Unit ID</dt>
            <dd className="truncate">{netInterface?.unitId ?? <NotSpecified />}</dd>
          </dl>
          <div className="text-[12px] text-slate-500">These belong to interface {netInterface?.name}; edit them above the table.</div>
          {!mapping.register && (
            <div className="flex items-start gap-2 rounded-md border border-sky-100 bg-sky-50 px-3 py-2 text-slate-700">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" /> The symbolic mapping is known; no wire-level register address is recorded.
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3 border-t border-slate-200 pt-4">
          <h3 className="text-[15px] font-semibold text-slate-900">Documentation</h3>
          <DocumentLinks entityId={mapping.id} compact />
          <div className="rounded-md border border-slate-200 px-3 py-2">
            <NoteEditor entityId={mapping.id} />
          </div>
        </section>

        <button
          onClick={() => {
            if (!window.confirm(`Remove ${mapping.name || "this mapping"}? Its notes and document links go with it.`)) return;
            removeNetMapping(mapping.id);
            onClose();
          }}
          className="flex items-center justify-center gap-1 rounded border border-red-200 px-3 py-1.5 text-red-600 hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Remove mapping
        </button>
      </div>
    </aside>
  );
}
