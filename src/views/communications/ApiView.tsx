import { useState } from "react";
import { Link } from "react-router";
import { Braces, Plus, Search, Trash2, Waypoints, X } from "lucide-react";
import { useProject, useProjectStore } from "@/store/project-store";
import { useSelection } from "@/lib/selection";
import { CreatePane, CreatePreview } from "@/components/CreatePane";
import { DocumentLinks } from "@/components/DocumentLinks";
import { NoteEditor } from "@/views/notes/NoteEditor";
import { Field } from "@/views/frames/FramesView";
import { endpointService } from "@/model/messages";
import { endLabel } from "@/model/routes";
import { API_METHODS, API_STYLES, apiDevices, apiRoutes, apiTouches } from "@/model/apis";
import type { ApiDefinition, ApiEndpoint, Project, ProtoMessage } from "@/model/types";
import { DeviceFilterButton, EndField, ServiceLink } from "./ConnectionsView";

// The table drops the style and version when the inspector leaves it narrow.
const API_COLUMNS = "grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_90px] @2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.1fr)_minmax(0,0.7fr)_90px]";
const WIDE_ONLY = "hidden @2xl:block";

type ApiDraft = Omit<ApiDefinition, "id">;

// Request/response interfaces the services answer. Who calls them stays on Connections.
export function ApiView({ adding, onAdding }: { adding: boolean; onAdding: (adding: boolean) => void }) {
  const project = useProject();
  const { selectedId, select } = useSelection();
  const [deviceId, setDeviceId] = useState("");
  const [query, setQuery] = useState("");
  const [style, setStyle] = useState("");
  const all = Object.values(project.apis).sort((a, b) => a.name.localeCompare(b.name));
  const styles = [...new Set(all.map((a) => a.style.trim()).filter(Boolean))].sort();
  const needle = query.trim().toLowerCase();
  const shows = (api: ApiDefinition) =>
    (!deviceId || apiTouches(api, deviceId)) &&
    (!style || api.style.trim() === style) &&
    (!needle ||
      [api.name, api.style, api.basePath, api.specFile, endLabel(project, api.server), ...api.endpoints.flatMap((e) => [e.path, e.description])].some((text) =>
        text?.toLowerCase().includes(needle),
      ));
  const rows = all.filter(shows);
  const selected = selectedId ? project.apis[selectedId] : undefined;
  const filtered = !!deviceId || !!style || !!needle;
  const choose = (id: string) => {
    onAdding(false);
    select(id);
  };
  const clearFilters = () => {
    setDeviceId("");
    setStyle("");
    setQuery("");
  };
  // Filters that would hide a new API make way for it.
  const created = (id: string) => {
    const api = useProjectStore.getState().project.apis[id];
    if (api && !shows(api)) clearFilters();
    choose(id);
  };

  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white px-3 pt-4">
        <div className="px-1 pb-2 text-[15px] font-semibold">Devices</div>
        <DeviceFilterButton label="All devices" count={all.length} active={!deviceId} onClick={() => setDeviceId("")} />
        {apiDevices(project).map((id) => (
          <DeviceFilterButton key={id} label={project.devices[id].name} count={all.filter((a) => apiTouches(a, id)).length} active={deviceId === id} onClick={() => setDeviceId(id)} />
        ))}
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto bg-slate-50/60 p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input className="input !pl-8" aria-label="Search APIs" placeholder="Search APIs, paths or services..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <label className="ml-auto flex items-center gap-2 text-slate-600">
            Style
            <select className="input !w-auto" value={style} onChange={(e) => setStyle(e.target.value)}>
              <option value="">All</option>
              {styles.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="@container overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className={`grid ${API_COLUMNS} gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 font-semibold text-slate-600`}>
            <span>API</span>
            <span>Served by</span>
            <span className={WIDE_ONLY}>Style</span>
            <span>Endpoints</span>
          </div>
          {rows.length === 0 && (
            <div className="px-4 py-8 text-center text-slate-400">
              {filtered ? (
                <button onClick={clearFilters} className="text-brand-ink hover:underline">
                  Clear filters
                </button>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <span>No APIs yet. Add one for each interface a service answers, such as a REST API or a gRPC service.</span>
                  <button onClick={() => onAdding(true)} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-brand-ink hover:bg-brand-wash">
                    <Plus className="h-4 w-4" /> Add API
                  </button>
                </div>
              )}
            </div>
          )}
          {rows.map((api) => (
            <ApiRow key={api.id} project={project} api={api} selected={api.id === selectedId && !adding} onSelect={() => choose(api.id)} />
          ))}
        </div>
        <div className="mt-2 text-[12px] text-slate-500">An API lists the calls a service answers; connections say who reaches it.</div>
      </div>

      {adding ? (
        <AddApiForm defaultDeviceId={deviceId} onCancel={() => onAdding(false)} onSaved={created} />
      ) : (
        selected && <ApiInspector key={selected.id} api={selected} onClose={() => select(null)} />
      )}
    </div>
  );
}

