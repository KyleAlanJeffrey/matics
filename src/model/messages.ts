import { apiClients, apiMeta } from "./apis";
import { formatFrameRange, partyLabel } from "./frames";
import { mappingEnds } from "./net";
import { formatEndpoint } from "./services";
import type { MessageEndpoint, Project, ProtoField, ProtoMessage } from "./types";

export function endpointDevice(project: Project, end: MessageEndpoint | undefined) {
  return end ? project.devices[end.deviceId] : undefined;
}

export function endpointService(project: Project, end: MessageEndpoint | undefined) {
  if (!end?.serviceId) return undefined;
  return project.devices[end.deviceId]?.services?.find((s) => s.id === end.serviceId);
}

export function endpointLabel(project: Project, end: MessageEndpoint | undefined): string | undefined {
  return endpointDevice(project, end)?.name;
}

export function fieldTypeLabel(field: ProtoField) {
  return field.repeated ? `repeated ${field.type}` : field.type;
}

export function messageMeta(message: ProtoMessage): string | undefined {
  return [message.schemaFile, message.version].filter(Boolean).join(" \u00b7 ") || undefined;
}

// A transport to offer when the sender's service already names its port.
export function suggestedTransport(project: Project, message: ProtoMessage): string | undefined {
  const service = endpointService(project, message.sender);
  const endpoint = formatEndpoint(service?.endpoint);
  if (!endpoint) return undefined;
  return [service?.endpoint?.protocol, endpoint].filter(Boolean).join(" ");
}

export function messageTouches(message: ProtoMessage, deviceId: string, direction: "all" | "sent" | "received" = "all") {
  const sends = message.sender?.deviceId === deviceId;
  const receives = message.receivers.some((r) => r.deviceId === deviceId);
  if (direction === "sent") return sends;
  if (direction === "received") return receives;
  return sends || receives;
}

export interface DeviceMessages {
  deviceId: string;
  sent: ProtoMessage[];
  received: ProtoMessage[];
}

// What each device sends and receives, in the project's device order, for devices on at
// least one message. A device receiving through two of its services counts the message once.
export function messagesByDevice(project: Project): DeviceMessages[] {
  const byDevice = new Map<string, DeviceMessages>();
  const entry = (deviceId: string) => {
    if (!byDevice.has(deviceId)) byDevice.set(deviceId, { deviceId, sent: [], received: [] });
    return byDevice.get(deviceId)!;
  };
  for (const message of Object.values(project.messages).sort((a, b) => a.name.localeCompare(b.name))) {
    if (message.sender) entry(message.sender.deviceId).sent.push(message);
    for (const deviceId of new Set(message.receivers.map((r) => r.deviceId))) entry(deviceId).received.push(message);
  }
  return Object.keys(project.devices).flatMap((id) => byDevice.get(id) ?? []);
}

// One row of the combined communications list: a CAN frame definition, a Protobuf message,
// a fieldbus mapping or an API.
export interface CommunicationRow {
  kind: "can" | "protobuf" | "modbus" | "api";
  id: string;
  name: string;
  meta?: string;
  from?: string;
  to: string[];
  transport?: string;
  // Every placed device at either end, for filtering by device.
  deviceIds: string[];
}

// A CAN party is a device, or a product standing for all of its copies.
function partyDeviceIds(project: Project, partyId: string): string[] {
  if (project.devices[partyId]) return [partyId];
  return Object.values(project.devices)
    .filter((d) => d.presetId === partyId)
    .map((d) => d.id);
}

export function communicationRows(project: Project): CommunicationRow[] {
  const frames: CommunicationRow[] = Object.values(project.frames).map((frame) => ({
    kind: "can",
    id: frame.id,
    name: frame.name,
    meta: formatFrameRange(frame),
    from: frame.senderId ? partyLabel(project, frame.senderId) : undefined,
    to: frame.receiverIds.map((id) => partyLabel(project, id)),
    transport:
      frame.busIds
        .map((id) => project.buses[id])
        .filter(Boolean)
        .map((bus) => `CAN ${bus.tag ?? bus.name}`)
        .join(", ") || undefined,
    deviceIds: [frame.senderId, ...frame.receiverIds].filter(Boolean).flatMap((id) => partyDeviceIds(project, id)),
  }));
  const messages: CommunicationRow[] = Object.values(project.messages).map((message) => ({
    kind: "protobuf",
    id: message.id,
    name: message.name,
    meta: messageMeta(message),
    from: endpointLabel(project, message.sender),
    to: message.receivers.map((r) => endpointLabel(project, r)).filter((label): label is string => !!label),
    transport: message.transport,
    deviceIds: [message.sender, ...message.receivers].flatMap((end) => (end && project.devices[end.deviceId] ? [end.deviceId] : [])),
  }));
  const mappings: CommunicationRow[] = Object.values(project.netMappings).flatMap((mapping) => {
    const netInterface = project.netInterfaces[mapping.interfaceId];
    if (!netInterface) return [];
    const ends = mappingEnds(project, netInterface, mapping.direction);
    return [
      {
        kind: "modbus" as const,
        id: mapping.id,
        name: mapping.name,
        meta: mapping.symbol,
        from: ends.from,
        to: ends.to ? [ends.to] : [],
        transport: netInterface.name,
        deviceIds: [netInterface.deviceId, netInterface.peerDeviceId].filter((id): id is string => !!id && !!project.devices[id]),
      },
    ];
  });
  // An API reads from its callers to the service that answers it.
  const apis: CommunicationRow[] = Object.values(project.apis).map((api) => {
    const clients = apiClients(project, api);
    const server = endpointDevice(project, api.server);
    const endpoint = formatEndpoint(endpointService(project, api.server)?.endpoint);
    return {
      kind: "api",
      id: api.id,
      name: api.name,
      meta: apiMeta(api),
      from: clients.length ? clients.map((id) => project.devices[id].name).join(", ") : undefined,
      to: server ? [server.name] : [],
      transport: [api.style, endpoint].filter(Boolean).join(" ") || undefined,
      deviceIds: [...clients, ...(server ? [server.id] : [])],
    };
  });
  return [...frames, ...messages, ...mappings, ...apis];
}
