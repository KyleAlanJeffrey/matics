import type { Bus, Connection, DeviceInstance, DevicePreset, FreeWire, Position, Project, WireBundle, Zone } from "@/model/types";
import { isBusRef } from "@/model/types";

// What Cmd+C picks up from the canvas. Zones bring their member devices; wires come along
// only when both ends were copied. Presets ride along so a paste into another project has
// the products it needs.
export interface DiagramClipboard {
  kind: "diagram-maker/selection";
  version: 1;
  presets: DevicePreset[];
  devices: DeviceInstance[];
  zones: Zone[];
  buses: Bus[];
  connections: Connection[];
  bundles: WireBundle[];
  freeWires: FreeWire[];
}

export const PASTE_OFFSET: Position = { x: 32, y: 32 };

export function collectSelection(project: Project, ids: string[]): DiagramClipboard | null {
  const zones = ids.map((id) => project.zones[id]).filter(Boolean);
  const deviceIds = new Set(ids.filter((id) => project.devices[id]));
  for (const zone of zones) {
    for (const device of Object.values(project.devices)) if (device.zoneId === zone.id) deviceIds.add(device.id);
  }
  const buses = ids.map((id) => project.buses[id]).filter(Boolean);
  const busIds = new Set(buses.map((b) => b.id));
  const freeWires = ids.map((id) => project.freeWires[id]).filter(Boolean);

  const devices = Array.from(deviceIds).map((id) => project.devices[id]);
  const connections = Object.values(project.connections).filter(
    (c) => deviceIds.has(c.from.deviceId) && (isBusRef(c.to) ? busIds.has(c.to.busId) : deviceIds.has(c.to.deviceId)),
  );
  const copiedConnectionIds = new Set(connections.map((c) => c.id));
  const bundles = Object.values(project.bundles)
    .map((b) => ({ ...b, members: b.members.filter((id) => copiedConnectionIds.has(id)) }))
    .filter((b) => b.members.length > 0);
  const presetIds = new Set(devices.map((d) => d.presetId));

  if (devices.length === 0 && zones.length === 0 && buses.length === 0 && freeWires.length === 0) return null;
  return structuredClone({
    kind: "diagram-maker/selection",
    version: 1,
    presets: Array.from(presetIds).map((id) => project.presets[id]).filter(Boolean),
    devices,
    zones,
    buses,
    connections,
    bundles,
    freeWires,
  });
}

export function isDiagramClipboard(value: unknown): value is DiagramClipboard {
  return !!value && typeof value === "object" && (value as DiagramClipboard).kind === "diagram-maker/selection" && Array.isArray((value as DiagramClipboard).devices);
}

function shift(point: Position, offset: Position): Position {
  return { x: point.x + offset.x, y: point.y + offset.y };
}

function zoneContaining(zones: Record<string, Zone>, point: Position): Zone | undefined {
  return Object.values(zones).find(
    (z) => point.x >= z.position.x && point.x <= z.position.x + z.size.width && point.y >= z.position.y && point.y <= z.position.y + z.size.height,
  );
}

// Adds the clipboard contents to `project` (an Immer draft or a plain object) with fresh
// ids, shifted by `offset`. Returns the new ids: zones first, then devices, buses, wires.
export function pasteSelection(project: Project, payload: DiagramClipboard, offset: Position, newId: (prefix: string) => string): string[] {
  const idMap = new Map<string, string>();
  const remap = (id: string) => idMap.get(id) ?? id;
  const created: string[] = [];

  for (const preset of payload.presets) {
    if (!project.presets[preset.id]) project.presets[preset.id] = structuredClone(preset);
  }

  for (const zone of payload.zones) {
    const id = newId("zone");
    idMap.set(zone.id, id);
    project.zones[id] = { ...structuredClone(zone), id, position: shift(zone.position, offset) };
    created.push(id);
  }

  for (const device of payload.devices) {
    const id = newId(device.presetId);
    idMap.set(device.id, id);
    const position = shift(device.position, offset);
    // A device keeps its zone when that zone was copied too; otherwise it joins whatever
    // zone it lands in, like a dropped device.
    const zoneId = device.zoneId && idMap.has(device.zoneId) ? idMap.get(device.zoneId)! : zoneContaining(project.zones, { x: position.x + 120, y: position.y + 20 })?.id ?? null;
    const copy = structuredClone(device);
    // Services are per copy; a pasted device gets its own, with fresh ids.
    if (copy.services) copy.services = copy.services.map((service) => ({ ...service, id: newId("svc") }));
    project.devices[id] = { ...copy, id, position, zoneId };
    created.push(id);
  }

  for (const bus of payload.buses) {
    const id = newId("bus");
    idMap.set(bus.id, id);
    project.buses[id] = { ...structuredClone(bus), id, position: shift(bus.position, offset) };
    created.push(id);
  }

  for (const bundle of payload.bundles) idMap.set(bundle.id, newId("bundle"));

  for (const connection of payload.connections) {
    const id = newId("conn");
    idMap.set(connection.id, id);
    const route = connection.route && {
      ...connection.route,
      points: connection.route.points?.map((p) => shift(p, offset)),
      exitPoints: connection.route.exitPoints?.map((p) => shift(p, offset)),
      tapY: connection.route.tapY === undefined ? undefined : connection.route.tapY + offset.y,
    };
    project.connections[id] = {
      ...structuredClone(connection),
      id,
      from: { deviceId: remap(connection.from.deviceId), portId: connection.from.portId },
      to: isBusRef(connection.to) ? { busId: remap(connection.to.busId) } : { deviceId: remap(connection.to.deviceId), portId: connection.to.portId },
      route,
      bundleId: connection.bundleId && idMap.has(connection.bundleId) ? idMap.get(connection.bundleId) : undefined,
    };
  }

  for (const bundle of payload.bundles) {
    const id = idMap.get(bundle.id)!;
    const joins = bundle.joins && Object.fromEntries(Object.entries(bundle.joins).filter(([cid]) => idMap.has(cid)).map(([cid, p]) => [remap(cid), shift(p, offset)]));
    const parent = bundle.parent && idMap.has(bundle.parent.bundleId) ? { bundleId: remap(bundle.parent.bundleId), point: shift(bundle.parent.point, offset) } : undefined;
    project.bundles[id] = { ...structuredClone(bundle), id, members: bundle.members.map(remap), points: bundle.points.map((p) => shift(p, offset)), joins, parent };
  }

  for (const wire of payload.freeWires) {
    const id = newId("wire");
    project.freeWires[id] = { ...structuredClone(wire), id, points: wire.points.map((p) => shift(p, offset)) };
    created.push(id);
  }

  return created;
}

// The last thing copied in this window. The system clipboard is tried first on paste so a
// selection can travel between projects and windows, but reading it can be refused.
let lastCopied: DiagramClipboard | null = null;

export async function writeClipboard(payload: DiagramClipboard) {
  lastCopied = payload;
  try {
    await navigator.clipboard?.writeText(JSON.stringify(payload));
  } catch {
    // In-memory copy still works.
  }
}

export async function readClipboard(): Promise<DiagramClipboard | null> {
  try {
    const text = await navigator.clipboard?.readText();
    if (text) {
      const parsed: unknown = JSON.parse(text);
      if (isDiagramClipboard(parsed)) return parsed;
    }
  } catch {
    // Not JSON, or the browser refused; fall back to the in-memory copy.
  }
  return lastCopied;
}

export function hasCopied() {
  return lastCopied !== null;
}
