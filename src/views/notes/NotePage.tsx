import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ExternalLink, Globe, ListChecks, MoreHorizontal, Pencil, Trash2, Unlink, X } from "lucide-react";
import { useProject, useProjectDir, useProjectStore } from "@/store/project-store";
import { assetSrc } from "@/lib/assets";
import { desktop, isDesktop } from "@/lib/desktop";
import { backlinksTo, entityLabel, instancesOf, noteOpenItems, noteWordCount } from "@/model/derived";
import { ALL_DOCUMENTS, OVERVIEW_ID, documentOwners, ownNoteTitle, ownerKeyFor } from "@/model/documentation";
import { Tag } from "@/components/Badges";
import { PdfViewer } from "@/components/PdfViewer";
import { MenuItem, MenuSeparator, useDropdown } from "@/components/Menu";
import { CATEGORY_LABELS, PORT_KIND_LABELS, busColor, isBusRef, type DocumentKind } from "@/model/types";
import { categoryIcon } from "@/lib/icons";
import { findService } from "@/model/services";
import { EndpointBadge, ServiceForm } from "@/components/Services";
import { DocumentLinks } from "@/components/DocumentLinks";
import { NoteEditor, revealNoteLine } from "./NoteEditor";
import { DeviceDetailsEditor } from "./DeviceDetailsEditor";
import { docHref } from "./NotesView";
import { isLinkLike, linkHref, openExternal, safeExternalUrl } from "@/lib/links";

const DOT = "\u00b7";

const KIND_BADGE: Record<DocumentKind, string> = {
  note: "bg-slate-100 text-slate-700",
  pdf: "bg-red-50 text-red-700",
  guide: "bg-brand-wash text-brand-ink",
};

