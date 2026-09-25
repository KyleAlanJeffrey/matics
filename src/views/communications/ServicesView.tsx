import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight, BookOpen, Pencil, Search, Waypoints, X } from "lucide-react";
import { useProject, useProjectStore } from "@/store/project-store";
import { useSelection } from "@/lib/selection";
import { DocumentLinks } from "@/components/DocumentLinks";
import { EndpointBadge, ServiceForm, serviceIcon } from "@/components/Services";
import { NoteEditor } from "@/views/notes/NoteEditor";
import { docHref } from "@/views/notes/NotesView";
import { CountBadge, Field } from "@/views/frames/FramesView";
import { noteKeyFor } from "@/model/derived";
import { findService, type ServiceRef } from "@/model/services";
import { allServices, serviceRoutes } from "@/model/routes";
import type { Project } from "@/model/types";

const SERVICE_COLUMNS = "grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] @2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_110px]";
const WIDE_ONLY = "hidden @2xl:block";

// Software on every device in one place. Each service still belongs to its device: the
// same records as the device's Services tab and documentation page.
export function ServicesView({ adding, onAdding }: { adding: boolean; onAdding: (adding: boolean) => void }) {
  const project = useProject();
  const { selectedId, select } = useSelection();
  const [deviceId, setDeviceId] = useState("");
  const [query, setQuery] = useState("");
  const all = allServices(project);
  const needle = query.trim().toLowerCase();
  const rows = all.filter(
    ({ device, service }) =>
      (!deviceId || device.id === deviceId) &&
      (!needle || [service.name, service.description, service.endpoint?.protocol, device.name].some((text) => text?.toLowerCase().includes(needle))),
  );
  const devicesWithServices = Object.values(project.devices).filter((d) => (d.services ?? []).length > 0);
  const selected = selectedId ? findService(project, selectedId) : null;

  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white px-3 pt-4">
        <div className="px-1 pb-2 text-[15px] font-semibold">Devices</div>
        <FilterButton label="All devices" count={all.length} active={!deviceId} onClick={() => setDeviceId("")} />
        {devicesWithServices.map((device) => (
          <FilterButton key={device.id} label={device.name} count={device.services!.length} active={deviceId === device.id} onClick={() => setDeviceId(device.id)} />
        ))}
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto bg-slate-50/60 p-6">
        <h2 className="text-[20px] font-bold text-slate-900">
          {deviceId ? project.devices[deviceId]?.name : "All devices"}
          <span className="font-normal text-slate-500"> / Services</span>
        </h2>
        <div className="mb-3 text-slate-500">Software components and their network endpoints</div>
        <div className="relative mb-3 w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input className="input !pl-8" aria-label="Search services" placeholder="Search services..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        <div className="@container overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className={`grid ${SERVICE_COLUMNS} gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 font-semibold text-slate-600`}>
            <span>Service</span>
            <span className={WIDE_ONLY}>Device</span>
            <span>Endpoint</span>
            <span className={WIDE_ONLY}>Connections</span>
          </div>
          {rows.length === 0 && (
            <div className="px-4 py-8 text-center text-slate-400">
              {needle ? (
                <button onClick={() => setQuery("")} className="text-brand-ink hover:underline">
                  Clear filters
                </button>
              ) : (
                "No services yet. Add one for each piece of software a device runs."
              )}
            </div>
          )}
          {rows.map((ref) => (
            <ServiceRow key={ref.service.id} project={project} serviceRef={ref} selected={ref.service.id === selectedId && !adding} onSelect={() => { onAdding(false); select(ref.service.id); }} />
          ))}
        </div>
        <div className="mt-2 text-[12px] text-slate-500">Services without a network port can be documented too.</div>
      </div>

      {adding ? (
        <AddService
          defaultDeviceId={deviceId}
          onCancel={() => onAdding(false)}
          onSaved={(id, savedDeviceId) => {
            onAdding(false);
            // Filters that would hide the new service make way for it.
            if (deviceId && deviceId !== savedDeviceId) setDeviceId(savedDeviceId);
            setQuery("");
            select(id);
          }}
        />
      ) : (
        selected && <ServiceInspector key={selected.service.id} serviceRef={selected} onClose={() => select(null)} />
      )}
    </div>
  );
}

function FilterButton({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-left ${active ? "bg-brand-wash font-semibold text-slate-900" : "text-slate-700 hover:bg-slate-50"}`}>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <CountBadge active={active}>{count}</CountBadge>
    </button>
  );
}

function ServiceRow({ project, serviceRef, selected, onSelect }: { project: Project; serviceRef: ServiceRef; selected: boolean; onSelect: () => void }) {
  const { device, service } = serviceRef;
  const Icon = serviceIcon(service);
  const routes = serviceRoutes(project, service.id).length;
  return (
    <button
      onClick={onSelect}
      className={`grid w-full ${SERVICE_COLUMNS} items-center gap-3 border-b border-l-[3px] border-b-slate-100 px-4 py-2.5 text-left last:border-b-0 ${selected ? "border-l-brand bg-brand-wash" : "border-l-transparent hover:bg-slate-50"}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-brand-ink" />
        <span className="min-w-0">
          <span className="block truncate font-medium text-slate-900">{service.name}</span>
          <span className="block truncate text-[12px] text-slate-500">
            <span className="@2xl:hidden">
              {device.name}
              {service.description ? " / " : ""}
            </span>
            {service.description}
          </span>
        </span>
      </span>
      <span className={`${WIDE_ONLY} truncate text-slate-700`}>{device.name}</span>
      <span className="min-w-0">
        <EndpointBadge service={service} />
      </span>
      <span className={`${WIDE_ONLY} ${routes ? "text-slate-700" : "text-slate-400"}`}>{routes || "None"}</span>
    </button>
  );
}

