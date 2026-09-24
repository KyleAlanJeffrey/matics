import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleProject } from "@/model/sample-project";
import { busGeometry } from "@/views/diagram/to-flow";
import { useProjectStore } from "./project-store";
import { storage } from "./storage";

describe("undo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useProjectStore.setState({ project: structuredClone(sampleProject) });
    useProjectStore.temporal.getState().clear();
  });
  afterEach(() => vi.useRealTimers());

  it("skips state changes that leave the project alone", () => {
    const before = Object.keys(useProjectStore.getState().project.frames).length;
    // Edits within the coalescing window merge into one step; step past it.
    vi.advanceTimersByTime(1000);
    useProjectStore.getState().addFrame({ name: "Test" });
    vi.advanceTimersByTime(1000);
    // What autosave does when it finishes.
    useProjectStore.setState({ saveError: null });
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);

    useProjectStore.temporal.getState().undo();
    expect(Object.keys(useProjectStore.getState().project.frames)).toHaveLength(before);
  });
});

describe("attachWireToBundle", () => {
  beforeEach(() => {
    useProjectStore.setState({ project: structuredClone(sampleProject) });
  });

  it("carries one line per copy of the source device", () => {
    const store = useProjectStore.getState();
    const trunk = store.project.bundles["light-trunk"];
    // Front encoders are placed four times.
    const id = store.attachWireToBundle("light-trunk", { deviceId: "front-encoders", portId: "pulse" }, trunk.points[1]);
    const connection = useProjectStore.getState().project.connections[id!];
    expect(connection.lineCount).toBe(useProjectStore.getState().project.devices["front-encoders"].qty);
    expect(connection.lineCount).toBeGreaterThan(1);
  });
});

describe("removeConnection", () => {
  beforeEach(() => {
    useProjectStore.setState({ project: structuredClone(sampleProject) });
  });

  it("keeps the bus and its drawn extent when the last wire goes", () => {
    const store = useProjectStore.getState();
    store.moveBus("bus2", { x: 520, y: 400 });
    store.removeConnection("can-dock-b2");
    // The modem sits above the bus position, so the bar starts above it.
    const drawn = busGeometry(useProjectStore.getState().project, useProjectStore.getState().project.buses.bus2);
    expect(drawn.taps).toHaveLength(1);
    expect(drawn.top).toBeLessThan(400);

    store.removeConnection("can-modem-b2");

    const bus = useProjectStore.getState().project.buses.bus2;
    expect(bus).toBeDefined();
    expect(bus.position.y).toBe(drawn.top);
    expect(bus.length).toBe(drawn.height);
    expect(busGeometry(useProjectStore.getState().project, bus)).toMatchObject({ top: drawn.top, height: drawn.height, taps: [] });
  });

  it("leaves a bus alone while it still has taps", () => {
    const store = useProjectStore.getState();
    const before = { ...useProjectStore.getState().project.buses.bus1 };
    store.removeConnection("can-modem-b1");
    expect(useProjectStore.getState().project.buses.bus1).toMatchObject(before);
  });
});

describe("messages and sketches", () => {
  beforeEach(() => {
    useProjectStore.setState({ project: structuredClone(sampleProject) });
  });

  it("keeps same-named messages from different packages apart on import", () => {
    const status = (pkg: string) => ({ name: "Status", schemaFile: "common.proto", package: pkg, fields: [] });
    const store = useProjectStore.getState();
    expect(store.importMessages([status("drive.v1")])).toEqual({ added: 1, updated: 0 });
    expect(store.importMessages([status("camera.v1")])).toEqual({ added: 1, updated: 0 });
    expect(store.importMessages([status("drive.v1")])).toEqual({ added: 0, updated: 1 });
  });

  it("keeps a sketch's link to a removed device so undoing the removal restores it", () => {
    const store = useProjectStore.getState();
    const sketchId = store.addSketch("Wiring");
    store.updateSketch(sketchId, { deviceIds: ["modem"] });
    store.removeDevice("modem");
    expect(useProjectStore.getState().project.sketches[sketchId].deviceIds).toEqual(["modem"]);
  });
});

describe("routes", () => {
  beforeEach(() => {
    useProjectStore.setState({ project: structuredClone(sampleProject) });
  });

  it("unlinks messages from a removed route and keeps the messages", () => {
    useProjectStore.getState().removeRoute("route-telemetry");
    const project = useProjectStore.getState().project;
    expect(project.routes["route-telemetry"]).toBeUndefined();
    expect(project.messages["msg-pose-estimate"].routeId).toBeUndefined();
    expect(project.messages["msg-pose-estimate"].sender).toEqual({ deviceId: "computer", serviceId: "navigation" });
  });

  it("drops a removed service from route ends and a removed device's whole end", () => {
    const store = useProjectStore.getState();
    store.removeService("power", "power-web-ui");
    expect(useProjectStore.getState().project.routes["route-power-ui"].to).toEqual({ deviceId: "power" });
    store.removeDevice("power");
    expect(useProjectStore.getState().project.routes["route-power-ui"].to).toBeUndefined();
  });
});