// Right pane of the Documentation workspace. `docId` is a document id, or the owner's id
// for its own note (a product, a network, or the project overview).
export function DocumentReader({ owner, docId }: { owner: string; docId: string }) {
  const project = useProject();
  const doc = project.documents[docId];
  const isOverview = docId === OVERVIEW_ID;
  const isEntity = !!project.presets[docId] || !!project.buses[docId];
  const serviceRef = findService(project, docId);

  if (serviceRef) return <ServicePage owner={owner} serviceId={docId} />;
  if (!doc && !isEntity && !isOverview) {
    return <div className="p-8 text-slate-500">This document no longer exists.</div>;
  }

  const kind: DocumentKind = doc?.kind ?? "note";
  const openItems = noteOpenItems(project.notes[docId]?.content);

  return (
    <div data-note-scroller className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-white">
      <article className="note-page w-full max-w-4xl px-8 pb-10 pt-4">
        <div className="mb-3 flex items-center gap-2 pr-12">
          <span className={`rounded px-2 py-0.5 text-[11px] font-bold tracking-wide ${KIND_BADGE[kind]}`}>{kind.toUpperCase()}</span>
          {openItems.length > 0 && (
            <button onClick={() => revealNoteLine(openItems[0].line)} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] text-slate-600 hover:bg-slate-100" title="Jump to the first open item">
              <ListChecks className="h-3.5 w-3.5" /> {openItems.length} open
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {doc && <DocumentMenu owner={owner} documentId={docId} />}
          </div>
        </div>

        <Title docId={docId} />
        <ScopeLine owner={owner} docId={docId} />

        {isEntity && <Properties key={docId} entityId={docId} />}
        {doc && (doc.file ? <AttachedFile documentId={docId} /> : isPdfLink(doc.url, doc.kind) ? <LinkedPdf documentId={docId} /> : null)}
        {doc?.url && (
          <a href={doc.url} target="_blank" rel="noreferrer" className="mb-4 flex items-center gap-1.5 truncate text-brand-ink hover:underline">
            <ExternalLink className="h-3.5 w-3.5 shrink-0" /> {doc.url}
          </a>
        )}

        <NoteEditor key={`${project.id}:${docId}`} entityId={docId} />
        <NoteFooter docId={docId} />
      </article>
    </div>
  );
}

// A service's own page: where it runs, how it is reached, and its notes and documents.
function ServicePage({ owner, serviceId }: { owner: string; serviceId: string }) {
  const project = useProject();
  const projectDir = useProjectDir();
  const { updateService, removeService } = useProjectStore();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const ref = findService(project, serviceId);
  if (!ref) return null;
  const { device, service } = ref;
  const preset = project.presets[device.presetId];
  const image = assetSrc(preset?.imageUrl, projectDir);
  const Icon = categoryIcon(preset?.category ?? "other");
  const zone = device.zoneId ? project.zones[device.zoneId] : null;
  const runsOn = zone ? `${device.name} (${zone.name})` : device.name;

  return (
    <div data-note-scroller className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-white">
      <article className="note-page w-full max-w-4xl px-8 pb-10 pt-4">
        <div className="mb-3 truncate pr-12 text-[13px] text-slate-500">
          <Link to={docHref(project, owner)} className="hover:underline">{preset?.name ?? device.name}</Link> / Services / <span className="text-slate-800">{service.name}</span>
        </div>
        <div className="mb-2 flex items-center gap-2 pr-12">
          <span className="rounded bg-brand-wash px-2 py-0.5 text-[11px] font-bold tracking-wide text-brand-ink">SOFTWARE SERVICE</span>
          {!editing && (
            <button onClick={() => setEditing(true)} className="ml-auto flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">
              <Pencil className="h-3.5 w-3.5" /> Edit service
            </button>
          )}
        </div>
        <h1 className="text-[28px] font-bold leading-tight text-slate-900">{service.name}</h1>
        <div className="mb-4 text-[15px] text-slate-600">Service on {runsOn}</div>

        {editing ? (
          <div className="mb-6 max-w-md rounded-lg border border-slate-200 p-4">
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
                navigate(docHref(project, owner));
              }}
            />
          </div>
        ) : (
          <dl className="mb-6 grid grid-cols-[120px_1fr] items-center gap-x-4 gap-y-2.5 border-b border-slate-200 pb-5">
            <dt className="text-slate-500">Runs on</dt>
            <dd>
              <Link to={`/schematic?selected=${device.id}`} className="inline-flex items-center gap-2 text-slate-900 underline underline-offset-2 hover:text-brand-ink">
                {image ? <img src={image} alt="" className="h-5 w-7 object-contain" /> : <Icon className="h-4 w-4 text-slate-500" />}
                {runsOn}
              </Link>
            </dd>
            <dt className="text-slate-500">Network port</dt>
            <dd>
              <EndpointBadge service={service} long />
            </dd>
            <dt className="self-start text-slate-500">Description</dt>
            <dd className="text-slate-800">{service.description || <span className="text-slate-400">No description</span>}</dd>
          </dl>
        )}

        <NoteEditor key={`${project.id}:${serviceId}`} entityId={serviceId} />
        <section className="mt-8">
          <h2 className="mb-2 text-[16px] font-bold text-slate-900">Linked documents</h2>
          <DocumentLinks entityId={serviceId} />
        </section>
        <NoteFooter docId={serviceId} />
      </article>
    </div>
  );
}

