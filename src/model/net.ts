import type { IoMapFile } from "./io";
import type { IoDirection, NetInterface, NetMapping, Project } from "./types";

export interface ImportedInterface {
  module: string;
  name: string;
  mappings: Omit<NetMapping, "id" | "interfaceId">[];
}

// "pump_speed" reads "Pump speed".
export function symbolName(symbol: string) {
  const words = symbol.replace(/_+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : symbol;
}

// Groups interface bindings by module and interface, in file order.
export function ioMapInterfaces(file: IoMapFile): ImportedInterface[] {
  const interfaces = new Map<string, ImportedInterface>();
  for (const binding of file.interfaceBindings) {
    const key = JSON.stringify([binding.module, binding.interface]);
    if (!interfaces.has(key)) interfaces.set(key, { module: binding.module, name: binding.interface, mappings: [] });
    interfaces.get(key)!.mappings.push({ name: symbolName(binding.symbol), symbol: binding.symbol, direction: binding.direction, variable: binding.variable, task: binding.task });
  }
  return Array.from(interfaces.values());
}

export function interfacesOf(project: Project, deviceId: string): NetInterface[] {
  return Object.values(project.netInterfaces)
    .filter((i) => i.deviceId === deviceId)
    .sort((a, b) => (a.module ?? "").localeCompare(b.module ?? "") || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

// In the order they were added, which for an import is the order of the file.
export function mappingsOf(project: Project, interfaceId: string): NetMapping[] {
  return Object.values(project.netMappings).filter((m) => m.interfaceId === interfaceId);
}

// Controllers with at least one interface, in the project's device order.
export function netControllers(project: Project): string[] {
  const ids = new Set(Object.values(project.netInterfaces).map((i) => i.deviceId));
  return Object.keys(project.devices).filter((id) => ids.has(id));
}

export function interfaceLabel(project: Project, netInterface: NetInterface) {
  const device = project.devices[netInterface.deviceId];
  return device ? `${device.name} / ${netInterface.name}` : netInterface.name;
}

// The two ends of a mapping, in the direction the data travels.
export function mappingEnds(project: Project, netInterface: NetInterface, direction: IoDirection) {
  const controller = project.devices[netInterface.deviceId]?.name;
  const peer = netInterface.peerDeviceId ? project.devices[netInterface.peerDeviceId]?.name : undefined;
  return direction === "output" ? { from: controller, to: peer } : { from: peer, to: controller };
}
