import { describe, expect, it } from "vitest";
import { sampleProject } from "./sample-project";
import { backlinksTo, documentsFor, noteKeyFor, portUsage, presetPortUsage, referencedEntityIds } from "./derived";

describe("derived", () => {
  it("finds wiki links in note content", () => {
    const ids = referencedEntityIds(sampleProject, sampleProject.notes["driver"].content);
    expect(ids.sort()).toEqual(["bus1", "encoder"]);
  });

  it("computes backlinks to a product from other notes", () => {
    const links = backlinksTo(sampleProject, "driver");
    const sources = links.map((l) => l.sourceEntityId);
    expect(sources).toContain("encoder-wiring");
    expect(sources).toContain("encoder");
    expect(sources).not.toContain("driver");
  });

  it("resolves a placed device to its product for backlinks and documents", () => {
    expect(noteKeyFor(sampleProject, "middle-driver")).toBe("driver");
    expect(backlinksTo(sampleProject, "middle-driver").map((l) => l.sourceEntityId)).toContain("encoder");
    expect(documentsFor(sampleProject, "rear-driver").map((d) => d.id)).toContain("driver-manual");
  });

  it("reports port usage", () => {
    const usage = portUsage(sampleProject, "front-driver");
    expect(usage.find((p) => p.portId === "can1")?.connectedTo).toEqual(["bus1"]);
    expect(usage.find((p) => p.portId === "enc")?.connectedTo).toEqual(["front-encoders"]);
    expect(usage.find((p) => p.portId === "aux")?.connectedTo).toEqual([]);
  });

  it("aggregates port usage across a product's instances", () => {
    const usage = presetPortUsage(sampleProject, "driver");
    expect(usage.find((p) => p.portId === "enc")?.connectedTo.sort()).toEqual(["front-encoders", "middle-encoders", "rear-encoders"]);
  });
});
