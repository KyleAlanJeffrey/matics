import type { CanFrame, DocumentKind, Project } from "./types";
import { PORT_KIND_LABELS, isBusRef } from "./types";
import { instancesOf, noteExcerpt, noteKeyFor, portKindOf } from "./derived";
import { formatFrameRange, parseCanId } from "./frames";
import { markdownLines, plainText } from "./markdown";
import { findService } from "./services";

// The Documentation workspace: a tree of owners (products and networks), each owner's
// documents, and a reader. An owner's own note is listed first as a document; linked
// documents follow.

export const OVERVIEW_ID = "overview";
export const ALL_DOCUMENTS = "all";
export const UNFILED = "unfiled";

export interface DocEntry {
  // A document id, or the owner's id for its own note.
  id: string;
  title: string;
  kind: DocumentKind;
  subtitle: string;
  scope: string;
  own: boolean;
}

export function isOwner(project: Project, id: string) {
  return !!project.presets[id] || !!project.buses[id];
}

// Whether anything that can have documents linked to it still has this id.
export function entityExists(project: Project, id: string) {
  const owners = [project.presets, project.buses, project.devices, project.frames, project.messages, project.ioSignals, project.netMappings, project.routes, project.apis];
  return owners.some((collection) => !!collection[id]) || !!findService(project, id);
}

// Where a link files its document: a placed copy files under its product, and a service
// under the product of the device it runs on.
export function ownerKeyFor(project: Project, entityId: string): string {
  const service = findService(project, entityId);
  return noteKeyFor(project, service ? service.device.id : entityId);
}

// Other things a document is linked to, as note keys (products rather than copies).
export function documentOwners(project: Project, documentId: string): string[] {
  const owners = project.docLinks.filter((l) => l.documentId === documentId).map((l) => ownerKeyFor(project, l.entityId));
  return Array.from(new Set(owners)).filter((id) => isOwner(project, id));
}

function scopeLabel(project: Project, documentId: string) {
  const owners = documentOwners(project, documentId);
  if (owners.length > 1) return `Shared ${"\u00b7"} ${owners.length} devices`;
  const doc = project.documents[documentId];
  if (doc?.kind === "note") return "Device note";
  return doc?.scope === "preset" ? "Preset document" : "Linked document";
}

function docSubtitle(project: Project, documentId: string) {
  const doc = project.documents[documentId];
  if (!doc) return "";
  const firstLine = markdownLines(project.notes[documentId]?.content ?? "").find((l) => l.kind !== "heading");
  if (firstLine) return plainText(firstLine.text);
  if (doc.url) return hostOf(doc.url);
  if (doc.file) return doc.file.slice(doc.file.lastIndexOf("/") + 1);
  return "";
}

export function ownNoteTitle(project: Project, ownerId: string) {
  return project.buses[ownerId] ? "Network notes" : "Device notes";
}

// Links made to a placed copy belong to its product, as in documentOwners.
export function documentsOfOwner(project: Project, ownerId: string) {
  const ids = new Set(project.docLinks.filter((link) => ownerKeyFor(project, link.entityId) === ownerId).map((link) => link.documentId));
  return Array.from(ids, (id) => project.documents[id]).filter(Boolean);
}

export function ownerDocuments(project: Project, ownerId: string): DocEntry[] {
  const own: DocEntry = {
    id: ownerId,
    title: ownNoteTitle(project, ownerId),
    kind: "note",
    subtitle: noteExcerpt(project, ownerId, 80) || "Nothing written yet",
    scope: project.buses[ownerId] ? "Network note" : "Product note",
    own: true,
  };
  return [own, ...documentsOfOwner(project, ownerId).map((doc) => documentEntry(project, doc.id))];
}

export function documentEntry(project: Project, documentId: string): DocEntry {
  const doc = project.documents[documentId];
  return { id: documentId, title: doc?.title ?? "Untitled", kind: doc?.kind ?? "note", subtitle: docSubtitle(project, documentId), scope: scopeLabel(project, documentId), own: false };
}

// What the tree counts: linked documents, plus the owner's own note once it has text.
export function documentCount(project: Project, ownerId: string): number {
  const own = project.notes[ownerId]?.content.trim() ? 1 : 0;
  return own + documentsOfOwner(project, ownerId).length;
}

export function unfiledDocuments(project: Project) {
  return Object.values(project.documents).filter((doc) => !project.docLinks.some((l) => l.documentId === doc.id));
}

