import { describe, expect, it } from "vitest";
import { sampleProject } from "@/model/sample-project";
import { busColor, isBusRef } from "@/model/types";
import { thumbnailOf } from "./thumbnail";

describe("thumbnailOf", () => {
  it("draws nothing for a project with no schematic", () => {
    const empty = { ...structuredClone(sampleProject), devices: {}, buses: {}, zones: {}, images: {}, connections: {}, freeWires: {} };
    expect(thumbnailOf(empty)).toBeNull();
  });

  it("fits every card and bus inside the box", () => {
    const thumbnail = thumbnailOf(structuredClone(sampleProject))!;
    const { box } = thumbnail;
    expect(thumbnail.devices).toHaveLength(Object.keys(sampleProject.devices).length);
    for (const card of thumbnail.devices) {
      expect(card.x).toBeGreaterThan(box.x);
      expect(card.x + card.width).toBeLessThan(box.x + box.width);
      expect(card.y).toBeGreaterThan(box.y);
      expect(card.y + card.height).toBeLessThan(box.y + box.height);
    }
    for (const bus of thumbnail.buses) {
      expect(bus.top).toBeGreaterThan(box.y);
      expect(bus.bottom).toBeLessThan(box.y + box.height);
    }
  });

  it("ends a bus wire on the bus", () => {
    const project = structuredClone(sampleProject);
    const connection = Object.values(project.connections).find((c) => isBusRef(c.to) && !c.route?.points?.length)!;
    project.connections = { [connection.id]: connection };
    const bus = project.buses[(connection.to as { busId: string }).busId];
    const [wire] = thumbnailOf(project)!.wires;
    expect(wire.points.at(-1)!.x).toBe(bus.position.x + bus.width / 2);
    expect(wire.color).toBe(busColor(bus));
  });
});
