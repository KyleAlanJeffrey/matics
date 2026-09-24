import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight, FileCode2, Plus, Search, Trash2, Waypoints, X } from "lucide-react";
import { useProject, useProjectStore } from "@/store/project-store";
import { useSelection } from "@/lib/selection";
import { CreatePane, CreatePreview } from "@/components/CreatePane";
import { DocumentLinks } from "@/components/DocumentLinks";
import { NoteEditor } from "@/views/notes/NoteEditor";
import { CountBadge, Field } from "@/views/frames/FramesView";
import { endpointService } from "@/model/messages";
import { formatEndpoint } from "@/model/services";
import { ROUTE_STATUS_LABELS, endLabel, routeDevices, routeMessages, routeStatus, routeTouches, type RouteStatus } from "@/model/routes";
import type { MessageEndpoint, Project, Route } from "@/model/types";
import { EndpointPicker } from "./ProtobufView";

const STATUS_STYLES: Record<RouteStatus, string> = {
  defined: "bg-emerald-50 text-emerald-700",
  incomplete: "bg-amber-50 text-amber-700",
  proposed: "bg-slate-100 text-slate-600",
};

function StatusBadge({ status }: { status: RouteStatus }) {
  return <span className={`inline-flex rounded px-2 py-0.5 text-[12px] font-medium ${STATUS_STYLES[status]}`}>{ROUTE_STATUS_LABELS[status]}</span>;
}

// The table drops what a route carries and its protocol when the inspector leaves it narrow.
const ROUTE_COLUMNS = "grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_96px] @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,1fr)_96px]";
const WIDE_ONLY = "hidden @2xl:block";

// Who talks to whom, and how. What the data looks like stays on the message definitions.
export function ConnectionsView({ adding, onAdding }: { adding: boolean; onAdding: (adding: boolean) => void }) {
  const project = useProject();
  const { selectedId, select } = useSelection();
  const [deviceId, setDeviceId] = useState("");
  const [query, setQuery] = useState("");
  const [protocol, setProtocol] = useState("");
  const all = Object.values(project.routes).sort((a, b) => a.name.localeCompare(b.name));
  const protocols = [...new Set(all.map((r) => r.protocol.trim()).filter(Boolean))].sort();
  const needle = query.trim().toLowerCase();
  const rows = all.filter(
    (route) =>
      (!deviceId || routeTouches(route, deviceId)) &&
      (!protocol || route.protocol.trim() === protocol) &&
      (!needle || [route.name, route.protocol, route.path, endLabel(project, route.from), endLabel(project, route.to)].some((text) => text?.toLowerCase().includes(needle))),
  );
  const selected = selectedId ? project.routes[selectedId] : undefined;
  const filtered = !!deviceId || !!protocol || !!needle;
  const choose = (id: string) => {
    onAdding(false);
    select(id);
  };

  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white px-3 pt-4">
        <div className="px-1 pb-2 text-[15px] font-semibold">Devices</div>
        <DeviceFilterButton label="All devices" count={all.length} active={!deviceId} onClick={() => setDeviceId("")} />
        {routeDevices(project).map((id) => (
          <DeviceFilterButton key={id} label={project.devices[id].name} count={all.filter((r) => routeTouches(r, id)).length} active={deviceId === id} onClick={() => setDeviceId(id)} />
        ))}
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto bg-slate-50/60 p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input className="input !pl-8" aria-label="Search connections" placeholder="Search connections or endpoints..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <label className="ml-auto flex items-center gap-2 text-slate-600">
            Protocol
            <select className="input !w-auto" value={protocol} onChange={(e) => setProtocol(e.target.value)}>
              <option value="">All</option>
              {protocols.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="@container overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className={`grid ${ROUTE_COLUMNS} gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 font-semibold text-slate-600`}>
            <span>Connection</span>
            <span>From {"\u2192"} To</span>
            <span className={WIDE_ONLY}>Protocol</span>
            <span className={WIDE_ONLY}>Carries</span>
            <span>Definition</span>
          </div>
          {rows.length === 0 && (
            <div className="px-4 py-8 text-center text-slate-400">
              {filtered ? (
                <button
                  onClick={() => {
                    setDeviceId("");
                    setProtocol("");
                    setQuery("");
                  }}
                  className="text-brand-ink hover:underline"
                >
                  Clear filters
                </button>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <span>No connections yet. Add one to say which device or service talks to which, and over what.</span>
                  <button onClick={() => onAdding(true)} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-brand-ink hover:bg-brand-wash">
                    <Plus className="h-4 w-4" /> Add connection
                  </button>
                </div>
              )}
            </div>
          )}
          {rows.map((route) => (
            <RouteRow key={route.id} project={project} route={route} selected={route.id === selectedId && !adding} onSelect={() => choose(route.id)} />
          ))}
        </div>
        <div className="mt-2 text-[12px] text-slate-500">Connections define routes; message definitions describe the data.</div>
      </div>

      {adding ? (
        <AddConnectionForm defaultDeviceId={deviceId} onCancel={() => onAdding(false)} onSaved={choose} />
      ) : (
        selected && <RouteInspector key={selected.id} route={selected} onClose={() => select(null)} />
      )}
    </div>
  );
}

