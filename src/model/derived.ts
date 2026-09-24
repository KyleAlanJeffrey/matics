import type { Bus, EntityKind, PortKind, Project, DevicePreset } from "./types";
import { isBusRef } from "./types";
import { markdownLines, markdownOpenItems, markdownOutline, plainText, wikiLinks } from "./markdown";

export function entityLabel(project: Project, entityId: string): string {
  const device = project.devices[entityId];
  if (device) return device.qty > 1 ? `${device.name} x${device.qty}` : device.name;
  const preset = project.presets[entityId];
  if (preset) return preset.name;
  const bus = project.buses[entityId];
  if (bus) return bus.name;
  const zone = project.zones[entityId];
  if (zone) return zone.name;
  const doc = project.documents[entityId];
  if (doc) return doc.title;
  return entityId;
}

export function entityKind(project: Project, entityId: string): EntityKind | null {
  if (project.devices[entityId]) return "device";
  if (project.presets[entityId]) return "preset";
  if (project.buses[entityId]) return "bus";
  if (project.zones[entityId]) return "zone";
  if (project.documents[entityId]) return "document";
  return null;
}

export function presetFor(project: Project, deviceId: string): DevicePreset | undefined {
  const device = project.devices[deviceId];
  return device ? project.presets[device.presetId] : undefined;
}

// Notes and documentation are keyed by product, so a placed device resolves to its preset.
export function noteKeyFor(project: Project, entityId: string): string {
  return project.devices[entityId]?.presetId ?? entityId;
}

export function instancesOf(project: Project, presetId: string): string[] {
  return Object.values(project.devices)
    .filter((d) => d.presetId === presetId)
    .map((d) => d.id);
}

export function portKindOf(project: Project, deviceId: string, portId: string): PortKind | undefined {
  return presetFor(project, deviceId)?.ports.find((p) => p.id === portId)?.kind;
}

// The entity a wiki link names: a product, bus or document by name (case-insensitive),
// a placed device by name (its product), or an id. Returns the note key, or null.
export function resolveWikiTarget(project: Project, target: string): string | null {
  const wanted = target.trim().toLowerCase();
  if (!wanted) return null;
  const byName = (name: string | undefined) => name?.trim().toLowerCase() === wanted;
  const preset = Object.values(project.presets).find((p) => byName(p.name));
  if (preset) return preset.id;
  const bus = Object.values(project.buses).find((b) => byName(b.name));
  if (bus) return bus.id;
  const doc = Object.values(project.documents).find((d) => byName(d.title));
  if (doc) return doc.id;
  const device = Object.values(project.devices).find((d) => byName(d.name));
  if (device) return device.presetId;
  const id = target.trim();
  if (project.presets[id] || project.buses[id] || project.documents[id]) return id;
  if (project.devices[id]) return project.devices[id].presetId;
  return null;
}

// Entities a note links to, resolved; links to nothing are left out.
export function referencedEntityIds(project: Project, markdown: string | undefined): string[] {
  const found = wikiLinks(markdown ?? "")
    .map((link) => resolveWikiTarget(project, link.target))
    .filter((id): id is string => !!id);
  return Array.from(new Set(found));
}

export function noteOutline(markdown: string | undefined) {
  return markdownOutline(markdown ?? "");
}

// Unchecked checklist items, for the "Open items" count and anchor.
export function noteOpenItems(markdown: string | undefined) {
  return markdownOpenItems(markdown ?? "");
}

// First few lines of a note, for hover previews.
export function noteExcerpt(project: Project, entityId: string, maxChars = 220): string {
  const note = project.notes[noteKeyFor(project, entityId)];
  if (!note) return "";
  let out = "";
  for (const line of markdownLines(note.content)) {
    if (line.kind === "heading" || line.kind === "code" || line.kind === "rule") continue;
    const text = plainText(line.text);
    if (!text) continue;
    out += (out ? " " : "") + text;
    if (out.length >= maxChars) break;
  }
  return out.length > maxChars ? `${out.slice(0, maxChars).trimEnd()}...` : out;
}

export function noteWordCount(markdown: string | undefined): number {
  return markdownLines(markdown ?? "")
    .map((line) => plainText(line.text))
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
}

export interface Backlink {
  sourceEntityId: string;
  sourceLabel: string;
  // Text of the line that holds the link, for context.
  snippet: string;
}

export function backlinksTo(project: Project, entityId: string): Backlink[] {
  const target = noteKeyFor(project, entityId);
  const out: Backlink[] = [];
  for (const note of Object.values(project.notes)) {
    if (note.entityId === target) continue;
    const line = markdownLines(note.content).find((l) => wikiLinks(l.text).some((link) => resolveWikiTarget(project, link.target) === target));
    if (!line) continue;
    out.push({ sourceEntityId: note.entityId, sourceLabel: entityLabel(project, note.entityId), snippet: plainText(line.text) });
  }
  return out;
}

export interface PortUsage {
  portId: string;
  name: string;
  kind: PortKind;
  connectedTo: string[];
}

export function portUsage(project: Project, deviceId: string): PortUsage[] {
  const preset = presetFor(project, deviceId);
  if (!preset) return [];
  return preset.ports.map((port) => {
    const connectedTo: string[] = [];
    for (const conn of Object.values(project.connections)) {
      if (conn.from.deviceId === deviceId && conn.from.portId === port.id) {
        connectedTo.push(isBusRef(conn.to) ? conn.to.busId : conn.to.deviceId);
      } else if (!isBusRef(conn.to) && conn.to.deviceId === deviceId && conn.to.portId === port.id) {
        connectedTo.push(conn.from.deviceId);
      }
    }
    return { portId: port.id, name: port.name, kind: port.kind, connectedTo };
  });
}

// Buses a port is wired to. Usually none or one; the bus lends the port its color and tag.
export function busesForPort(project: Project, deviceId: string, portId: string): Bus[] {
  const out: Bus[] = [];
  for (const conn of Object.values(project.connections)) {
    if (conn.from.deviceId !== deviceId || conn.from.portId !== portId || !isBusRef(conn.to)) continue;
    const bus = project.buses[conn.to.busId];
    if (bus && !out.includes(bus)) out.push(bus);
  }
  return out;
}

// Aggregates port usage across every placed copy of a product.
export function presetPortUsage(project: Project, presetId: string): PortUsage[] {
  const preset = project.presets[presetId];
  if (!preset) return [];
  const perInstance = instancesOf(project, presetId).map((id) => portUsage(project, id));
  return preset.ports.map((port, i) => ({
    portId: port.id,
    name: port.name,
    kind: port.kind,
    connectedTo: Array.from(new Set(perInstance.flatMap((usage) => usage[i]?.connectedTo ?? []))),
  }));
}

// Documents linked to the entity itself or to its product.
export function documentsFor(project: Project, entityId: string) {
  const keys = new Set([entityId, noteKeyFor(project, entityId)]);
  const seen = new Set<string>();
  return project.docLinks
    .filter((link) => keys.has(link.entityId) && !seen.has(link.documentId) && seen.add(link.documentId))
    .map((link) => project.documents[link.documentId])
    .filter(Boolean);
}
