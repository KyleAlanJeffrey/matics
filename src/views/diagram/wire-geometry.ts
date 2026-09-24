import { Position } from "@xyflow/react";
import type { Position as Point } from "@/model/types";

// Wires are orthogonal polylines. A connection's polyline is
//   [source, sourceStub, ...manual corners, targetStub, target]
// where the stubs are short fixed pieces leaving each handle so the wire never
// runs along a card edge. Free wires store their whole polyline.

export const STUB = 14;
export const CORNER_RADIUS = 6;
export const HOP_RADIUS = 6;
const EPSILON = 0.5;

export type Axis = "h" | "v";

export interface Hop {
  segment: number;
  // Distance from the segment start to the crossing point.
  distance: number;
}

function same(a: number, b: number) {
  return Math.abs(a - b) < EPSILON;
}

export function segmentAxis(a: Point, b: Point): Axis | null {
  if (same(a.y, b.y) && !same(a.x, b.x)) return "h";
  if (same(a.x, b.x) && !same(a.y, b.y)) return "v";
  return null;
}

function outward(position: Position): Point {
  switch (position) {
    case Position.Left:
      return { x: -1, y: 0 };
    case Position.Right:
      return { x: 1, y: 0 };
    case Position.Top:
      return { x: 0, y: -1 };
    default:
      return { x: 0, y: 1 };
  }
}

// Drops zero-length pieces and points that sit on a straight run. With `keepStubs`
// the second and second-to-last points survive even when collinear, so a
// connection polyline always has its handle stubs at fixed indices.
export function simplify(points: Point[], keepStubs = false): Point[] {
  const out: Point[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (last && same(last.x, point.x) && same(last.y, point.y)) continue;
    out.push({ x: point.x, y: point.y });
  }
  for (let i = 1; i < out.length - 1; ) {
    if (keepStubs && (i === 1 || i === out.length - 2)) {
      i += 1;
      continue;
    }
    const a = out[i - 1];
    const b = out[i];
    const c = out[i + 1];
    const collinear = (same(a.x, b.x) && same(b.x, c.x)) || (same(a.y, b.y) && same(b.y, c.y));
    if (collinear) out.splice(i, 1);
    else i += 1;
  }
  return out;
}

// Inserts an elbow wherever two consecutive points are not axis-aligned.
// `firstAxis` decides which way the elbow turns; it alternates along the run.
export function orthogonalize(points: Point[], firstAxis: Axis, keepStubs = false): Point[] {
  const out: Point[] = [];
  let axis = firstAxis;
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const prev = out[out.length - 1];
    if (prev && !same(prev.x, point.x) && !same(prev.y, point.y)) {
      out.push(axis === "h" ? { x: point.x, y: prev.y } : { x: prev.x, y: point.y });
    }
    out.push(point);
    const last = out[out.length - 2];
    if (last) {
      const a = segmentAxis(last, point);
      if (a) axis = a === "h" ? "v" : "h";
    }
  }
  return simplify(out, keepStubs);
}

export interface ConnectionEnds {
  source: Point;
  sourcePosition: Position;
  target: Point;
  targetPosition: Position;
}

// Full polyline for a connection. With no manual corners it is the classic step
// route; `centerOffset` nudges the middle segment along the main axis.
export function connectionPolyline(ends: ConnectionEnds, corners: Point[] | undefined, centerOffset = 0): Point[] {
  const { source, target, sourcePosition, targetPosition } = ends;
  const sOut = outward(sourcePosition);
  const tOut = outward(targetPosition);
  const s1 = { x: source.x + sOut.x * STUB, y: source.y + sOut.y * STUB };
  const t1 = { x: target.x + tOut.x * STUB, y: target.y + tOut.y * STUB };
  const horizontal = sOut.x !== 0;

  if (corners && corners.length > 0) {
    return orthogonalize([source, s1, ...alignToStubs(corners, s1, t1, horizontal), t1, target], horizontal ? "h" : "v", true);
  }

  if (horizontal) {
    const sameSide = sOut.x === tOut.x;
    const centerX = sameSide ? (sOut.x > 0 ? Math.max(s1.x, t1.x) : Math.min(s1.x, t1.x)) : (s1.x + t1.x) / 2;
    const x = centerX + centerOffset;
    return simplify([source, s1, { x, y: s1.y }, { x, y: t1.y }, t1, target], true);
  }
  const sameSide = sOut.y === tOut.y;
  const centerY = sameSide ? (sOut.y > 0 ? Math.max(s1.y, t1.y) : Math.min(s1.y, t1.y)) : (s1.y + t1.y) / 2;
  const y = centerY + centerOffset;
  return simplify([source, s1, { x: s1.x, y }, { x: t1.x, y }, t1, target], true);
}

