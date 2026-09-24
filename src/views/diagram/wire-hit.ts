import type { Position, Project, WireBundle } from "@/model/types";
import { memberEntry } from "./bundle-geometry";
import { nearestOnPolyline } from "./wire-geometry";
import { useWireRegistry } from "./wire-registry";

export interface WireHit {
  // Connection or bundle id.
  id: string;
  // "in" / "out" for a bundled wire's tails, "runN" for a piece of a trunk, "" otherwise.
  part: string;
}

// The wire or trunk drawn under a screen point. WireShape tags its group with the id it
// draws, so a drop can find what it landed on without React Flow's help.
export function wireAt(clientX: number, clientY: number, ignore: (id: string) => boolean = () => false): WireHit | null {
  for (const element of document.elementsFromPoint(clientX, clientY)) {
    const group = element.closest("[data-wire-id]");
    if (!group) continue;
    const full = group.getAttribute("data-wire-id") ?? "";
    const [id, part = ""] = full.split(":");
    if (!id || ignore(id)) continue;
    return { id, part };
  }
  return null;
}

// Every id that belongs to a harness: the bundle, the trunks running into it, and all
// their member wires. A trunk end must not be dropped on any of these.
export function harnessIds(project: Project, bundle: WireBundle): Set<string> {
  const ids = new Set<string>([bundle.id, ...bundle.members]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const other of Object.values(project.bundles)) {
      if (ids.has(other.id) || !other.parent || !ids.has(other.parent.bundleId)) continue;
      ids.add(other.id);
      other.members.forEach((id) => ids.add(id));
      grew = true;
    }
  }
  return ids;
}

export type WireDrop =
  | { kind: "bundle"; bundleId: string; point: Position }
  | { kind: "wire"; hostId: string; polyline: Position[]; point: Position };

// What a new wire from `fromDeviceId` released at `flow` over `hit` would join, and where.
// The drop handler and the drag preview both use this so the preview never lies.
export function resolveWireDrop(project: Project, fromDeviceId: string, hit: WireHit, flow: Position): WireDrop | null {
  const bundle = project.bundles[hit.id];
  if (bundle) return bundle.points.length > 1 ? { kind: "bundle", bundleId: bundle.id, point: nearestOnPolyline(bundle.points, flow).point } : null;
  const host = project.connections[hit.id];
  if (!host || host.from.deviceId === fromDeviceId) return null;
  if (host.bundleId) {
    // A bundled wire's tail joins its trunk where that wire does.
    const hostBundle = project.bundles[host.bundleId];
    if (!hostBundle || hit.part !== "in") return null;
    return { kind: "bundle", bundleId: hostBundle.id, point: memberEntry(project, hostBundle, host.id) };
  }
  const polyline = useWireRegistry.getState().polylines[hit.id];
  if (!polyline || polyline.length < 4) return null;
  const nearest = nearestOnPolyline(polyline, flow);
  // The target stub leaves no trunk to share (see bundleFromWire in the store).
  if (nearest.segment >= polyline.length - 2) return null;
  return { kind: "wire", hostId: host.id, polyline, point: nearest.point };
}