function ServiceInspector({ serviceRef, onClose }: { serviceRef: ServiceRef; onClose: () => void }) {
  const project = useProject();
  const { updateService, removeService } = useProjectStore();
  const [editing, setEditing] = useState(false);
  const { device, service } = serviceRef;
  const routes = serviceRoutes(project, service.id);
  const sends = Object.values(project.messages).filter((m) => m.sender?.serviceId === service.id);
  const receives = Object.values(project.messages).filter((m) => m.receivers.some((r) => r.serviceId === service.id));

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-start gap-2 px-4 pt-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[20px] font-bold text-slate-900">{service.name}</h2>
          <div className="mt-0.5 text-slate-500">Service on {device.name}</div>
        </div>
        <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-4">
        {editing ? (
          <ServiceForm
            initial={service}
            onCancel={() => setEditing(false)}
            onSave={(draft) => {
              updateService(device.id, service.id, draft);
              setEditing(false);
            }}
            onRemove={() => {
              if (!window.confirm(`Remove ${service.name}? Its notes go with it; linked documents stay.`)) return;
              removeService(device.id, service.id);
              onClose();
            }}
          />
        ) : (
          <section className="flex flex-col gap-2">
            <dl className="grid grid-cols-[100px_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
              <dt className="text-slate-500">Runs on</dt>
              <dd className="truncate">
                <Link to={`/schematic?selected=${device.id}`} className="text-slate-900 underline underline-offset-2 hover:text-brand-ink">
                  {device.name}
                </Link>
              </dd>
              <dt className="text-slate-500">Endpoint</dt>
              <dd>
                <EndpointBadge service={service} long />
              </dd>
              {service.description && (
                <>
                  <dt className="self-start text-slate-500">Description</dt>
                  <dd className="text-slate-800">{service.description}</dd>
                </>
              )}
            </dl>
            <button onClick={() => setEditing(true)} className="mt-1 flex items-center justify-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">
              <Pencil className="h-3.5 w-3.5" /> Edit service
            </button>
          </section>
        )}

        <section className="flex flex-col gap-2 border-t border-slate-200 pt-4">
          <h3 className="text-[15px] font-semibold text-slate-900">Related connections</h3>
          {routes.length === 0 && <div className="text-slate-400">No connection starts or ends here.</div>}
          {routes.map((route) => (
            <Link key={route.id} to={`/communications?tab=connections&selected=${route.id}`} className="flex items-center gap-2 text-brand-ink hover:underline">
              <Waypoints className="h-3.5 w-3.5 shrink-0" /> {route.name || "Untitled connection"}
            </Link>
          ))}
          {(sends.length > 0 || receives.length > 0) && (
            <div className="text-[12px] text-slate-500">
              {[sends.length > 0 && `Sends ${sends.map((m) => m.name).join(", ")}`, receives.length > 0 && `Receives ${receives.map((m) => m.name).join(", ")}`].filter(Boolean).join(". ")}.
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3 border-t border-slate-200 pt-4">
          <h3 className="text-[15px] font-semibold text-slate-900">Documentation</h3>
          <DocumentLinks entityId={service.id} compact />
          <div className="rounded-md border border-slate-200 px-3 py-2">
            <NoteEditor entityId={service.id} />
          </div>
          <Link to={`/notes/${service.id}`} className="flex items-center gap-1.5 text-brand-ink hover:underline">
            <ArrowRight className="h-3.5 w-3.5" /> Open service page
          </Link>
          <Link to={docHref(project, noteKeyFor(project, device.id))} className="flex items-center gap-1.5 text-brand-ink hover:underline">
            <BookOpen className="h-3.5 w-3.5" /> Open device documentation
          </Link>
        </section>
      </div>
    </aside>
  );
}

function AddService({ defaultDeviceId, onCancel, onSaved }: { defaultDeviceId: string; onCancel: () => void; onSaved: (serviceId: string, deviceId: string) => void }) {
  const project = useProject();
  const addService = useProjectStore((s) => s.addService);
  const devices = Object.values(project.devices);
  const [deviceId, setDeviceId] = useState(() => (defaultDeviceId && project.devices[defaultDeviceId] ? defaultDeviceId : (devices.find((d) => (d.services ?? []).length > 0) ?? devices[0])?.id ?? ""));
  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-start gap-2 px-4 pt-3">
        <h2 className="flex-1 text-[20px] font-bold text-slate-900">Add a service</h2>
        <button onClick={onCancel} className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Cancel">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {devices.length === 0 ? (
          <p className="text-slate-600">A service runs on a device. Add a device to the schematic first.</p>
        ) : (
          <>
            <Field label="Runs on">
              <select className="input" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name}
                  </option>
                ))}
              </select>
            </Field>
            <ServiceForm onCancel={onCancel} onSave={(draft) => onSaved(addService(deviceId, draft), deviceId)} />
          </>
        )}
      </div>
    </aside>
  );
}
