import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowUpRight, ChevronRight, FileUp, Globe, Info, Link2, Plus, Share2 } from "lucide-react";
import { useProject, useProjectDir, useProjectStore } from "@/store/project-store";
import { assetSrc } from "@/lib/assets";
import { isDesktop } from "@/lib/desktop";
import { categoryIcon, documentIcon } from "@/lib/icons";
import { documentsFor, entityLabel, instancesOf, presetPortUsage } from "@/model/derived";
import {
  ALL_DOCUMENTS,
  OVERVIEW_ID,
  UNFILED,
  connectedProducts,
  documentEntry,
  framesForBus,
  framesForProduct,
  ownerDocuments,
  unfiledDocuments,
  type DocEntry,
} from "@/model/documentation";
import { formatFrameRange, partyLabel } from "@/model/frames";
import { CATEGORY_LABELS, PORT_COLORS, PORT_KIND_LABELS, busColor, isBusRef, type CanFrame, type DeviceInstance, type DocumentKind, type Project } from "@/model/types";
import { Tag } from "@/components/Badges";
import { AddLinkForm, useAttachFile } from "@/components/DocumentLinks";
import { useDropdown } from "@/components/Menu";
import { EndpointBadge, ServiceForm, serviceIcon } from "@/components/Services";
import { servicesOfPreset } from "@/model/services";
import { docHref } from "./NotesView";

const DOT = "\u00b7";

type Filter = "all" | DocumentKind;
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "note", label: "Notes" },
  { id: "pdf", label: "PDFs" },
  { id: "guide", label: "Guides" },
];

const KIND_BADGE: Record<DocumentKind, string> = {
  note: "bg-slate-100 text-slate-700",
  pdf: "bg-red-50 text-red-700",
  guide: "bg-brand-wash text-brand-ink",
};

// Middle pane of the Documentation workspace: what an owner is, and its documents, ports
// and frames. The special owners (overview, all, unfiled) are plain document lists.
export function OwnerPane({ owner, current }: { owner: string; current: string | null }) {
  const project = useProject();
  if (owner === OVERVIEW_ID) return <ListPane title="Project overview" subtitle={project.description ?? ""} entries={overviewEntries(project)} owner={owner} current={current} />;
  if (owner === ALL_DOCUMENTS)
    return <ListPane title="All documents" subtitle="Every document in the project" entries={Object.keys(project.documents).map((id) => documentEntry(project, id))} owner={owner} current={current} />;
  if (owner === UNFILED)
    return <ListPane title="Unfiled" subtitle="Documents not linked to a device or network" entries={unfiledDocuments(project).map((d) => documentEntry(project, d.id))} owner={owner} current={current} />;
  return <EntityPane owner={owner} current={current} />;
}

function overviewEntries(project: Project): DocEntry[] {
  return [{ id: OVERVIEW_ID, title: "Project notes", kind: "note", subtitle: project.description ?? "Goals, scope and open questions", scope: "Project note", own: true }];
}

function PaneShell({ children }: { children: React.ReactNode }) {
  return <section className="flex w-[440px] shrink-0 flex-col overflow-y-auto border-r border-slate-200 px-5 py-4">{children}</section>;
}

function ListPane({ title, subtitle, entries, owner, current }: { title: string; subtitle: string; entries: DocEntry[]; owner: string; current: string | null }) {
  const project = useProject();
  const [filter, setFilter] = useState<Filter>("all");
  const shown = entries.filter((e) => filter === "all" || e.kind === filter);
  return (
    <PaneShell>
      <div className="mb-3 text-[13px] text-slate-500">
        {project.name} / <span className="text-slate-800">{title}</span>
      </div>
      <h2 className="text-[22px] font-bold text-slate-900">{title}</h2>
      {subtitle && <p className="mt-0.5 text-slate-600">{subtitle}</p>}
      <FilterChips filter={filter} setFilter={setFilter} />
      <DocumentList entries={shown} owner={owner} current={current} empty={entries.length === 0 ? "Nothing here yet." : "No documents of this kind."} />
      {owner === OVERVIEW_ID && <ProductIndex />}
    </PaneShell>
  );
}

// On the overview, every product and network with its document count.
function ProductIndex() {
  const project = useProject();
  const owners = [...Object.values(project.presets).map((p) => p.id), ...Object.keys(project.buses)];
  return (
    <div className="mt-6">
      <h3 className="mb-1 font-semibold text-slate-900">Devices and networks</h3>
      <div className="divide-y divide-slate-200 border-y border-slate-200">
        {owners.map((id) => (
          <Link key={id} to={docHref(project, id)} className="flex items-center gap-3 px-1 py-2 hover:bg-slate-50">
            <span className="min-w-0 flex-1 truncate">{entityLabel(project, id)}</span>
            <span className="text-[12px] text-slate-500">{ownerDocuments(project, id).length} docs</span>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </Link>
        ))}
      </div>
    </div>
  );
}

