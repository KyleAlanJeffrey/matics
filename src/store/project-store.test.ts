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
