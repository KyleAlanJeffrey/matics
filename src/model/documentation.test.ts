import { describe, expect, it } from "vitest";
import { sampleProject } from "./sample-project";
import { connectedProducts, documentCount, documentOwners, framesForProduct, isOwner, ownerDocuments, searchDocumentation, unfiledDocuments } from "./documentation";
import type { Project } from "./types";

describe("documentation workspace", () => {
  it("treats products and networks as owners, not placed copies", () => {
    expect(isOwner(sampleProject, "driver")).toBe(true);
    expect(isOwner(sampleProject, "bus1")).toBe(true);
    expect(isOwner(sampleProject, "front-driver")).toBe(false);
  });

  it("lists the owner's own note first, then linked documents", () => {
    const docs = ownerDocuments(sampleProject, "driver");
    expect(docs[0]).toMatchObject({ id: "driver", own: true, title: "Device notes" });
    expect(docs.map((d) => d.id)).toContain("driver-manual");
    expect(ownerDocuments(sampleProject, "bus1")[0].title).toBe("Network notes");
  });

  it("files documents linked to a placed copy under its product", () => {
    const project = structuredClone(sampleProject);
    project.documents["front-wiring"] = { id: "front-wiring", title: "Front module wiring", kind: "note", scope: "instance" };
    project.docLinks.push({ documentId: "front-wiring", entityId: "front-driver" });
    expect(ownerDocuments(project, "driver").map((d) => d.id)).toContain("front-wiring");
  });

  it("reports every owner of a shared document", () => {
    const owners = documentOwners(sampleProject, "rover-overview");
    expect(owners.length).toBeGreaterThan(1);
    expect(owners).toContain("modem");
    expect(ownerDocuments(sampleProject, "modem").find((d) => d.id === "rover-overview")?.scope).toMatch(/^Shared/);
  });

  it("counts the own note only once it has text", () => {
    const empty: Project = { ...sampleProject, notes: { ...sampleProject.notes, modem: { entityId: "modem", content: "  " } } };
    expect(documentCount(empty, "modem")).toBe(documentCount(sampleProject, "modem") - 1);
  });

  it("finds documents nothing links to", () => {
    const project: Project = { ...sampleProject, documents: { ...sampleProject.documents, loose: { id: "loose", title: "Loose", kind: "note", scope: "shared" } } };
    expect(unfiledDocuments(project).map((d) => d.id)).toEqual(["loose"]);
  });

  it("lists connected products with how they connect, including shared buses", () => {
    const connected = connectedProducts(sampleProject, "computer");
    const modem = connected.find((c) => c.presetId === "modem");
    expect(modem?.via).toContain("Ethernet");
    expect(connected.some((c) => c.presetId === "computer")).toBe(false);
  });

  it("splits a product's frames into sent and received", () => {
    const { tx, rx } = framesForProduct(sampleProject, "computer");
    expect(tx.map((f) => f.name)).toContain("DriveCommand");
    expect(rx.map((f) => f.name)).toContain("Heartbeat");
  });

  it("searches names, note text and frame IDs", () => {
    expect(searchDocumentation(sampleProject, "")).toEqual([]);
    expect(searchDocumentation(sampleProject, "mc-8").some((h) => h.kind === "Device" && h.owner === "computer")).toBe(true);
    const frame = searchDocumentation(sampleProject, "0x101").find((h) => h.kind === "Frame");
    expect(frame?.label).toBe("DriveCommand");
    expect(frame?.owner).toBe("computer");
  });
});