type Tab = "documents" | "services" | "ports" | "members" | "frames";

function EntityPane({ owner, current }: { owner: string; current: string | null }) {
  const project = useProject();
  const preset = project.presets[owner];
  const bus = project.buses[owner];
  const services = preset ? servicesOfPreset(project, owner) : [];
  const [tab, setTab] = useState<Tab>(services.some((ref) => ref.service.id === current) ? "services" : "documents");
  const [filter, setFilter] = useState<Filter>("all");
  const entries = ownerDocuments(project, owner);
  const frames = preset ? framesForProduct(project, owner) : { tx: framesForBus(project, owner), rx: [] as CanFrame[] };
  const frameCount = new Set([...frames.tx, ...frames.rx].map((f) => f.id)).size;
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "documents", label: "Documents", count: entries.length },
    ...(preset ? [{ id: "services" as const, label: "Services", count: services.length }, { id: "ports" as const, label: "Ports" }] : [{ id: "members" as const, label: "Members" }]),
    { id: "frames", label: "Frames", count: frameCount },
  ];

  return (
    <PaneShell>
      <OwnerHeader owner={owner} />
      <div className="mb-3 mt-4 flex border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2 font-medium ${tab === t.id ? "border-brand text-slate-900" : "border-transparent text-slate-600 hover:text-slate-900"}`}
          >
            {t.label}
            {t.count !== undefined && <span className="rounded bg-slate-100 px-1.5 text-[12px] text-slate-700">{t.count}</span>}
          </button>
        ))}
      </div>

      {tab === "documents" && (
        <>
          <FilterChips filter={filter} setFilter={setFilter} />
          <DocumentList entries={entries.filter((e) => filter === "all" || e.kind === filter)} owner={owner} current={current} empty="No documents of this kind." />
          <AddButtons owner={owner} />
          {preset && <ConnectedDevices presetId={owner} />}
          <p className="mt-4 flex items-center gap-2 text-[13px] text-slate-500">
            <Info className="h-4 w-4" /> Shared files appear on every linked device.
          </p>
        </>
      )}
      {tab === "services" && preset && <ServiceList presetId={owner} current={current} />}
      {tab === "ports" && preset && <PortList presetId={owner} />}
      {tab === "members" && bus && <BusMembers busId={owner} />}
      {tab === "frames" && <FrameList tx={frames.tx} rx={frames.rx} single={!preset} />}
    </PaneShell>
  );
}