function ApiRow({ project, api, selected, onSelect }: { project: Project; api: ApiDefinition; selected: boolean; onSelect: () => void }) {
  const server = endLabel(project, api.server);
  return (
    <button
      onClick={onSelect}
      className={`grid w-full ${API_COLUMNS} items-center gap-3 border-b border-l-[3px] border-b-slate-100 px-4 py-2.5 text-left last:border-b-0 ${selected ? "border-l-brand bg-brand-wash" : "border-l-transparent hover:bg-slate-50"}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Braces className="h-4 w-4 shrink-0 text-sky-600" />
        <span className="min-w-0">
          <span className="block truncate font-medium text-slate-900">{api.name || "Untitled API"}</span>
          {(api.basePath || api.specFile) && <span className="block truncate font-mono text-[11.5px] text-slate-500">{api.basePath || api.specFile}</span>}
        </span>
      </span>
      <span className={`truncate ${server ? "text-slate-700" : "italic text-slate-400"}`}>{server ?? "Not set"}</span>
      <span className={`${WIDE_ONLY} truncate ${api.style ? "text-slate-800" : "text-slate-400"}`}>
        {api.style || "Not set"}
        {api.version && <span className="text-slate-500"> {api.version}</span>}
      </span>
      <span className={api.endpoints.length ? "text-slate-700" : "text-slate-400"}>{api.endpoints.length || "None"}</span>
    </button>
  );
}

function ApiInspector({ api, onClose }: { api: ApiDefinition; onClose: () => void }) {
  const project = useProject();
  const { updateApi, removeApi } = useProjectStore();
  const update = (patch: Partial<ApiDraft>) => updateApi(api.id, patch);
  const routes = apiRoutes(project, api);
  const service = endpointService(project, api.server);

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-start gap-2 px-4 pt-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[20px] font-bold text-slate-900">{api.name || "Untitled API"}</h2>
          <div className="mt-0.5 truncate text-slate-500">
            {[api.style, api.version].filter(Boolean).join(" ") || "API"}
            {endLabel(project, api.server) ? ` on ${endLabel(project, api.server)}` : ""}
          </div>
        </div>
        <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-4">
        <section className="flex flex-col gap-3">
          <Field label="Name">
            <input className="input" value={api.name} onChange={(e) => update({ name: e.target.value })} />
          </Field>
          <ApiFields project={project} value={api} onChange={update} />
          <Field label="Description">
            <textarea className="input min-h-[56px]" placeholder="What callers use it for" value={api.description ?? ""} onChange={(e) => update({ description: e.target.value || undefined })} />
          </Field>
        </section>

        <section className="flex flex-col gap-2 border-t border-slate-200 pt-4">
          <h3 className="text-[15px] font-semibold text-slate-900">Endpoints</h3>
          <EndpointsEditor project={project} style={api.style} endpoints={api.endpoints} onChange={(endpoints) => update({ endpoints })} />
          <div className="text-[12px] text-slate-500">Paths sit under the base path. Link a Protobuf message where a request or response has one.</div>
        </section>

        <section className="flex flex-col gap-2 border-t border-slate-200 pt-4">
          <h3 className="text-[15px] font-semibold text-slate-900">Connections</h3>
          {routes.length === 0 && (
            <div className="text-slate-400">{service ? `No connection starts or ends at ${service.name}.` : "Choose the service that answers this API to see its connections."}</div>
          )}
          {routes.map((route) => (
            <Link key={route.id} to={`/communications?tab=connections&selected=${route.id}`} className="flex items-center gap-2 text-brand-ink hover:underline">
              <Waypoints className="h-3.5 w-3.5 shrink-0" /> {route.name || "Untitled connection"}
            </Link>
          ))}
        </section>

        <section className="flex flex-col gap-3 border-t border-slate-200 pt-4">
          <h3 className="text-[15px] font-semibold text-slate-900">Documentation</h3>
          <DocumentLinks entityId={api.id} compact />
          <div className="rounded-md border border-slate-200 px-3 py-2">
            <NoteEditor entityId={api.id} />
          </div>
          <ServiceLink project={project} label="Open service" end={api.server} />
        </section>

        <button
          onClick={() => {
            if (!window.confirm(`Remove ${api.name || "this API"}? Its notes and document links go with it.`)) return;
            removeApi(api.id);
            onClose();
          }}
          className="flex items-center justify-center gap-1 rounded border border-red-200 px-3 py-1.5 text-red-600 hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Remove API
        </button>
      </div>
    </aside>
  );
}

function AddApiForm({ defaultDeviceId, onCancel, onSaved }: { defaultDeviceId: string; onCancel: () => void; onSaved: (apiId: string) => void }) {
  const project = useProject();
  const addApi = useProjectStore((s) => s.addApi);
  const [draft, setDraft] = useState<ApiDraft>(() => ({
    name: "",
    style: "REST",
    server: project.devices[defaultDeviceId] ? { deviceId: defaultDeviceId } : undefined,
    endpoints: [],
  }));
  const change = (patch: Partial<ApiDraft>) => setDraft((prev) => ({ ...prev, ...patch }));

  const save = () => {
    const optional = (text: string | undefined) => text?.trim() || undefined;
    const id = addApi({
      ...draft,
      name: draft.name.trim(),
      style: draft.style.trim(),
      version: optional(draft.version),
      basePath: optional(draft.basePath),
      specFile: optional(draft.specFile),
      endpoints: draft.endpoints.map((e) => ({ ...e, method: e.method.trim(), path: e.path.trim(), description: optional(e.description) })),
    });
    onSaved(id);
  };

  return (
    <CreatePane title="Add API" submitLabel="Create API" ready={!!draft.name.trim()} onCancel={onCancel} onSubmit={save}>
      <Field label="Name">
        <input className="input" autoFocus placeholder="e.g. Machine API" value={draft.name} onChange={(e) => change({ name: e.target.value })} />
      </Field>
      <ApiFields project={project} value={draft} onChange={change} />
      <Field label="Endpoints" group>
        <EndpointsEditor project={project} style={draft.style} endpoints={draft.endpoints} onChange={(endpoints) => change({ endpoints })} />
      </Field>
      <CreatePreview icon={<Braces className="h-4 w-4 shrink-0 text-sky-600" />} label="API preview">
        {[draft.style.trim() || "API", draft.basePath?.trim()].filter(Boolean).join(" ")} on {endLabel(project, draft.server) ?? "no service yet"}
      </CreatePreview>
    </CreatePane>
  );
}

function ApiFields({ project, value, onChange }: { project: Project; value: ApiDraft; onChange: (patch: Partial<ApiDraft>) => void }) {
  return (
    <>
      <EndField project={project} label="Served by" value={value.server} onChange={(server) => onChange({ server })} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Style">
          <input className="input" list="api-styles" placeholder="REST, gRPC..." value={value.style} onChange={(e) => onChange({ style: e.target.value })} />
        </Field>
        <Field label="Version">
          <input className="input" placeholder="v1" value={value.version ?? ""} onChange={(e) => onChange({ version: e.target.value || undefined })} />
        </Field>
        <Field label="Base path">
          <input className="input font-mono text-[12px]" placeholder="/api/v1" value={value.basePath ?? ""} onChange={(e) => onChange({ basePath: e.target.value || undefined })} />
        </Field>
        <Field label="Spec file">
          <input className="input font-mono text-[12px]" placeholder="openapi.yaml" value={value.specFile ?? ""} onChange={(e) => onChange({ specFile: e.target.value || undefined })} />
        </Field>
      </div>
      <datalist id="api-styles">
        {API_STYLES.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}

function EndpointsEditor({ project, style, endpoints, onChange }: { project: Project; style: string; endpoints: ApiEndpoint[]; onChange: (endpoints: ApiEndpoint[]) => void }) {
  const messages = Object.values(project.messages).sort((a, b) => a.name.localeCompare(b.name));
  const setEndpoint = (index: number, patch: Partial<ApiEndpoint>) => onChange(endpoints.map((endpoint, i) => (i === index ? { ...endpoint, ...patch } : endpoint)));
  const rpc = style.trim().toLowerCase() === "grpc";
  return (
    <div className="flex flex-col gap-2">
      {endpoints.length === 0 && <div className="text-slate-400">No endpoints yet.</div>}
      {endpoints.map((endpoint, index) => (
        <div key={index} className="flex flex-col gap-1.5 rounded-md border border-slate-200 p-2">
          <div className="grid grid-cols-[80px_minmax(0,1fr)_20px] items-center gap-1.5">
            <input className="input font-mono text-[12px]" aria-label="Method" list="api-methods" value={endpoint.method} onChange={(e) => setEndpoint(index, { method: e.target.value })} />
            <input
              className="input font-mono text-[12px]"
              aria-label="Path"
              placeholder={rpc ? "MethodName" : "/resource"}
              value={endpoint.path}
              onChange={(e) => setEndpoint(index, { path: e.target.value })}
            />
            <button type="button" onClick={() => onChange(endpoints.filter((_, i) => i !== index))} className="text-slate-400 hover:text-red-700" title="Remove endpoint">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <input className="input" aria-label="Endpoint description" placeholder="What it does" value={endpoint.description ?? ""} onChange={(e) => setEndpoint(index, { description: e.target.value || undefined })} />
          {messages.length > 0 && (
            <div className="grid grid-cols-2 gap-1.5">
              <MessageSelect label="Request" messages={messages} value={endpoint.requestId} onChange={(requestId) => setEndpoint(index, { requestId })} />
              <MessageSelect label="Response" messages={messages} value={endpoint.responseId} onChange={(responseId) => setEndpoint(index, { responseId })} />
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...endpoints, { method: rpc ? "rpc" : "GET", path: "" }])}
        className="flex items-center gap-1 self-start rounded px-1 py-0.5 text-brand-ink hover:bg-brand-wash"
      >
        <Plus className="h-3.5 w-3.5" /> Endpoint
      </button>
      <datalist id="api-methods">
        {API_METHODS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </div>
  );
}

function MessageSelect({ label, messages, value, onChange }: { label: string; messages: ProtoMessage[]; value: string | undefined; onChange: (id: string | undefined) => void }) {
  return (
    <select className="input text-[12px]" aria-label={`${label} message`} value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">No {label.toLowerCase()}</option>
      {messages.map((message) => (
        <option key={message.id} value={message.id}>
          {label}: {message.name}
        </option>
      ))}
    </select>
  );
}