// Ports sit at fractional positions while corners snap to the grid, so a corner that is
// meant to continue a stub can miss it by a few pixels and produce a tiny jog with its own
// handle. Corners within JOG of a stub coordinate take it, and consecutive corners that
// nearly line up are made collinear, so a run reads as one straight segment.
export const JOG = 12;

function alignToStubs(corners: Point[], s1: Point, t1: Point, horizontal: boolean): Point[] {
  const out = corners.map((p) => ({ ...p }));
  const key = horizontal ? "y" : "x";
  const first = out[0];
  const last = out[out.length - 1];
  if (Math.abs(first[key] - s1[key]) < JOG) first[key] = s1[key];
  if (Math.abs(last[key] - t1[key]) < JOG) last[key] = t1[key];
  for (const corner of out) {
    for (const axis of ["x", "y"] as const) {
      for (const stub of [s1, t1]) if (Math.abs(corner[axis] - stub[axis]) < JOG) corner[axis] = stub[axis];
    }
  }
  for (let i = 1; i < out.length; i++) {
    for (const axis of ["x", "y"] as const) {
      if (out[i][axis] !== out[i - 1][axis] && Math.abs(out[i][axis] - out[i - 1][axis]) < JOG) out[i][axis] = out[i - 1][axis];
    }
  }
  return out;
}

// Which segments of a connection polyline the user may drag: everything between the stubs.
export function draggableSegments(points: Point[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < points.length - 2; i++) out.push(i);
  return out;
}

// The corners worth storing for a connection: everything between the two stubs.
export function connectionCorners(points: Point[]): Point[] {
  return points.slice(2, -2);
}

// Moves segment `index` perpendicular to itself so it sits at `coordinate`
// (a y for a horizontal segment, an x for a vertical one). Neighbouring segments
// stretch. With `fixedEnds` (connection wires) the handle points and their stubs
// stay put, so dragging the segment next to a stub inserts a new corner instead.
export function moveSegment(points: Point[], index: number, coordinate: number, fixedEnds: boolean): Point[] {
  const out = points.map((p) => ({ ...p }));
  const a = out[index];
  const b = out[index + 1];
  const axis = segmentAxis(a, b);
  if (!axis) return out;
  const key = axis === "h" ? "y" : "x";
  const startFixed = fixedEnds && index <= 1;
  const endFixed = fixedEnds && index >= out.length - 3;
  if (startFixed) out.splice(index + 1, 0, { ...a });
  const startIdx = startFixed ? index + 1 : index;
  const endIdx = startIdx + 1;
  if (endFixed) out.splice(endIdx, 0, { ...out[endIdx] });
  out[startIdx][key] = coordinate;
  out[endIdx][key] = coordinate;
  return simplify(out, fixedEnds);
}

// Moves a single corner; neighbours slide to keep their segments axis-aligned.
export function moveCorner(points: Point[], index: number, to: Point): Point[] {
  const out = points.map((p) => ({ ...p }));
  const prev = out[index - 1];
  const next = out[index + 1];
  if (prev) {
    const axis = segmentAxis(prev, out[index]);
    if (axis === "h") prev.y = to.y;
    else if (axis === "v") prev.x = to.x;
  }
  if (next) {
    const axis = segmentAxis(out[index], next);
    if (axis === "h") next.y = to.y;
    else if (axis === "v") next.x = to.x;
  }
  out[index] = { ...to };
  return simplify(out);
}

export function segmentLength(a: Point, b: Point) {
  return Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
}

