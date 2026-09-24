import { endpointDevice, endpointService } from "./messages";
import type { MessageEndpoint, Project, ProtoMessage, Route } from "./types";
import type { ServiceRef } from "./services";

export type RouteStatus = "defined" | "incomplete" | "proposed";

export const ROUTE_STATUS_LABELS: Record<RouteStatus, string> = { defined: "Defined", incomplete: "Incomplete", proposed: "Proposed" };

// Proposed wins: a planned route is expected to be missing details.
export function routeStatus(route: Route): RouteStatus {
  if (route.proposed) return "proposed";
  return route.from && route.to && route.protocol.trim() ? "defined" : "incomplete";
}

// "Main computer / Navigation", or the device alone when any of its services will do.
export function endLabel(project: Project, end: MessageEndpoint | undefined): string | undefined {
  const device = endpointDevice(project, end);
  if (!device) return undefined;
  const service = endpointService(project, end);
  return service ? `${device.name} / ${service.name}` : device.name;
}

export function routeMessages(project: Project, routeId: string): ProtoMessage[] {
  return Object.values(project.messages)
    .filter((m) => m.routeId === routeId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function routeTouches(route: Route, deviceId: string) {
  return route.from?.deviceId === deviceId || route.to?.deviceId === deviceId;
}

export function serviceRoutes(project: Project, serviceId: string): Route[] {
  return Object.values(project.routes).filter((r) => r.from?.serviceId === serviceId || r.to?.serviceId === serviceId);
}

// Devices at either end of a route, in the project's device order.
export function routeDevices(project: Project): string[] {
  const ids = new Set(Object.values(project.routes).flatMap((r) => [r.from?.deviceId, r.to?.deviceId]));
  return Object.keys(project.devices).filter((id) => ids.has(id));
}

// Every service in the project, in the project's device order.
export function allServices(project: Project): ServiceRef[] {
  return Object.values(project.devices).flatMap((device) => (device.services ?? []).map((service) => ({ device, service })));
}
