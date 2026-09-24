import { describe, expect, it } from "vitest";
import { allServices, endLabel, routeDevices, routeMessages, routeStatus, serviceRoutes } from "./routes";
import { sampleProject } from "./sample-project";

describe("routes", () => {
  it("rates a route by what is known about it, proposed first", () => {
    expect(routeStatus(sampleProject.routes["route-telemetry"])).toBe("defined");
    expect(routeStatus(sampleProject.routes["route-power-ui"])).toBe("proposed");
    expect(routeStatus(sampleProject.routes["route-can-feed"])).toBe("incomplete");
    expect(routeStatus({ id: "r", name: "No protocol", from: { deviceId: "a" }, to: { deviceId: "b" }, protocol: " " })).toBe("incomplete");
  });

  it("labels an end with its service when it names one", () => {
    const route = sampleProject.routes["route-telemetry"];
    expect(endLabel(sampleProject, route.from)).toBe("Main computer");
    expect(endLabel(sampleProject, route.to)).toBe("Telemetry modem / Telemetry uplink");
    expect(endLabel(sampleProject, { deviceId: "gone" })).toBeUndefined();
  });

  it("finds what a route carries and which routes touch a service", () => {
    expect(routeMessages(sampleProject, "route-telemetry").map((m) => m.name)).toEqual(["DriveGoal", "PoseEstimate"]);
    expect(serviceRoutes(sampleProject, "power-web-ui").map((r) => r.id)).toEqual(["route-power-ui"]);
    expect(routeDevices(sampleProject)).toEqual(["modem", "computer", "power"]);
  });

  it("lists every service in device order", () => {
    const services = allServices(sampleProject);
    expect(services[0]).toMatchObject({ device: { id: "modem" }, service: { id: "telemetry-uplink" } });
    expect(services.length).toBe(Object.values(sampleProject.devices).reduce((n, d) => n + (d.services?.length ?? 0), 0));
  });
});
