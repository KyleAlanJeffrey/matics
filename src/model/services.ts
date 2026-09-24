import type { DeviceInstance, DeviceService, Project, ServiceEndpoint } from "./types";

export interface ServiceRef {
  device: DeviceInstance;
  service: DeviceService;
}

export function findService(project: Project, serviceId: string): ServiceRef | null {
  for (const device of Object.values(project.devices)) {
    const service = device.services?.find((s) => s.id === serviceId);
    if (service) return { device, service };
  }
  return null;
}

export function isService(project: Project, id: string) {
  return findService(project, id) !== null;
}

// Every service on the placed copies of a product, in schematic order of the copies.
export function servicesOfPreset(project: Project, presetId: string): ServiceRef[] {
  return Object.values(project.devices)
    .filter((device) => device.presetId === presetId)
    .flatMap((device) => (device.services ?? []).map((service) => ({ device, service })));
}

export function formatEndpoint(endpoint: ServiceEndpoint | undefined): string | null {
  return endpoint ? `${endpoint.transport.toUpperCase()} :${endpoint.port}` : null;
}

export function isValidPort(port: number) {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}
