import { describe, expect, it } from "vitest";
import { sampleProject } from "@/model/sample-project";
import { parsePortHandle, portHandleId, projectToFlow } from "./to-flow";

describe("projectToFlow", () => {
  it("round-trips port handle ids", () => {
    expect(parsePortHandle(portHandleId("enc", "left"))).toEqual({ portId: "enc", side: "left" });
    expect(parsePortHandle("legacy")).toEqual({ portId: "legacy", side: "right" });
  });

  it("wires leave the card on the side facing the target", () => {
    const { edges } = projectToFlow(sampleProject, null);
    const pulse = edges.find((e) => e.id === "front-pulse")!;
    // encoders sit to the right of the driver, so the wire leaves the encoders on the left
    expect(pulse.sourceHandle).toBe(portHandleId("pulse", "left"));
    expect(pulse.targetHandle).toBe(portHandleId("enc", "right"));
  });

  it("bus connections target a tap handle named after the connection", () => {
    const { edges, nodes } = projectToFlow(sampleProject, null);
    const can = edges.find((e) => e.id === "front-can")!;
    expect(can.target).toBe("bus1");
    expect(can.targetHandle).toBe("front-can");
    const bus = nodes.find((n) => n.id === "bus1")!;
    expect(bus.type).toBe("bus");
    if (bus.type === "bus") expect(bus.data.taps.some((t) => t.connectionId === "front-can")).toBe(true);
  });

  it("marks selection", () => {
    const { nodes } = projectToFlow(sampleProject, "front-driver");
    expect(nodes.find((n) => n.id === "front-driver")?.selected).toBe(true);
    expect(nodes.find((n) => n.id === "middle-driver")?.selected).toBe(false);
  });
});