function DeviceFilterButton({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-left ${active ? "bg-brand-wash font-semibold text-slate-900" : "text-slate-700 hover:bg-slate-50"}`}>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <CountBadge active={active}>{count}</CountBadge>
    </button>
  );
}

function RouteRow({ project, route, selected, onSelect }: { project: Project; route: Route; selected: boolean; onSelect: () => void }) {
  const carries = routeMessages(project, route.id);
  const missing = <span className="italic text-slate-400">Not set</span>;
  return (
    <button
      onClick={onSelect}
      className={`grid w-full ${ROUTE_COLUMNS} items-center gap-3 border-b border-l-[3px] border-b-slate-100 px-4 py-2.5 text-left last:border-b-0 ${selected ? "border-l-brand bg-brand-wash" : "border-l-transparent hover:bg-slate-50"}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Waypoints className="h-4 w-4 shrink-0 text-slate-500" />
        <span className="truncate font-medium text-slate-900">{route.name || "Untitled connection"}</span>
      </span>
      <span className="truncate text-slate-700">
        {endLabel(project, route.from) ?? missing} {"\u2192"} {endLabel(project, route.to) ?? missing}
      </span>
      <span className={`${WIDE_ONLY} min-w-0`}>
        <span className={`block truncate ${route.protocol ? "text-slate-800" : "text-slate-400"}`}>{route.protocol || "Not set"}</span>
        {route.path && <span className="block truncate font-mono text-[11.5px] text-slate-500">{route.path}</span>}
      </span>
      <span className={`${WIDE_ONLY} truncate ${carries.length ? "text-slate-700" : "text-slate-400"}`}>{carries.length ? carries.map((m) => m.name).join(", ") : "Not assigned"}</span>
      <span>
        <StatusBadge status={routeStatus(route)} />
      </span>
    </button>
  );
}