// Services are declared per placed device; the product page lists every copy's, named by
// the copy when there is more than one.
function ServiceList({ presetId, current }: { presetId: string; current: string | null }) {
  const project = useProject();
  const addService = useProjectStore((s) => s.addService);
  const navigate = useNavigate();
  const devices = instancesOf(project, presetId).map((id) => project.devices[id]);
  const services = servicesOfPreset(project, presetId);
  const [adding, setAdding] = useState(false);
  const [deviceId, setDeviceId] = useState(devices[0]?.id ?? "");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[16px] font-bold text-slate-900">Services</h3>
          <p className="text-[13px] text-slate-500">Software declared on {devices.length > 1 ? "these devices" : "this device"}.</p>
        </div>
        {devices.length > 0 && !adding && (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">
            <Plus className="h-4 w-4" /> Add
          </button>
        )}
      </div>

      {devices.length === 0 && <div className="text-slate-500">Place this product on the schematic to declare its services.</div>}
      {devices.length > 0 && services.length === 0 && !adding && <div className="text-slate-500">No services declared yet.</div>}

      {services.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          {services.map(({ device, service }) => {
            const ServiceIcon = serviceIcon(service);
            const active = service.id === current;
            return (
              <Link
                key={service.id}
                to={docHref(project, presetId, service.id)}
                className={`flex items-center gap-3 border-b border-slate-200 px-3 py-2.5 last:border-b-0 ${active ? "bg-brand-wash shadow-[inset_3px_0_0] shadow-brand" : "hover:bg-slate-50"}`}
              >
                <ServiceIcon className="h-5 w-5 shrink-0 text-slate-600" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-semibold text-slate-900">{service.name}</span>
                    <EndpointBadge service={service} long />
                  </span>
                  <span className="block truncate text-[12px] text-slate-500">
                    {[devices.length > 1 ? copyLabel(project, device) : null, service.description].filter(Boolean).join(` ${DOT} `) || "No description"}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </Link>
            );
          })}
        </div>
      )}

      {adding && (
        <div className="rounded-lg border border-slate-200 p-3">
          {devices.length > 1 && (
            <label className="mb-2.5 flex flex-col gap-1">
              <span className="text-[11px] font-medium text-slate-500">Runs on</span>
              <select className="input" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {copyLabel(project, device)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <ServiceForm
            onCancel={() => setAdding(false)}
            onSave={(draft) => {
              const id = addService(deviceId, draft);
              setAdding(false);
              navigate(docHref(project, presetId, id));
            }}
          />
        </div>
      )}
      <p className="text-[13px] text-slate-500">Services belong to their device. Their notes stay with them.</p>
    </div>
  );
}

// Copies often share a name, so the zone tells them apart.
function copyLabel(project: Project, device: DeviceInstance) {
  const zone = device.zoneId ? project.zones[device.zoneId]?.name : undefined;
  return zone ? `${device.name} (${zone})` : device.name;
}

function OwnerHeader({ owner }: { owner: string }) {
  const project = useProject();
  const projectDir = useProjectDir();
  const preset = project.presets[owner];
  const bus = project.buses[owner];
  const image = assetSrc(preset?.imageUrl, projectDir);
  const first = preset ? instancesOf(project, owner)[0] : owner;
  const zones = preset ? zoneNames(project, owner) : [];
  const Icon = preset ? categoryIcon(preset.category) : Share2;
  const folder = preset ? zones[0] ?? CATEGORY_LABELS[preset.category] : "Networks";
  const subtitle = preset
    ? [CATEGORY_LABELS[preset.category], zones.join(", ") || [preset.manufacturer, preset.model].filter(Boolean).join(" ")].filter(Boolean).join(` ${DOT} `)
    : `${PORT_KIND_LABELS[bus.kind]} ${DOT} ${bus.variant || "Variant TBD"} ${DOT} ${bus.rate}`;

  return (
    <>
      <div className="mb-3 truncate text-[13px] text-slate-500">
        {project.name} / {folder} / <span className="text-slate-800">{entityLabel(project, owner)}</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50">
          {image ? <img src={image} alt="" className="max-h-full max-w-full object-contain p-1" /> : <Icon className="h-8 w-8" style={{ color: bus ? busColor(bus) : "#7a8086" }} />}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[22px] font-bold leading-tight text-slate-900">{entityLabel(project, owner)}</h2>
            {bus?.tag && <Tag color={busColor(bus)}>{bus.tag}</Tag>}
          </div>
          <div className="mt-0.5 truncate text-slate-600">{subtitle}</div>
          <div className="mt-1 flex items-center gap-3">
            {first && (
              <Link to={`/schematic?selected=${first}`} className="flex items-center gap-0.5 text-brand-ink underline-offset-2 hover:underline">
                Show in schematic <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            )}
            {preset?.productUrl && (
              <a href={preset.productUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-slate-600 hover:underline">
                <Globe className="h-3.5 w-3.5" /> Product page
              </a>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function zoneNames(project: Project, presetId: string) {
  const ids = new Set(instancesOf(project, presetId).map((id) => project.devices[id]?.zoneId));
  return Array.from(ids)
    .map((id) => (id ? project.zones[id]?.name : undefined))
    .filter((n): n is string => !!n);
}

function FilterChips({ filter, setFilter }: { filter: Filter; setFilter: (f: Filter) => void }) {
  return (
    <div className="my-3 flex gap-2">
      {FILTERS.map((f) => (
        <button
          key={f.id}
          onClick={() => setFilter(f.id)}
          className={`rounded-md border px-3 py-1 text-[13px] ${filter === f.id ? "border-brand bg-brand-wash font-medium text-slate-900" : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"}`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

function DocumentList({ entries, owner, current, empty }: { entries: DocEntry[]; owner: string; current: string | null; empty: string }) {
  const project = useProject();
  if (entries.length === 0) return <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-slate-500">{empty}</div>;
  return (
    <div className="max-h-[55vh] shrink-0 overflow-y-auto rounded-lg border border-slate-200">
      {entries.map((entry) => {
        const Icon = documentIcon(entry.kind);
        const active = entry.id === current;
        return (
          <Link
            key={entry.id}
            to={docHref(project, owner, entry.id)}
            className={`flex items-center gap-3 border-l-[3px] border-t border-t-slate-200 px-3 py-2.5 first:border-t-0 ${active ? "border-l-brand bg-brand-wash" : "border-l-transparent hover:bg-slate-50"}`}
          >
            <Icon className={`h-5 w-5 shrink-0 ${entry.kind === "pdf" ? "text-red-600" : "text-slate-500"}`} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-slate-900">{entry.title}</span>
              <span className="block truncate text-[13px] text-slate-500">{entry.subtitle || "\u00a0"}</span>
            </span>
            <span className="flex w-28 shrink-0 flex-col items-start gap-0.5">
              <span className={`rounded px-1.5 py-px text-[10px] font-bold tracking-wide ${KIND_BADGE[entry.kind]}`}>{entry.kind.toUpperCase()}</span>
              <span className="truncate text-[12px] text-slate-500">{entry.scope}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function AddButtons({ owner }: { owner: string }) {
  const project = useProject();
  const navigate = useNavigate();
  const { addDocumentLink, linkDocument } = useProjectStore();
  const { attach, attaching } = useAttachFile();
  const { open, setOpen, ref } = useDropdown();
  const [webLink, setWebLink] = useState(false);
  const [query, setQuery] = useState("");
  const linked = new Set(documentsFor(project, owner).map((d) => d.id));
  const candidates = Object.values(project.documents)
    .filter((d) => !linked.has(d.id) && d.title.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.title.localeCompare(b.title));

  if (webLink) {
    return (
      <div className="mt-3">
        <AddLinkForm
          onCancel={() => setWebLink(false)}
          onSave={(title, url, kind) => {
            const id = addDocumentLink(owner, { title: title.trim() || url, url: url.trim() || undefined, kind });
            setWebLink(false);
            navigate(docHref(project, owner, id));
          }}
        />
      </div>
    );
  }

  const button = "flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-medium";
  return (
    <div className="mt-3 flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        {isDesktop() && (
          <button
            disabled={attaching}
            onClick={async () => {
              const id = await attach(owner);
              if (id) navigate(docHref(project, owner, id));
            }}
            className={`${button} border-brand text-brand-ink hover:bg-brand-wash disabled:opacity-50`}
            title="Copy a PDF or other file into the project folder"
          >
            <FileUp className="h-4 w-4" /> Attach PDF or file
          </button>
        )}
        <button onClick={() => setWebLink(true)} className={`${button} border-slate-300 text-slate-800 hover:bg-slate-50`} title="Link a datasheet or web page">
          <Globe className="h-4 w-4" /> Web link
        </button>
        <button
          onClick={() => {
            const id = addDocumentLink(owner, { title: "Untitled note", kind: "note" });
            navigate(docHref(project, owner, id));
          }}
          className={`${button} border-slate-300 text-slate-800 hover:bg-slate-50`}
        >
          <Plus className="h-4 w-4" /> Write a note
        </button>
      </div>
      <div ref={ref} className="relative">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-[13px] text-brand-ink hover:underline">
          <Link2 className="h-3.5 w-3.5" /> Link a document already in the project
        </button>
        {open && (
          <div className="absolute left-0 top-full z-30 mt-1 w-80 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
            <input className="input mb-1" autoFocus placeholder="Find a document..." value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="max-h-56 overflow-y-auto">
              {candidates.length === 0 && <div className="px-2 py-1.5 text-slate-500">No other documents.</div>}
              {candidates.map((doc) => {
                const Icon = documentIcon(doc.kind);
                return (
                  <button
                    key={doc.id}
                    onClick={() => {
                      linkDocument(doc.id, owner);
                      setOpen(false);
                      setQuery("");
                      navigate(docHref(project, owner, doc.id));
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-slate-50"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-slate-500" />
                    <span className="truncate">{doc.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ConnectedDevices({ presetId }: { presetId: string }) {
  const project = useProject();
  const connected = connectedProducts(project, presetId);
  if (connected.length === 0) return null;
  return (
    <div className="mt-5">
      <h3 className="border-b border-slate-200 pb-2 font-semibold text-slate-900">Connected devices</h3>
      {connected.map(({ presetId: id, via }) => {
        const Icon = categoryIcon(project.presets[id].category);
        return (
          <Link key={id} to={docHref(project, id)} className="flex items-center gap-3 border-b border-slate-200 px-1 py-2.5 hover:bg-slate-50">
            <Icon className="h-4 w-4 text-slate-500" />
            <span className="min-w-0 flex-1 truncate">{project.presets[id].name}</span>
            <span className="truncate text-[13px] text-slate-500">{via}</span>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </Link>
        );
      })}
    </div>
  );
}

function PortList({ presetId }: { presetId: string }) {
  const project = useProject();
  const preset = project.presets[presetId];
  const usage = presetPortUsage(project, presetId);
  if (usage.length === 0) return <div className="text-slate-500">This product has no ports.</div>;
  return (
    <div className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200">
      {usage.map((port) => {
        const template = preset?.ports.find((p) => p.id === port.portId);
        const peers = Array.from(new Set(port.connectedTo));
        const bus = peers.map((id) => project.buses[id]).find(Boolean);
        const color = bus ? busColor(bus) : PORT_COLORS[port.kind];
        const variant = template?.variant || bus?.variant;
        return (
          <div key={port.portId} className="flex items-start gap-3 px-3 py-2">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full border-2" style={{ borderColor: color, background: peers.length ? color : "white" }} />
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-slate-900">
                {port.name}
                {template && template.count > 1 && <span className="ml-1 font-normal text-slate-500">x{template.count}</span>}
              </span>
              <span className="block text-[13px] text-slate-500">
                {PORT_KIND_LABELS[port.kind]} {DOT} {variant || "Variant TBD"}
                {bus?.rate ? ` ${DOT} ${bus.rate}` : ""}
              </span>
            </span>
            <span className="flex max-w-[45%] flex-col items-end gap-0.5 text-[13px]">
              {peers.length === 0 && <span className="text-slate-400">Available</span>}
              {peers.map((id) => {
                const peerBus = project.buses[id];
                const target = project.devices[id]?.presetId ?? id;
                return (
                  <Link key={id} to={docHref(project, target)} className="flex items-center gap-1 truncate text-brand-ink hover:underline">
                    {peerBus?.tag && <Tag color={busColor(peerBus)}>{peerBus.tag}</Tag>}
                    {entityLabel(project, id)}
                  </Link>
                );
              })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function BusMembers({ busId }: { busId: string }) {
  const project = useProject();
  const members = Array.from(new Set(Object.values(project.connections).filter((c) => isBusRef(c.to) && c.to.busId === busId).map((c) => c.from.deviceId)));
  if (members.length === 0) return <div className="text-slate-500">Nothing is wired to this network yet.</div>;
  return (
    <div className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200">
      {members.map((id) => {
        const device = project.devices[id];
        const preset = device ? project.presets[device.presetId] : undefined;
        if (!device || !preset) return null;
        const Icon = categoryIcon(preset.category);
        return (
          <Link key={id} to={docHref(project, preset.id)} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50">
            <Icon className="h-4 w-4 text-slate-500" />
            <span className="min-w-0 flex-1 truncate">{device.name}</span>
            {device.zoneId && project.zones[device.zoneId] && <span className="text-[13px] text-slate-500">{project.zones[device.zoneId].name}</span>}
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </Link>
        );
      })}
    </div>
  );
}

function FrameList({ tx, rx, single }: { tx: CanFrame[]; rx: CanFrame[]; single: boolean }) {
  const project = useProject();
  const groups = single ? [{ label: "On this network", frames: tx }] : [{ label: "Transmits", frames: tx }, { label: "Receives", frames: rx }];
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.label}>
          <h3 className="mb-1 font-semibold text-slate-900">
            {group.label} <span className="font-normal text-slate-500">({group.frames.length})</span>
          </h3>
          {group.frames.length === 0 ? (
            <div className="text-slate-500">None defined.</div>
          ) : (
            <table className="w-full overflow-hidden rounded-lg border border-slate-200 text-[13px]">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-1.5 font-semibold">Frame</th>
                  <th className="px-3 py-1.5 font-semibold">CAN IDs</th>
                  <th className="px-3 py-1.5 font-semibold">{group.label === "Receives" ? "From" : "To"}</th>
                </tr>
              </thead>
              <tbody>
                {group.frames.map((frame) => (
                  <tr key={frame.id} className="border-t border-slate-200">
                    <td className="px-3 py-1.5">{frame.name}</td>
                    <td className="px-3 py-1.5 font-mono">{formatFrameRange(frame)}</td>
                    <td className="truncate px-3 py-1.5 text-slate-600">
                      {group.label === "Receives" ? partyLabel(project, frame.senderId) : frame.receiverIds.map((id) => partyLabel(project, id)).join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
      <Link to="/communications?tab=can" className="flex items-center gap-0.5 text-brand-ink hover:underline">
        Open in CAN frames <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