export function pointAlong(a: Point, b: Point, distance: number): Point {
  const len = segmentLength(a, b);
  if (len === 0) return { ...a };
  const t = distance / len;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// Midpoint of the longest segment among `candidates` (or all), used to place labels.
export function labelAnchor(points: Point[], candidates?: number[]): { point: Point; axis: Axis } {
  const indices = candidates && candidates.length > 0 ? candidates : points.slice(0, -1).map((_, i) => i);
  let best = indices[0] ?? 0;
  let bestLen = -1;
  for (const i of indices) {
    const len = segmentLength(points[i], points[i + 1]);
    if (len > bestLen) {
      bestLen = len;
      best = i;
    }
  }
  const a = points[best];
  const b = points[best + 1] ?? a;
  return { point: pointAlong(a, b, segmentLength(a, b) / 2), axis: segmentAxis(a, b) ?? "h" };
}

// Crossings where a horizontal segment of `points` passes over a vertical segment
// of `other`. Only horizontal runs hop, so each crossing is drawn exactly once.
// Touching ends (junctions) are not crossings.
export function hopsOver(points: Point[], other: Point[]): Hop[] {
  const hops: Hop[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (segmentAxis(a, b) !== "h") continue;
    const y = a.y;
    const x1 = Math.min(a.x, b.x);
    const x2 = Math.max(a.x, b.x);
    for (let j = 0; j < other.length - 1; j++) {
      const c = other[j];
      const d = other[j + 1];
      if (segmentAxis(c, d) !== "v") continue;
      const x = c.x;
      const y1 = Math.min(c.y, d.y);
      const y2 = Math.max(c.y, d.y);
      const inside = x > x1 + EPSILON && x < x2 - EPSILON && y > y1 + EPSILON && y < y2 - EPSILON;
      if (inside) hops.push({ segment: i, distance: Math.abs(x - a.x) });
    }
  }
  return hops;
}

// SVG path with rounded corners and semicircular hops.
export function wirePath(points: Point[], hops: Hop[] = [], radius = CORNER_RADIUS): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  const hopsBySegment = new Map<number, number[]>();
  for (const hop of hops) {
    const list = hopsBySegment.get(hop.segment) ?? [];
    list.push(hop.distance);
    hopsBySegment.set(hop.segment, list);
  }

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = segmentLength(a, b);
    const dir = { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) };
    // Leave room at both ends for the corner arcs.
    const startTrim = i === 0 ? 0 : Math.min(radius, len / 2);
    const endTrim = i === points.length - 2 ? 0 : Math.min(radius, len / 2);

    const distances = (hopsBySegment.get(i) ?? []).filter((dist) => dist > startTrim + HOP_RADIUS && dist < len - endTrim - HOP_RADIUS).sort((p, q) => p - q);
    for (const dist of distances) {
      const before = pointAlong(a, b, dist - HOP_RADIUS);
      const after = pointAlong(a, b, dist + HOP_RADIUS);
      d += ` L ${before.x} ${before.y}`;
      // Sweep so the hump always bulges upward on screen.
      const sweep = dir.x > 0 ? 1 : 0;
      d += ` A ${HOP_RADIUS} ${HOP_RADIUS} 0 0 ${sweep} ${after.x} ${after.y}`;
    }

    const end = pointAlong(a, b, len - endTrim);
    d += ` L ${end.x} ${end.y}`;
    if (i < points.length - 2) {
      const c = points[i + 2];
      const nextLen = segmentLength(b, c);
      const next = pointAlong(b, c, Math.min(radius, nextLen / 2));
      d += ` Q ${b.x} ${b.y} ${next.x} ${next.y}`;
    }
  }
  return d;
}

// Snaps `point` so the segment from `from` is axis-aligned, picking the dominant axis.
export function snapOrthogonal(from: Point, point: Point): Point {
  return Math.abs(point.x - from.x) >= Math.abs(point.y - from.y) ? { x: point.x, y: from.y } : { x: from.x, y: point.y };
}

export interface PolylineHit {
  // Segment index and distance along it to the nearest point.
  segment: number;
  distance: number;
  point: Point;
  // Distance from the polyline start to that point.
  arc: number;
}

// Nearest point on an orthogonal polyline. Used to place a join where a wire was dropped
// and to order joins along a trunk.
export function nearestOnPolyline(points: Point[], p: Point): PolylineHit {
  let best: PolylineHit = { segment: 0, distance: 0, point: { ...points[0] }, arc: 0 };
  let bestGap = Infinity;
  let arc = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = segmentLength(a, b);
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len)));
    const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const gap = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
    if (gap < bestGap) {
      bestGap = gap;
      best = { segment: i, distance: len * t, point: q, arc: arc + len * t };
    }
    arc += len;
  }
  return best;
}

// The polyline from `hit` onward: the join point followed by the remaining corners.
export function polylineFrom(points: Point[], hit: PolylineHit): Point[] {
  return simplify([hit.point, ...points.slice(hit.segment + 1)]);
}

// The polyline up to `hit`: the corners before the join point.
export function polylineUntil(points: Point[], hit: PolylineHit): Point[] {
  return simplify([...points.slice(0, hit.segment + 1), hit.point]);
}

export function polylineLength(points: Point[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) total += segmentLength(points[i], points[i + 1]);
  return total;
}

// The piece of a polyline between two arc positions, inclusive of both cut points.
export function polylineSlice(points: Point[], fromArc: number, toArc: number): Point[] {
  const out: Point[] = [];
  let arc = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = segmentLength(a, b);
    const start = arc;
    const end = arc + len;
    if (end >= fromArc && start <= toArc) {
      if (out.length === 0) out.push(pointAlong(a, b, Math.max(0, fromArc - start)));
      if (end <= toArc) out.push({ ...b });
      else out.push(pointAlong(a, b, toArc - start));
    }
    arc = end;
  }
  return simplify(out);
}
