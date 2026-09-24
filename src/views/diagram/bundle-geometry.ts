import { Position } from "@xyflow/react";
import { isBusRef, type Connection, type Position as Point, type Project, type WireBundle } from "@/model/types";
import { nearestOnPolyline, orthogonalize, polylineLength, polylineSlice, simplify } from "./wire-geometry";

// Mirrors the card width in to-flow, which imports this module.
const CARD_WIDTH = 240;

// Rough centre of the thing a connection ends at, for orienting trunks. Handle positions
// are not known outside React Flow, so this works from stored positions.
export function endpointPoint(project: Project, to: Connection["to"]): Point | undefined {
  if (isBusRef(to)) {
    const bus = project.buses[to.busId];
    return bus && { x: bus.position.x, y: bus.position.y + (bus.length ?? 320) / 2 };
  }
  const device = project.devices[to.deviceId];
  return device && { x: device.position.x + CARD_WIDTH / 2, y: device.position.y + 100 };
}

function distance(a: Point, b: Point) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// The trunk polyline ordered from its start end to its exit end, where the exit is the
// end nearer the parent trunk or the members' shared target.
export function orientedTrunk(project: Project, bundle: WireBundle): Point[] {
  const points = bundle.points;
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  const toward = bundle.parent?.point ?? sharedTarget(project, bundle);
  if (!toward) return points;
  return distance(last, toward) <= distance(first, toward) ? points : [...points].reverse();
}

export function sharedTarget(project: Project, bundle: WireBundle): Point | undefined {
  const member = bundle.members.map((id) => project.connections[id]).find(Boolean);
  return member ? endpointPoint(project, member.to) : undefined;
}

// Follows parent links to the trunk whose exit end the tails leave from.
export function rootBundle(project: Project, bundle: WireBundle): WireBundle {
  let current = bundle;
  const seen = new Set<string>();
  while (current.parent && project.bundles[current.parent.bundleId] && !seen.has(current.id)) {
    seen.add(current.id);
    current = project.bundles[current.parent.bundleId];
  }
  return current;
}

export function bundleExit(project: Project, bundle: WireBundle): Point {
  const trunk = orientedTrunk(project, rootBundle(project, bundle));
  return trunk[trunk.length - 1];
}

// Where a member meets its trunk: its recorded join, or the trunk's start end.
export function memberEntry(project: Project, bundle: WireBundle, connectionId: string): Point {
  const join = bundle.joins?.[connectionId];
  if (join) return nearestOnPolyline(bundle.points, join).point;
  return orientedTrunk(project, bundle)[0];
}

// Which side of a trunk end or join a tail attaches from.
export function facing(end: Point, toward: Point): Position {
  const dx = toward.x - end.x;
  const dy = toward.y - end.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? Position.Left : Position.Right;
  return dy < 0 ? Position.Top : Position.Bottom;
}

export interface TrunkRun {
  points: Point[];
  lineCount: number;
  // A junction dot marks where more wires joined.
  junction: boolean;
}

// Lines carried along a trunk, including everything that arrives through child trunks.
export function bundleLineCount(project: Project, bundle: WireBundle): number {
  return bundleArrivals(project, bundle).reduce((sum, a) => sum + a.lines, 0);
}

interface Arrival {
  arc: number;
  lines: number;
}

function bundleArrivals(project: Project, bundle: WireBundle): Arrival[] {
  const trunk = orientedTrunk(project, bundle);
  const arrivals: Arrival[] = [];
  for (const id of bundle.members) {
    const connection = project.connections[id];
    if (!connection) continue;
    const join = bundle.joins?.[id];
    arrivals.push({ arc: join ? nearestOnPolyline(trunk, join).arc : 0, lines: connection.lineCount });
  }
  for (const child of Object.values(project.bundles)) {
    if (child.parent?.bundleId !== bundle.id || child.id === bundle.id) continue;
    arrivals.push({ arc: nearestOnPolyline(trunk, child.parent.point).arc, lines: bundleLineCount(project, child) });
  }
  return arrivals;
}

// The trunk split where wires join it, each piece carrying the lines that have arrived
// so far, so the count reads like a harness: growing toward the exit.
export function trunkRuns(project: Project, bundle: WireBundle): TrunkRun[] {
  const trunk = orientedTrunk(project, bundle);
  if (trunk.length < 2) return [];
  const total = polylineLength(trunk);
  const arrivals = bundleArrivals(project, bundle);
  // Joins within a grid step of the start count as the start.
  const cuts = Array.from(new Set(arrivals.map((a) => (a.arc < 8 || a.arc > total - 8 ? 0 : Math.round(a.arc))))).sort((a, b) => a - b);
  if (cuts[0] !== 0) cuts.unshift(0);
  const runs: TrunkRun[] = [];
  for (let i = 0; i < cuts.length; i++) {
    const from = cuts[i];
    const to = i + 1 < cuts.length ? cuts[i + 1] : total;
    if (to - from < 1) continue;
    const lines = arrivals.filter((a) => (a.arc < 8 || a.arc > total - 8 ? 0 : Math.round(a.arc)) <= from).reduce((sum, a) => sum + a.lines, 0);
    runs.push({ points: polylineSlice(trunk, from, to), lineCount: lines, junction: i > 0 });
  }
  return runs;
}

// Default trunk for a new bundle made from the inspector: an L between a point just past
// the sources and a point just short of the target. The user drags it into shape afterwards.
export function defaultTrunk(sources: Point[], target: Point): Point[] {
  const avg = sources.reduce((acc, p) => ({ x: acc.x + p.x / sources.length, y: acc.y + p.y / sources.length }), { x: 0, y: 0 });
  const towardTarget = Math.sign(target.x - avg.x) || 1;
  const entry = { x: snap(avg.x + towardTarget * 48), y: snap(avg.y) };
  const exit = { x: snap(target.x - towardTarget * 48), y: snap(target.y) };
  const trunk = simplify(orthogonalize([entry, exit], "v"));
  return trunk.length > 1 ? trunk : [entry, { x: entry.x, y: entry.y + 64 }];
}

function snap(v: number) {
  return Math.round(v / 16) * 16;
}