// Products wired to this one, with how they connect ("Ethernet / CAN").
export function connectedProducts(project: Project, presetId: string): { presetId: string; via: string }[] {
  const mine = new Set(instancesOf(project, presetId));
  const via = new Map<string, Set<string>>();
  const add = (otherDeviceId: string, deviceId: string, portId: string) => {
    const other = project.devices[otherDeviceId]?.presetId;
    if (!other || other === presetId) return;
    const kind = portKindOf(project, deviceId, portId);
    const labels = via.get(other) ?? new Set<string>();
    if (kind) labels.add(PORT_KIND_LABELS[kind]);
    via.set(other, labels);
  };
  for (const conn of Object.values(project.connections)) {
    if (isBusRef(conn.to)) continue;
    if (mine.has(conn.from.deviceId)) add(conn.to.deviceId, conn.from.deviceId, conn.from.portId);
    else if (mine.has(conn.to.deviceId)) add(conn.from.deviceId, conn.to.deviceId, conn.to.portId);
  }
  // Sharing a bus is a connection too.
  const myBuses = new Set(Object.values(project.connections).filter((c) => mine.has(c.from.deviceId) && isBusRef(c.to)).map((c) => (isBusRef(c.to) ? c.to.busId : "")));
  for (const conn of Object.values(project.connections)) {
    if (!isBusRef(conn.to) || !myBuses.has(conn.to.busId) || mine.has(conn.from.deviceId)) continue;
    const other = project.devices[conn.from.deviceId]?.presetId;
    if (!other || other === presetId) continue;
    const labels = via.get(other) ?? new Set<string>();
    labels.add(project.buses[conn.to.busId]?.tag ?? project.buses[conn.to.busId]?.name ?? "Bus");
    via.set(other, labels);
  }
  return Array.from(via, ([id, labels]) => ({ presetId: id, via: Array.from(labels).join(" / ") })).sort((a, b) =>
    (project.presets[a.presetId]?.name ?? "").localeCompare(project.presets[b.presetId]?.name ?? ""),
  );
}

// Frames a product's copies (or the product as a whole) send and receive.
export function framesForProduct(project: Project, presetId: string): { tx: CanFrame[]; rx: CanFrame[] } {
  const parties = new Set([presetId, ...instancesOf(project, presetId)]);
  const frames = Object.values(project.frames);
  return { tx: frames.filter((f) => parties.has(f.senderId)), rx: frames.filter((f) => f.receiverIds.some((id) => parties.has(id))) };
}

export function framesForBus(project: Project, busId: string): CanFrame[] {
  return Object.values(project.frames).filter((f) => f.busIds.includes(busId));
}

export interface SearchHit {
  // Where the hit opens: an owner (or special id) and optionally one of its documents.
  owner: string;
  doc?: string;
  label: string;
  detail: string;
  kind: "Device" | "Network" | "Document" | "Note" | "Port" | "Frame" | "Service";
}

// Search over titles, device and network names, services, note text, ports and frame IDs.
export function searchDocumentation(project: Project, query: string, limit = 12): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];
  const has = (text: string | undefined) => !!text && text.toLowerCase().includes(q);

  for (const preset of Object.values(project.presets)) {
    if (has(preset.name) || has(preset.model) || has(preset.manufacturer)) hits.push({ owner: preset.id, label: preset.name, detail: [preset.manufacturer, preset.model].filter(Boolean).join(" "), kind: "Device" });
  }
  for (const bus of Object.values(project.buses)) {
    if (has(bus.name) || has(bus.tag)) hits.push({ owner: bus.id, label: bus.name, detail: [bus.tag, bus.rate].filter(Boolean).join(" \u00b7 "), kind: "Network" });
  }
  for (const doc of Object.values(project.documents)) {
    if (has(doc.title)) hits.push({ owner: documentOwners(project, doc.id)[0] ?? ALL_DOCUMENTS, doc: doc.id, label: doc.title, detail: doc.kind.toUpperCase(), kind: "Document" });
  }
  for (const note of Object.values(project.notes)) {
    const line = markdownLines(note.content).find((l) => has(plainText(l.text)));
    if (!line) continue;
    const isDoc = !!project.documents[note.entityId];
    const service = findService(project, note.entityId)?.service;
    const owner = isDoc ? documentOwners(project, note.entityId)[0] ?? ALL_DOCUMENTS : ownerKeyFor(project, note.entityId);
    const title = isDoc ? project.documents[note.entityId].title : `${service?.name ?? project.presets[note.entityId]?.name ?? project.buses[note.entityId]?.name ?? note.entityId} notes`;
    hits.push({ owner, doc: note.entityId, label: title, detail: plainText(line.text), kind: "Note" });
  }
  for (const device of Object.values(project.devices)) {
    for (const service of device.services ?? []) {
      if (has(service.name) || has(service.description)) hits.push({ owner: device.presetId, doc: service.id, label: service.name, detail: `Service on ${device.name}`, kind: "Service" });
    }
  }
  for (const preset of Object.values(project.presets)) {
    for (const port of preset.ports) {
      if (has(port.name)) hits.push({ owner: preset.id, label: `${preset.name} ${"\u00b7"} ${port.name}`, detail: PORT_KIND_LABELS[port.kind], kind: "Port" });
    }
  }
  const id = parseCanId(q);
  for (const frame of Object.values(project.frames)) {
    const inRange = id !== undefined && id >= frame.startId && id <= frame.endId;
    if (!inRange && !has(frame.name)) continue;
    const owner = project.devices[frame.senderId]?.presetId ?? (project.presets[frame.senderId] ? frame.senderId : ALL_DOCUMENTS);
    hits.push({ owner, label: frame.name, detail: formatFrameRange(frame), kind: "Frame" });
  }
  return hits.slice(0, limit);
}

// "manufacturer.com" for a web link.
function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
