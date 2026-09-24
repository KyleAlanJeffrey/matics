import { describe, expect, it } from "vitest";
import { sampleProject } from "@/model/sample-project";
import { isBusRef } from "@/model/types";
import { collectSelection, pasteSelection } from "./clipboard";

let counter = 0;
const newId = (prefix: string) => `${prefix}-new${counter++}`;

describe("collectSelection", () => {
  it("copies a zone with its devices and only the wires that stay inside", () => {
    const payload = collectSelection(sampleProject, ["front"])!;
    expect(payload.zones.map((z) => z.id)).toEqual(["front"]);
    expect(payload.devices.map((d) => d.id).sort()).toEqual(["front-cameras", "front-driver", "front-encoders", "front-lights"]);
    // GMSL, CAN and light wires leave the module; only the encoder pulse wire is internal.
    expect(payload.connections.map((c) => c.id)).toEqual(["front-pulse"]);
    expect(payload.bundles).toEqual([]);
    expect(payload.presets.map((p) => p.id).sort()).toEqual(["camera", "driver", "encoder", "light"]);
  });

  it("keeps a bus wire when the bus is copied too", () => {
    const payload = collectSelection(sampleProject, ["modem", "bus1"])!;
    expect(payload.connections.map((c) => c.id)).toEqual(["can-modem-b1"]);
  });

  it("returns null for nothing copyable", () => {
    expect(collectSelection(sampleProject, ["eth-modem-computer"])).toBeNull();
  });
});

describe("pasteSelection", () => {
  it("pastes with fresh ids, shifted positions and remapped references", () => {
    const project = structuredClone(sampleProject);
    const payload = collectSelection(sampleProject, ["front"])!;
    const before = Object.keys(project.devices).length;
    const created = pasteSelection(project, payload, { x: 32, y: 32 }, newId);

    expect(created).toHaveLength(5);
    expect(Object.keys(project.devices)).toHaveLength(before + 4);
    const zoneId = created[0];
    const zone = project.zones[zoneId];
    expect(zone.position).toEqual({ x: sampleProject.zones.front.position.x + 32, y: sampleProject.zones.front.position.y + 32 });
    const pasted = created.slice(1).map((id) => project.devices[id]);
    for (const device of pasted) expect(device.zoneId).toBe(zoneId);

    const wire = Object.values(project.connections).find((c) => c.id.startsWith("conn-new"))!;
    expect(project.devices[wire.from.deviceId].presetId).toBe("encoder");
    expect(!isBusRef(wire.to) && project.devices[wire.to.deviceId].presetId).toBe("driver");
    expect(wire.from.deviceId).not.toBe("front-encoders");
  });

  it("drops a bundle reference when the bundle was not copied and joins the zone it lands in", () => {
    const project = structuredClone(sampleProject);
    const payload = collectSelection(sampleProject, ["front-lights", "power"])!;
    expect(payload.connections.map((c) => c.id)).toEqual(["front-light"]);
    // Only one member of the light trunk is copied, so the bundle comes along trimmed.
    expect(payload.bundles[0].members).toEqual(["front-light"]);

    const created = pasteSelection(project, payload, { x: 0, y: 40 }, newId);
    const lights = project.devices[created.find((id) => project.devices[id]?.presetId === "light")!];
    expect(lights.zoneId).toBe("front");
    const wire = Object.values(project.connections).find((c) => c.from.deviceId === lights.id)!;
    expect(wire.bundleId).toBeDefined();
    expect(project.bundles[wire.bundleId!].members).toEqual([wire.id]);
  });

  it("adds missing presets when pasting into another project", () => {
    const empty = structuredClone(sampleProject);
    empty.presets = {};
    empty.devices = {};
    empty.connections = {};
    empty.zones = {};
    const payload = collectSelection(sampleProject, ["imu"])!;
    pasteSelection(empty, payload, { x: 0, y: 0 }, newId);
    expect(empty.presets.imu).toBeDefined();
    expect(Object.values(empty.devices)[0].zoneId).toBeNull();
  });
});
