import { describe, expect, it } from "vitest";
import { Position } from "@xyflow/react";
import { STUB, connectionCorners, connectionPolyline, draggableSegments, hopsOver, moveCorner, moveSegment, orthogonalize, simplify, wirePath } from "./wire-geometry";

const ends = { source: { x: 0, y: 0 }, sourcePosition: Position.Right, target: { x: 200, y: 100 }, targetPosition: Position.Left };

describe("wire geometry", () => {
  it("routes a default step wire with stubs and a centered middle segment", () => {
    const pts = connectionPolyline(ends, undefined);
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: STUB, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 200 - STUB, y: 100 },
      { x: 200, y: 100 },
    ]);
    expect(draggableSegments(pts)).toEqual([1, 2, 3]);
    const offset = connectionPolyline(ends, undefined, 30);
    expect(offset[2].x).toBe(130);
  });

  it("keeps stubs in place so stored corners round-trip", () => {
    const pts = connectionPolyline(ends, undefined);
    const moved = moveSegment(pts, 2, 150, true);
    const corners = connectionCorners(moved);
    expect(corners).toEqual([{ x: 150, y: 0 }, { x: 150, y: 100 }]);
    expect(connectionPolyline(ends, corners)).toEqual(moved);
  });

  it("adds a bend when the segment next to a stub is dragged", () => {
    const pts = connectionPolyline(ends, undefined);
    const moved = moveSegment(pts, 1, 40, true);
    expect(moved[1]).toEqual({ x: STUB, y: 0 });
    expect(moved[2]).toEqual({ x: STUB, y: 40 });
    expect(connectionPolyline(ends, connectionCorners(moved))).toEqual(moved);
  });

  it("keeps manual corners and inserts elbows for diagonal runs", () => {
    const pts = connectionPolyline(ends, [{ x: 60, y: 40 }]);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      expect(a.x === b.x || a.y === b.y).toBe(true);
    }
    expect(pts[1]).toEqual({ x: STUB, y: 0 });
    expect(pts).toContainEqual({ x: 60, y: 40 });
  });

  it("simplifies collinear and duplicate points", () => {
    expect(simplify([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }])).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
    ]);
  });

  it("orthogonalizes alternating axes", () => {
    expect(orthogonalize([{ x: 0, y: 0 }, { x: 10, y: 10 }], "h")).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
    expect(orthogonalize([{ x: 0, y: 0 }, { x: 10, y: 10 }], "v")).toEqual([{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }]);
  });

  it("moves a segment and stretches its neighbours", () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 100 }];
    expect(moveSegment(pts, 1, 150, false)).toEqual([{ x: 0, y: 0 }, { x: 150, y: 0 }, { x: 150, y: 100 }, { x: 200, y: 100 }]);
  });

  it("moves a free wire's end segment without inserting corners", () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    expect(moveSegment(pts, 0, 40, false)).toEqual([{ x: 0, y: 40 }, { x: 100, y: 40 }, { x: 100, y: 100 }]);
  });

  it("moves a corner and keeps neighbours axis-aligned", () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    expect(moveCorner(pts, 1, { x: 120, y: 20 })).toEqual([{ x: 0, y: 20 }, { x: 120, y: 20 }, { x: 120, y: 100 }]);
  });

  it("finds hops where a horizontal run crosses a vertical one, skipping junctions", () => {
    const horizontal = [{ x: 0, y: 50 }, { x: 200, y: 50 }];
    const vertical = [{ x: 100, y: 0 }, { x: 100, y: 100 }];
    expect(hopsOver(horizontal, vertical)).toEqual([{ segment: 0, distance: 100 }]);
    expect(hopsOver(vertical, horizontal)).toEqual([]);
    const touching = [{ x: 0, y: 50 }, { x: 100, y: 50 }];
    expect(hopsOver(touching, vertical)).toEqual([]);
  });

  it("draws hops as arcs", () => {
    const d = wirePath([{ x: 0, y: 50 }, { x: 200, y: 50 }], [{ segment: 0, distance: 100 }]);
    expect(d).toContain("A 6 6");
    expect(d.startsWith("M 0 50")).toBe(true);
    expect(d.endsWith("L 200 50")).toBe(true);
  });
});