function RouteInspector({ route, onClose }: { route: Route; onClose: () => void }) {
  const project = useProject();
  const { updateRoute, removeRoute, updateMessage } = useProjectStore();
  const update = (patch: Partial<Route>) => updateRoute(route.id, patch);
  const carries = routeMessages(project, route.id);
  const others = Object.values(project.messages)
    .filter((m) => m.routeId !== route.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-start gap-2 px-4 pt-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[20px] font-bold text-slate-900">{route.name || "Untitled connection"}</h2>
          <div className="mt-1">
            <StatusBadge status={routeStatus(route)} />
          </div>
        </div>
        <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-4">
        <section className="flex flex-col gap-3">
          <Field label="Name">
            <input className="input" value={route.name} onChange={(e) => update({ name: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-slate-700">
            <input type="checkbox" checked={!!route.proposed} onChange={(e) => update({ proposed: e.target.checked || undefined })} />
            Proposed: planned, not built yet
          </label>
          <EndField project={project} label="Source" value={route.from} onChange={(from) => update({ from })} />
          <EndField project={project} label="Destination" value={route.to} onChange={(to) => update({ to })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Protocol">
              <input className="input" placeholder="MQTT, HTTP, WebSocket..." value={route.protocol} onChange={(e) => update({ protocol: e.target.value })} />
            </Field>
            <Field label="Path or topic">
              <input className="input font-mono text-[12px]" placeholder="Not specified" value={route.path ?? ""} onChange={(e) => update({ path: e.target.value || undefined })} />
            </Field>
          </div>
        </section>

        <section className="flex flex-col gap-2 border-t border-slate-200 pt-4">
          <h3 className="text-[15px] font-semibold text-slate-900">Messages</h3>
          {carries.length === 0 && <div className="text-slate-400">No message definition linked.</div>}
          {carries.map((message) => (
            <div key={message.id} className="flex items-center gap-2 rounded-md border border-slate-200 px-2.5 py-1.5">
              <FileCode2 className="h-4 w-4 shrink-0 text-brand-ink" />
              <Link to={`/communications?tab=protobuf&selected=${message.id}`} className="min-w-0 flex-1 truncate font-medium text-slate-800 hover:text-brand-ink hover:underline">
                {message.name}
              </Link>
              <button onClick={() => updateMessage(message.id, { routeId: undefined })} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-600" title="Unlink message">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {others.length > 0 && (
            <select className="input text-slate-500" aria-label="Link message" value="" onChange={(e) => e.target.value && updateMessage(e.target.value, { routeId: route.id })}>
              <option value="">+ Link message</option>
              {others.map((message) => (
                <option key={message.id} value={message.id}>
                  {message.name}
                  {message.routeId && project.routes[message.routeId] ? ` (now on ${project.routes[message.routeId].name})` : ""}
                </option>
              ))}
            </select>
          )}
          <div className="text-[12px] text-slate-500">Attach the Protobuf messages this connection carries. Their format stays on the message.</div>
        </section>

        <section className="flex flex-col gap-3 border-t border-slate-200 pt-4">
          <h3 className="text-[15px] font-semibold text-slate-900">Documentation</h3>
          <DocumentLinks entityId={route.id} compact />
          <div className="rounded-md border border-slate-200 px-3 py-2">
            <NoteEditor entityId={route.id} />
          </div>
          <ServiceLink project={project} label="Open source service" end={route.from} />
          <ServiceLink project={project} label="Open destination service" end={route.to} />
        </section>

        <button
          onClick={() => {
            if (!window.confirm(`Remove ${route.name || "this connection"}? Linked messages stay; its notes and document links go with it.`)) return;
            removeRoute(route.id);
            onClose();
          }}
          className="flex items-center justify-center gap-1 rounded border border-red-200 px-3 py-1.5 text-red-600 hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Remove connection
        </button>
      </div>
    </aside>
  );
}

function AddConnectionForm({ defaultDeviceId, onCancel, onSaved }: { defaultDeviceId: string; onCancel: () => void; onSaved: (routeId: string) => void }) {
  const project = useProject();
  const { addRoute, updateMessage } = useProjectStore();
  const [name, setName] = useState("");
  const [from, setFrom] = useState<MessageEndpoint | undefined>(() => (project.devices[defaultDeviceId] ? { deviceId: defaultDeviceId } : undefined));
  const [to, setTo] = useState<MessageEndpoint | undefined>();
  const [protocol, setProtocol] = useState("");
  const [path, setPath] = useState("");
  const [messageId, setMessageId] = useState("");
  const [proposed, setProposed] = useState(false);
  const messages = Object.values(project.messages).sort((a, b) => a.name.localeCompare(b.name));

  const save = () => {
    const id = addRoute({ name: name.trim(), from, to, protocol: protocol.trim(), path: path.trim() || undefined, proposed: proposed || undefined });
    if (messageId) updateMessage(messageId, { routeId: id });
    onSaved(id);
  };

  return (
    <CreatePane title="Add connection" submitLabel="Create connection" ready={!!name.trim()} onCancel={onCancel} onSubmit={save}>
      <Field label="Name">
        <input className="input" autoFocus placeholder="e.g. Telemetry uplink" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <EndField project={project} label="Source" value={from} onChange={setFrom} />
      <EndField project={project} label="Destination" value={to} onChange={setTo} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Protocol">
          <input className="input" placeholder="MQTT, HTTP, WebSocket..." value={protocol} onChange={(e) => setProtocol(e.target.value)} />
        </Field>
        <Field label="Path or topic">
          <input className="input font-mono text-[12px]" placeholder="Not specified" value={path} onChange={(e) => setPath(e.target.value)} />
        </Field>
      </div>
      <Field label="Message definition">
        <select className="input" value={messageId} onChange={(e) => setMessageId(e.target.value)}>
          <option value="">Optional, link one later</option>
          {messages.map((message) => (
            <option key={message.id} value={message.id}>
              {message.name}
              {message.routeId && project.routes[message.routeId] ? ` (now on ${project.routes[message.routeId].name})` : ""}
            </option>
          ))}
        </select>
      </Field>
      <label className="flex items-center gap-2 text-slate-700">
        <input type="checkbox" checked={proposed} onChange={(e) => setProposed(e.target.checked)} />
        Proposed: planned, not built yet
      </label>
      <CreatePreview icon={<Waypoints className="h-4 w-4 shrink-0 text-slate-500" />} label="Route preview">
        {endLabel(project, from) ?? "source"} {"->"} {endLabel(project, to) ?? "destination"}
        {path.trim() ? ` ${path.trim()}` : ""}
      </CreatePreview>
    </CreatePane>
  );
}

function EndField({ project, label, value, onChange }: { project: Project; label: string; value: MessageEndpoint | undefined; onChange: (end: MessageEndpoint | undefined) => void }) {
  const endpoint = formatEndpoint(endpointService(project, value)?.endpoint);
  const service = endpointService(project, value);
  return (
    <Field label={label} group>
      <div className="grid grid-cols-[1fr_1fr_20px] gap-1.5">
        <EndpointPicker project={project} name={label} value={value} optional onChange={onChange} />
      </div>
      {endpoint && (
        <span className="text-[12px] text-slate-500">
          {service?.name} listens on {[service?.endpoint?.protocol, endpoint].filter(Boolean).join(" ")}
        </span>
      )}
    </Field>
  );
}

function ServiceLink({ project, label, end }: { project: Project; label: string; end: MessageEndpoint | undefined }) {
  const service = endpointService(project, end);
  if (!service) return null;
  return (
    <Link to={`/notes/${service.id}`} className="flex items-center gap-1.5 text-brand-ink hover:underline">
      <ArrowRight className="h-3.5 w-3.5" /> {label}: {service.name}
    </Link>
  );
}