describe("I/O", () => {
  beforeEach(() => {
    useProjectStore.setState({ project: structuredClone(sampleProject) });
  });

  it("updates a re-imported channel's binding and keeps what was documented", () => {
    const store = useProjectStore.getState();
    store.updateIoSignal("signal-io-local-digitaloutput01", { name: "Front light bar" });
    const result = store.importIoMap("power", [
      {
        name: "IO-1",
        signals: [
          { name: "FrontLights", channel: "DigitalOutput01", kind: "do", direction: "output", variable: "gIo.Outputs.FrontLights", task: "Cyclic#2", settings: [] },
          { name: "HornOn", channel: "DigitalOutput04", kind: "do", direction: "output", variable: "gIo.Outputs.HornOn", settings: [] },
        ],
      },
      { name: "DI-16", signals: [] },
    ], []);
    expect(result).toMatchObject({ modules: 1, added: 1, updated: 1 });
    const project = useProjectStore.getState().project;
    expect(project.ioSignals["signal-io-local-digitaloutput01"]).toMatchObject({ name: "Front light bar", task: "Cyclic#2", fieldDeviceId: "front-lights", pin: "X2.1" });
    expect(Object.values(project.ioSignals).find((s) => s.name === "HornOn")?.moduleId).toBe("io-local");
  });

  it("re-imports interface mappings by symbol and keeps their names and registers", () => {
    const store = useProjectStore.getState();
    const heartbeat = { name: "Heartbeat", symbol: "heartbeat", direction: "output" as const, variable: "gNet.Heartbeat", task: "Cyclic#1" };
    const first = store.importIoMap("power", [], [{ module: "CPU", name: "IF2", mappings: [heartbeat] }]);
    expect(first).toMatchObject({ interfaces: 1, mappingsAdded: 1, mappingsUpdated: 0 });
    const project = useProjectStore.getState().project;
    const netInterface = Object.values(project.netInterfaces).find((i) => i.module === "CPU")!;
    const mapping = Object.values(project.netMappings).find((m) => m.interfaceId === netInterface.id)!;
    store.updateNetMapping(mapping.id, { name: "Heartbeat to HMI", register: "40001" });

    const again = store.importIoMap("power", [], [{ module: "CPU", name: "IF2", mappings: [{ ...heartbeat, task: "Cyclic#2" }] }]);
    expect(again).toMatchObject({ interfaces: 0, mappingsAdded: 0, mappingsUpdated: 1 });
    expect(useProjectStore.getState().project.netMappings[mapping.id]).toMatchObject({ name: "Heartbeat to HMI", register: "40001", task: "Cyclic#2" });
  });

  it("removes an interface with its mappings and their notes", () => {
    const store = useProjectStore.getState();
    const interfaceId = store.addNetInterface({ deviceId: "power", name: "IF1", protocol: "Modbus" });
    const mappingId = store.addNetMapping({ interfaceId, name: "Level", symbol: "level", direction: "input" });
    store.setNote(mappingId, "Read every second.");
    store.removeNetInterface(interfaceId);
    const project = useProjectStore.getState().project;
    expect(project.netInterfaces[interfaceId]).toBeUndefined();
    expect(project.netMappings[mappingId]).toBeUndefined();
    expect(project.notes[mappingId]).toBeUndefined();
  });

  it("drops a removed controller's modules and unwires signals from a removed field device", () => {
    const store = useProjectStore.getState();
    store.removeDevice("front-lights");
    expect(useProjectStore.getState().project.ioSignals["signal-io-local-digitaloutput01"].fieldDeviceId).toBeUndefined();
    store.removeDevice("power");
    const project = useProjectStore.getState().project;
    expect(Object.keys(project.ioModules)).toEqual([]);
    expect(Object.keys(project.ioSignals)).toEqual([]);
  });
});

describe("workspace prefs", () => {
  afterEach(() => vi.restoreAllMocks());

  it("takes back a star that could not be saved", async () => {
    useProjectStore.setState({ prefs: { starred: [], archived: [], opened: {} } });
    vi.spyOn(storage, "savePrefs").mockRejectedValue(new Error("disk full"));
    await expect(useProjectStore.getState().setStarred("some-project", true)).rejects.toThrow("disk full");
    expect(useProjectStore.getState().prefs.starred).toEqual([]);
  });

  it("keeps a later change when an earlier one fails", async () => {
    useProjectStore.setState({ prefs: { starred: [], archived: [], opened: {} } });
    vi.spyOn(storage, "savePrefs").mockRejectedValueOnce(new Error("disk full")).mockResolvedValue();
    const failed = useProjectStore.getState().setStarred("first", true);
    const saved = useProjectStore.getState().setArchived("second", true);
    await expect(failed).rejects.toThrow("disk full");
    await saved;
    expect(useProjectStore.getState().prefs).toMatchObject({ starred: [], archived: ["second"] });
  });
});
