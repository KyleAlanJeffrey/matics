import { describe, expect, it } from "vitest";
import { sampleProject } from "./sample-project";
import { buildReport, noteLines } from "./report";

describe("buildReport", () => {
  const report = buildReport(sampleProject);

  it("counts every placed copy in the summary", () => {
    const total = Object.values(sampleProject.devices).reduce((sum, d) => sum + d.qty, 0);
    expect(report.summary.devices).toBe(total);
    expect(report.summary.connections).toBe(Object.keys(sampleProject.connections).length);
  });

  it("lists devices zone by zone", () => {
    const zoneOrder = Object.values(sampleProject.zones).map((z) => z.name);
    const seen = report.devices.map((d) => d.zone).filter((zone, i, all) => zone && all.indexOf(zone) === i);
    expect(seen).toEqual(zoneOrder.filter((name) => seen.includes(name)));
  });

  it("totals quantities per product in the parts list", () => {
    const lights = report.products.find((p) => p.name === "Work light");
    expect(lights?.qty).toBe(12);
  });

  it("names bus endpoints with their tag", () => {
    expect(report.connections.some((c) => c.to === "Drive CAN (B1)")).toBe(true);
  });
});

describe("noteLines", () => {
  it("reads markdown lines, keeps nesting and drops markup", () => {
    const content = "## Overview\n\n- Parent on [[Drive CAN|B1]]\n\t- [x] **Child**\n\n---";
    expect(noteLines(content)).toEqual([
      { kind: "heading", text: "Overview", depth: 0, level: 2, checked: undefined },
      { kind: "bullet", text: "Parent on B1", depth: 0, level: undefined, checked: undefined },
      { kind: "check", text: "Child", depth: 1, level: undefined, checked: true },
    ]);
  });
});