function Title({ docId }: { docId: string }) {
  const project = useProject();
  const updateDocument = useProjectStore((s) => s.updateDocument);
  const doc = project.documents[docId];
  const bus = project.buses[docId];
  const [draft, setDraft] = useState(doc?.title ?? "");

  if (!doc) {
    const title = docId === OVERVIEW_ID ? project.name : entityLabel(project, docId);
    return (
      <div className="mb-1 flex items-center gap-3">
        <h1 className="text-[30px] font-bold leading-tight tracking-tight text-slate-900">{title}</h1>
        {bus?.tag && <Tag color={busColor(bus)} size="md">{bus.tag}</Tag>}
      </div>
    );
  }
  const commit = () => {
    if (draft.trim() && draft.trim() !== doc.title) updateDocument(docId, { title: draft });
    else setDraft(doc.title);
  };
  return (
    <input
      className="mb-1 w-full rounded bg-transparent text-[30px] font-bold leading-tight tracking-tight text-slate-900 outline-none focus:bg-slate-50"
      value={draft}
      aria-label="Document title"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(doc.title);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

// Who a document belongs to. A shared document lists every owner, each removable.
function ScopeLine({ owner, docId }: { owner: string; docId: string }) {
  const project = useProject();
  const navigate = useNavigate();
  const unlinkDocument = useProjectStore((s) => s.unlinkDocument);
  const doc = project.documents[docId];

  if (!doc) {
    let text = "Project overview notes";
    if (project.presets[docId]) {
      const copies = instancesOf(project, docId).length;
      text = `${ownNoteTitle(project, docId)} ${DOT} ${copies === 1 ? "one placed copy" : `shared by all ${copies} placed copies`}`;
    } else if (project.buses[docId]) {
      const bus = project.buses[docId];
      text = `${ownNoteTitle(project, docId)} ${DOT} ${PORT_KIND_LABELS[bus.kind]} ${DOT} ${bus.variant || "Variant TBD"} ${DOT} ${bus.rate}`;
    }
    return <div className="mb-4 text-slate-600">{text}</div>;
  }

  const owners = documentOwners(project, docId);
  const label = owners.length > 1 ? "Shared document" : owners.length === 1 ? "Linked document" : "Unfiled document";
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2 text-slate-600">
        <span>{label}</span>
        {owners.length > 0 && <span>{DOT}</span>}
        {owners.map((id) => {
          const preset = project.presets[id];
          const Icon = preset ? categoryIcon(preset.category) : Globe;
          return (
            <span key={id} className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 py-0.5 pl-2 pr-1">
              <Icon className="h-3.5 w-3.5 text-slate-500" />
              <Link to={docHref(project, id, docId)} className="text-slate-800 hover:underline">
                {entityLabel(project, id)}
              </Link>
              <button
                onClick={() => {
                  const linkIds = project.docLinks.filter((l) => l.documentId === docId && ownerKeyFor(project, l.entityId) === id).map((l) => l.entityId);
                  linkIds.forEach((entityId) => unlinkDocument(docId, entityId));
                  if (id === owner) navigate(docHref(project, owners.find((o) => o !== id) ?? ALL_DOCUMENTS, docId), { replace: true });
                }}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                title={`Unlink from ${entityLabel(project, id)}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
      </div>
      {owners.length > 1 && <div className="mt-1 text-[13px] text-slate-500">One document, available from each of these {owners.length}.</div>}
    </div>
  );
}

function DocumentMenu({ owner, documentId }: { owner: string; documentId: string }) {
  const project = useProject();
  const projectDir = useProjectDir();
  const navigate = useNavigate();
  const { unlinkDocument, deleteDocument } = useProjectStore();
  const { open, setOpen, ref } = useDropdown();
  const doc = project.documents[documentId];
  const linkedHere = project.docLinks.some((l) => l.documentId === documentId && l.entityId === owner);
  const close = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="rounded-md border border-slate-300 p-1.5 text-slate-700 hover:bg-slate-50" title="More actions" aria-label="More actions">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          {doc.url && safeExternalUrl(doc.url) && <MenuItem icon={ExternalLink} label="Open original" onClick={close(() => openExternal(doc.url!))} />}
          {doc.file && projectDir && <MenuItem icon={ExternalLink} label="Open in default app" onClick={close(() => void openAttachedFile(doc.file!, projectDir))} />}
          {linkedHere && (
            <MenuItem
              icon={Unlink}
              label={`Unlink from ${entityLabel(project, owner)}`}
              onClick={close(() => {
                unlinkDocument(documentId, owner);
                navigate(docHref(project, owner), { replace: true });
              })}
            />
          )}
          {(doc.url || doc.file || linkedHere) && <MenuSeparator />}
          <MenuItem
            icon={Trash2}
            label="Delete document"
            danger
            onClick={close(() => {
              if (!window.confirm(`Delete "${doc.title}" and its notes? This can be undone with Undo.`)) return;
              deleteDocument(documentId);
              navigate(docHref(project, owner === ALL_DOCUMENTS || project.presets[owner] || project.buses[owner] ? owner : ALL_DOCUMENTS), { replace: true });
            })}
          />
        </div>
      )}
    </div>
  );
}

function NoteFooter({ docId }: { docId: string }) {
  const project = useProject();
  const note = project.notes[docId];
  const words = note ? noteWordCount(note.content) : 0;
  const backlinks = backlinksTo(project, docId);
  return (
    <footer className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-200 pt-3 text-[12px] text-slate-500">
      <span>{words} words</span>
      {note?.updatedAt && <span>Edited {relativeTime(note.updatedAt)}</span>}
      <span className="text-slate-400">Type [[ to link a device, network or document</span>
      {backlinks.length > 0 && (
        <span className="ml-auto flex flex-wrap items-center gap-2">
          Mentioned in:
          {backlinks.map((b) => (
            <Link key={b.sourceEntityId} to={`/notes/${b.sourceEntityId}`} className="text-brand-ink underline-offset-2 hover:underline" title={b.snippet}>
              {b.sourceEntityId === OVERVIEW_ID ? "Project overview" : b.sourceLabel}
            </Link>
          ))}
        </span>
      )}
    </footer>
  );
}

async function openAttachedFile(rel: string, projectDir: string | null) {
  if (!projectDir) return;
  try {
    await desktop.openAsset(projectDir, rel);
  } catch (error) {
    window.alert(`Could not open the attached file: ${String(error)}`);
  }
}

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "svg"];

function isPdfLink(url: string | undefined, kind: DocumentKind): url is string {
  if (!url) return false;
  return /\.pdf($|[?#])/i.test(url) || (kind === "pdf" && /^https?:/.test(url));
}

function base64Bytes(base64: string) {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

// A file attached to a document, previewed in place: PDFs in the PDF viewer, pictures as
// images, anything else behind an open button.
function AttachedFile({ documentId }: { documentId: string }) {
  const project = useProject();
  const projectDir = useProjectDir();
  const doc = project.documents[documentId];
  if (!doc?.file) return null;
  const file = doc.file;
  const ext = file.split(".").pop()?.toLowerCase() ?? "";
  const name = file.slice(file.lastIndexOf("/") + 1);
  const src = assetSrc(file, projectDir);
  const open = projectDir ? () => void openAttachedFile(file, projectDir) : undefined;

  if (!projectDir || !src) {
    return <div className="mb-6 rounded-lg border border-slate-200 px-3 py-6 text-center text-slate-500">{name}: previews of attached files are available in the desktop app.</div>;
  }
  if (ext === "pdf") return <PdfViewer name={name} load={async () => base64Bytes(await desktop.readAssetBase64(projectDir, file))} onOpenExternal={open} />;
  return (
    <section className="mb-6 overflow-hidden rounded-lg border border-slate-200">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[12px]">
        <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
        <button onClick={open} className="flex items-center gap-1 text-brand-ink hover:underline">
          <ExternalLink className="h-3.5 w-3.5" /> Open in default app
        </button>
      </div>
      {IMAGE_EXTENSIONS.includes(ext) && <img src={src} alt="" className="max-h-[640px] w-full bg-white object-contain" />}
    </section>
  );
}

// A PDF linked from the web. The desktop app downloads it itself because most sites refuse
// cross-origin requests from a page.
function LinkedPdf({ documentId }: { documentId: string }) {
  const project = useProject();
  const url = project.documents[documentId]?.url;
  if (!url) return null;
  const name = decodeURIComponent(url.split(/[?#]/)[0].slice(url.lastIndexOf("/") + 1)) || "Document.pdf";
  const load = async () => {
    if (isDesktop()) return base64Bytes(await desktop.fetchPdf(url));
    const response = await fetch(url);
    if (!response.ok) throw new Error(`the server answered ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  };
  // In the browser build a site without CORS headers cannot be read; the browser's own
  // viewer can still show it in a frame.
  const fallback = isDesktop() ? undefined : <iframe title={name} src={url} className="h-[70vh] w-full bg-white" />;
  return <PdfViewer name={name} load={load} onOpenExternal={() => openExternal(url)} fallback={fallback} />;
}

function Properties({ entityId }: { entityId: string }) {
  const project = useProject();
  const [editing, setEditing] = useState(false);
  const preset = project.presets[entityId];
  const bus = project.buses[entityId];

  // Custom properties are keyed apart from the fixed rows, which may share a label.
  const rows: { label: string; value: React.ReactNode; key?: string }[] = [];

  if (preset) {
    const instances = instancesOf(project, entityId);
    const instanceSet = new Set(instances);
    const busIds = new Set<string>();
    const relatedPresets = new Set<string>();
    for (const conn of Object.values(project.connections)) {
      if (instanceSet.has(conn.from.deviceId)) {
        if (isBusRef(conn.to)) busIds.add(conn.to.busId);
        else relatedPresets.add(project.devices[conn.to.deviceId]?.presetId ?? conn.to.deviceId);
      } else if (!isBusRef(conn.to) && instanceSet.has(conn.to.deviceId)) {
        relatedPresets.add(project.devices[conn.from.deviceId]?.presetId ?? conn.from.deviceId);
      }
    }
    relatedPresets.delete(entityId);
    const ips = instances.map((id) => project.devices[id]?.props.ip).filter(Boolean);
    const qty = instances.reduce((sum, id) => sum + (project.devices[id]?.qty ?? 0), 0);
    const zones = Array.from(new Set(instances.map((id) => project.devices[id]?.zoneId).filter((z): z is string => !!z && !!project.zones[z])));
    rows.push({ label: "Category", value: CATEGORY_LABELS[preset.category] });
    if (preset.manufacturer) rows.push({ label: "Manufacturer", value: preset.manufacturer });
    if (preset.model) rows.push({ label: "Model", value: preset.model });
    if (ips.length > 0) rows.push({ label: ips.length === 1 ? "IP address" : "IP addresses", value: ips.join(", ") });
    rows.push({ label: "Quantity", value: String(qty) });
    if (zones.length > 0) rows.push({ label: zones.length === 1 ? "Zone" : "Zones", value: zones.map((z) => project.zones[z].name).join(", ") });
    // The same custom properties the diagram popup shows, gathered across placed copies.
    for (const [key, values] of devicePropRows(project, instances)) {
      rows.push({ label: key, key: `prop:${key}`, value: <PropValues values={values} copies={instances.length} /> });
    }
    rows.push({ label: "Networks", value: <BusChips ids={Array.from(busIds)} /> });
    rows.push({ label: relatedPresets.size === 1 ? "Connected device" : "Connected devices", value: <TextLinks ids={Array.from(relatedPresets)} /> });
    rows.push({ label: "In this diagram", value: <InstancePills ids={instances} /> });
  } else if (bus) {
    const members = Object.values(project.connections)
      .filter((c) => isBusRef(c.to) && c.to.busId === entityId)
      .map((c) => c.from.deviceId);
    rows.push({ label: "Family", value: PORT_KIND_LABELS[bus.kind] });
    rows.push({ label: "Variant", value: bus.variant || <span className="text-slate-400">Not confirmed</span> });
    if (bus.tag) rows.push({ label: "Network ID", value: <Tag color={busColor(bus)}>{bus.tag}</Tag> });
    rows.push({ label: "Bitrate", value: bus.rate });
    rows.push({ label: "Members", value: <TextLinks ids={members} /> });
  }

  if (preset && editing) return <DeviceDetailsEditor presetId={entityId} onDone={() => setEditing(false)} />;
  if (rows.length === 0) return null;
  return (
    <div className="relative mb-4 border-b border-slate-200 pb-3">
      {preset && (
        <button
          onClick={() => setEditing(true)}
          className="absolute right-0 top-0 flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-700 hover:bg-slate-50"
        >
          <Pencil className="h-3 w-3" /> Edit
        </button>
      )}
      <dl className={`note-properties grid grid-cols-1 gap-x-10 sm:grid-cols-2 ${preset ? "pr-16" : ""}`}>
        {rows.map((row) => (
          <div key={row.key ?? row.label} className="grid grid-cols-[124px_1fr] items-center py-1">
            <dt className="text-[13px] text-slate-500">{row.label}</dt>
            <dd className="flex min-w-0 flex-wrap items-center gap-1.5 text-[13px]">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(iso).toLocaleDateString();
}

// Bus chips: tag pill plus name, both in the bus color.
function BusChips({ ids }: { ids: string[] }) {
  const project = useProject();
  if (ids.length === 0) return <span className="text-slate-400">None</span>;
  return (
    <>
      {ids.map((id) => {
        const bus = project.buses[id];
        if (!bus) return null;
        const color = busColor(bus);
        return (
          <Link
            key={id}
            to={`/notes/${id}`}
            className="flex items-center gap-1 rounded py-0.5 pl-0.5 pr-1.5 hover:underline"
            style={{ background: `color-mix(in srgb, ${color} 10%, white)`, color: `color-mix(in srgb, ${color} 80%, black)` }}
          >
            {bus.tag && <Tag color={color}>{bus.tag}</Tag>}
            <span className="font-medium">{bus.name}</span>
          </Link>
        );
      })}
    </>
  );
}

// Plain blue links to note pages, separated by commas.
// Custom device properties across the copies of a product, in first-seen order. `ip` has
// its own row. Each value keeps the copies that carry it.
function devicePropRows(project: ReturnType<typeof useProject>, instances: string[]) {
  const rows = new Map<string, { value: string; devices: string[] }[]>();
  for (const id of instances) {
    const device = project.devices[id];
    if (!device) continue;
    for (const [key, value] of Object.entries(device.props)) {
      if (key === "ip" || !value.trim()) continue;
      const values = rows.get(key) ?? [];
      const same = values.find((v) => v.value === value);
      if (same) same.devices.push(device.name);
      else values.push({ value, devices: [device.name] });
      rows.set(key, values);
    }
  }
  return rows;
}

function PropValue({ value }: { value: string }) {
  if (!isLinkLike(value)) return <span>{value}</span>;
  return (
    <a href={linkHref(value)} target="_blank" rel="noreferrer" className="truncate text-brand-ink hover:underline">
      {value}
    </a>
  );
}

// One value shared by every copy reads plainly; differing values say which copy has which.
// One value shared by every copy shows alone; otherwise each value names the copies that
// carry it, so a property only some copies have is not mistaken for all of them.
function PropValues({ values, copies }: { values: { value: string; devices: string[] }[]; copies: number }) {
  if (values.length === 1 && values[0].devices.length >= copies) return <PropValue value={values[0].value} />;
  return (
    <span className="flex flex-col">
      {values.map((v) => (
        <span key={v.value}>
          <PropValue value={v.value} /> <span className="text-slate-500">{v.devices.join(", ")}</span>
        </span>
      ))}
    </span>
  );
}

function TextLinks({ ids }: { ids: string[] }) {
  const project = useProject();
  if (ids.length === 0) return <span className="text-slate-400">None</span>;
  return (
    <>
      {ids.map((id, i) => (
        <span key={id}>
          <Link to={`/notes/${id}`} className="text-brand-ink hover:underline">
            {entityLabel(project, id)}
          </Link>
          {i < ids.length - 1 && ","}
        </span>
      ))}
    </>
  );
}

// Placed copies of a product, linking into the diagram rather than to a note page.
function InstancePills({ ids }: { ids: string[] }) {
  const project = useProject();
  if (ids.length === 0) return <span className="text-slate-400">Not placed yet</span>;
  return (
    <>
      {ids.map((id) => {
        const device = project.devices[id];
        const zone = device?.zoneId ? project.zones[device.zoneId] : null;
        return (
          <Link key={id} to={`/schematic?selected=${id}`} className="rounded bg-brand-wash px-1.5 py-0.5 text-brand-ink hover:underline" title={zone ? `In ${zone.name}` : undefined}>
            {entityLabel(project, id)}
          </Link>
        );
      })}
    </>
  );
}
