import { describe, expect, it } from "vitest";
import { Position } from "@xyflow/react";
import type { Project } from "@/model/types";
import { sampleProject } from "@/model/sample-project";
import { bundleExit, bundleLineCount, defaultTrunk, facing, memberEntry, orientedTrunk, trunkRuns } from "./bundle-geometry";

function projectWith(bundles: Project["bundles"]): Project {
  return { ...structuredClone(sampleProject), bundles };
}

// A trunk from near the modules (x 1200) to near the power controller (x 260). Light wires carry 4 lines.
const trunk = [{ x: 1200, y: 400 }, { x: 800, y: 400 }, { x: 800, y: 600 }, { x: 260, y: 600 }];

describe("bundle geometry", () => {
  it("orients the trunk toward the members' shared target", () => {
    const project = projectWith({ t: { id: "t", members: ["front-light"], points: [...trunk].reverse() } });
    const bundle = project.bundles.t;
    expect(orientedTrunk(project, bundle)[0]).toEqual({ x: 1200, y: 400 });
    expect(bundleExit(project, bundle)).toEqual({ x: 260, y: 600 });
    expect(memberEntry(project, bundle, "front-light")).toEqual({ x: 1200, y: 400 });
  });

  it("uses a recorded join and faces the device", () => {
    const project = projectWith({ t: { id: "t", members: ["front-light", "middle-light"], points: trunk, joins: { "middle-light": { x: 800, y: 500 } } } });
    expect(memberEntry(project, project.bundles.t, "middle-light")).toEqual({ x: 800, y: 500 });
    expect(facing({ x: 800, y: 500 }, { x: 1300, y: 520 })).toBe(Position.Right);
  });

  it("splits the trunk into runs whose counts grow toward the exit", () => {
    const project = projectWith({ t: { id: "t", members: ["front-light", "middle-light"], points: trunk, joins: { "middle-light": { x: 800, y: 500 } } } });
    const runs = trunkRuns(project, project.bundles.t);
    expect(runs).toHaveLength(2);
    expect(runs[0].lineCount).toBe(4);
    expect(runs[1].lineCount).toBe(8);
    expect(runs[1].junction).toBe(true);
    expect(runs[1].points[0]).toEqual({ x: 800, y: 500 });
    expect(bundleLineCount(project, project.bundles.t)).toBe(8);
  });

  it("counts a child trunk where it arrives on its parent", () => {
    const project = projectWith({
      t: { id: "t", members: ["front-light"], points: trunk },
      c: { id: "c", members: ["rear-light"], points: [{ x: 1200, y: 800 }, { x: 800, y: 800 }, { x: 800, y: 600 }], parent: { bundleId: "t", point: { x: 800, y: 600 } } },
    });
    expect(bundleExit(project, project.bundles.c)).toEqual({ x: 260, y: 600 });
    expect(trunkRuns(project, project.bundles.t).map((r) => r.lineCount)).toEqual([4, 8]);
  });

  it("builds an orthogonal default trunk between sources and target", () => {
    const points = defaultTrunk([{ x: 0, y: 0 }, { x: 0, y: 100 }], { x: 400, y: 300 });
    expect(points.length).toBeGreaterThan(1);
    for (let i = 0; i < points.length - 1; i++) {
      expect(points[i].x === points[i + 1].x || points[i].y === points[i + 1].y).toBe(true);
    }
    expect(points[0].x).toBe(48);
  });
});
