import { describe, expect, it } from "vitest";
import { apiClients, apiDevices, apiMeta, apiRoutes, serviceApis } from "./apis";
import { communicationRows } from "./messages";
import { sampleProject } from "./sample-project";

describe("APIs", () => {
  it("finds the connections to an API's service and the devices calling it", () => {
    const power = sampleProject.apis["api-power"];
    expect(apiRoutes(sampleProject, power).map((r) => r.id)).toEqual(["route-power-ui"]);
    expect(apiClients(sampleProject, power)).toEqual(["computer"]);
    expect(apiClients(sampleProject, sampleProject.apis["api-navigation"])).toEqual([]);
    expect(apiRoutes(sampleProject, { ...power, server: { deviceId: "power" } })).toEqual([]);
  });

  it("counts a caller once and never the server itself", () => {
    const project = structuredClone(sampleProject);
    project.routes["route-local"] = { id: "route-local", name: "Local", from: { deviceId: "power", serviceId: "output-control" }, to: { deviceId: "power", serviceId: "power-web-ui" }, protocol: "HTTP" };
    project.routes["route-again"] = { id: "route-again", name: "Again", from: { deviceId: "power", serviceId: "power-web-ui" }, to: { deviceId: "computer" }, protocol: "HTTP" };
    expect(apiClients(project, project.apis["api-power"])).toEqual(["computer"]);
  });

  it("lists the APIs a service answers and the devices serving any", () => {
    expect(serviceApis(sampleProject, "navigation").map((a) => a.name)).toEqual(["Navigation"]);
    expect(serviceApis(sampleProject, "telemetry-uplink")).toEqual([]);
    expect(apiDevices(sampleProject)).toEqual(["computer", "power"]);
    expect(apiMeta(sampleProject.apis["api-navigation"])).toBe("rover.proto · v1");
  });

  it("lists APIs in the combined index, from their callers to their server", () => {
    const row = communicationRows(sampleProject).find((r) => r.id === "api-power");
    expect(row).toMatchObject({ kind: "api", name: "Power controller API", from: "Main computer", to: ["Power controller"], transport: "REST TCP :80" });
    expect(row?.deviceIds).toEqual(["computer", "power"]);
    expect(communicationRows(sampleProject).find((r) => r.id === "api-navigation")).toMatchObject({ from: undefined, to: ["Main computer"], transport: "gRPC" });
  });
});
