import type { ApiDefinition, Project, Route } from "./types";

// Offered in the style and method fields. Anything else can still be typed in.
export const API_STYLES = ["REST", "gRPC", "WebSocket", "GraphQL"];
export const API_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "rpc", "stream"];

export function apiMeta(api: ApiDefinition): string | undefined {
  return [api.specFile, api.version].filter(Boolean).join(" · ") || undefined;
}

export function apiTouches(api: ApiDefinition, deviceId: string) {
  return api.server?.deviceId === deviceId;
}

// Devices that answer at least one API, in the project's device order.
export function apiDevices(project: Project): string[] {
  const ids = new Set(Object.values(project.apis).map((api) => api.server?.deviceId));
  return Object.keys(project.devices).filter((id) => ids.has(id));
}

export function serviceApis(project: Project, serviceId: string): ApiDefinition[] {
  return Object.values(project.apis)
    .filter((api) => api.server?.serviceId === serviceId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Connections to or from the service that answers the API.
export function apiRoutes(project: Project, api: ApiDefinition): Route[] {
  const serviceId = api.server?.serviceId;
  if (!serviceId) return [];
  return Object.values(project.routes)
    .filter((r) => r.from?.serviceId === serviceId || r.to?.serviceId === serviceId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Devices at the far end of those connections: the API's callers, as far as they are known.
export function apiClients(project: Project, api: ApiDefinition): string[] {
  const serviceId = api.server?.serviceId;
  const ids = new Set(apiRoutes(project, api).map((route) => (route.to?.serviceId === serviceId ? route.from : route.to)?.deviceId));
  ids.delete(api.server?.deviceId);
  return Object.keys(project.devices).filter((id) => ids.has(id));
}
