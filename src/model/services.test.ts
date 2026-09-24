import { beforeEach, describe, expect, it } from "vitest";
import { sampleProject } from "./sample-project";
import { documentOwners, ownerDocuments, ownerKeyFor, searchDocumentation } from "./documentation";
import { findService, formatEndpoint, isValidPort, servicesOfPreset } from "./services";
import { useProjectStore } from "@/store/project-store";
import { collectSelection, pasteSelection } from "@/views/diagram/clipboard";

const store = () => useProjectStore.getState();

describe("device services", () => {
  beforeEach(() => useProjectStore.setState({ project: structuredClone(sampleProject) }));

  it("adds, edits and removes a service on one placed copy", () => {
    const id = store().addService("computer", { name: "Device web UI", endpoint: { transport: "tcp", port: 8100, protocol: "HTTP" } });
    expect(findService(store().project, id)?.device.id).toBe("computer");
    expect(formatEndpoint(findService(store().project, id)?.service.endpoint)).toBe("TCP :8100");

    store().updateService("computer", id, { endpoint: undefined, description: "Local configuration" });
    const service = findService(store().project, id)!.service;
    expect(service).not.toHaveProperty("endpoint");
    expect(service.description).toBe("Local configuration");

    store().removeService("computer", id);
    expect(findService(store().project, id)).toBeNull();
  });

  it("files service notes and documents under the device's product", () => {
    const id = store().addService("front-driver", { name: "Speed reporter" });
    const docId = store().addDocumentLink(id, { title: "Speed reporter setup", kind: "note" });
    const project = store().project;
    expect(ownerKeyFor(project, id)).toBe("driver");
    expect(documentOwners(project, docId)).toEqual(["driver"]);
    expect(ownerDocuments(project, "driver").map((d) => d.id)).toContain(docId);
    expect(servicesOfPreset(project, "driver").map((r) => r.service.id)).toContain(id);
    expect(searchDocumentation(project, "speed reporter").some((h) => h.kind === "Service" && h.doc === id)).toBe(true);
  });

  it("drops a removed service's note and links but keeps the documents", () => {
    const id = store().addService("computer", { name: "CAN bridge" });
    const docId = store().addDocumentLink(id, { title: "CAN bridge setup", kind: "note" });
    store().removeService("computer", id);
    const project = store().project;
    expect(project.docLinks.some((l) => l.entityId === id)).toBe(false);
    expect(project.documents[docId]).toBeDefined();
  });

  it("gives pasted copies their own service ids", () => {
    const id = store().addService("imu", { name: "Localization" });
    const project = structuredClone(store().project);
    const payload = collectSelection(project, ["imu"])!;
    let n = 0;
    const created = pasteSelection(project, payload, { x: 0, y: 40 }, (prefix) => `${prefix}-copy${n++}`);
    const copy = project.devices[created[0]];
    expect(copy.services?.[0].name).toBe("Localization");
    expect(copy.services?.[0].id).not.toBe(id);
  });

  it("accepts only real port numbers", () => {
    expect(isValidPort(8100)).toBe(true);
    expect(isValidPort(0)).toBe(false);
    expect(isValidPort(70000)).toBe(false);
    expect(isValidPort(80.5)).toBe(false);
  });
});
