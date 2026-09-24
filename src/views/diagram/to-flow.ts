import type { Edge, Node } from "@xyflow/react";
import type { Bus, Connection, DeviceInstance, DiagramImage, Project, Zone } from "@/model/types";
import { busColor, isBusRef, PORT_COLORS } from "@/model/types";
import { portKindOf } from "@/model/derived";
import { bundleExit, memberEntry } from "./bundle-geometry";

export const BUS_TAP_HANDLE = "tap";
export const DEVICE_CARD_WIDTH = 240;
const DEVICE_CARD_HEIGHT_ESTIMATE = 200;
const BUS_PADDING = 40;
export const DEFAULT_BUS_LENGTH = 320;
export const MIN_BUS_LENGTH = 64;

export type Side = "left" | "right";

export function portHandleId(portId: string, side: Side) {
  return `${portId}:${side}`;
}

export function parsePortHandle(handleId: string): { portId: string; side: Side } {
  const index = handleId.lastIndexOf(":");
  if (index === -1) return { portId: handleId, side: "right" };
  return { portId: handleId.slice(0, index), side: handleId.slice(index + 1) as Side };
}

export interface BusTap {
  connectionId: string;
  y: number;
  side: Side;
}

export type DeviceNodeData = { device: DeviceInstance; connectedHandles: string[] };
export type BusNodeData = { bus: Bus; taps: BusTap[]; height: number };
export type ZoneNodeData = { zone: Zone };
export type ImageNodeData = { image: DiagramImage };
export type WireEdgeData = { connection: Connection; color: string };

export type DeviceNodeType = Node<DeviceNodeData, "device">;
export type BusNodeType = Node<BusNodeData, "bus">;
export type ZoneNodeType = Node<ZoneNodeData, "zone">;
export type ImageNodeType = Node<ImageNodeData, "image">;
export type WireEdgeType = Edge<WireEdgeData, "wire">;

export type DiagramNode = DeviceNodeType | BusNodeType | ZoneNodeType | ImageNodeType;

function deviceCenterX(device: DeviceInstance) {
  return device.position.x + DEVICE_CARD_WIDTH / 2;
}

// Which side of a device card a wire should leave from, given where it is heading.
function sideToward(device: DeviceInstance, targetX: number): Side {
  return targetX < deviceCenterX(device) ? "left" : "right";
}

export function busGeometry(project: Project, bus: Bus): { top: number; height: number; taps: BusTap[] } {
  const tapYs: { connectionId: string; absoluteY: number; side: Side }[] = [];
  for (const conn of Object.values(project.connections)) {
    if (!isBusRef(conn.to) || conn.to.busId !== bus.id) continue;
    const device = project.devices[conn.from.deviceId];
    if (!device) continue;
    tapYs.push({
      connectionId: conn.id,
      absoluteY: conn.route?.tapY ?? device.position.y + DEVICE_CARD_HEIGHT_ESTIMATE / 2,
      side: deviceCenterX(device) < bus.position.x ? "left" : "right",
    });
  }
  // The bar starts where the bus sits, or higher if a tap needs it, and runs down far
  // enough for every tap and for the length the user dragged it to.
  const length = bus.length ?? DEFAULT_BUS_LENGTH;
  if (tapYs.length === 0) return { top: bus.position.y, height: length, taps: [] };

  const minY = Math.min(bus.position.y, ...tapYs.map((t) => t.absoluteY - BUS_PADDING));
  const maxY = Math.max(minY + length, ...tapYs.map((t) => t.absoluteY + BUS_PADDING));
  return {
    top: minY,
    height: maxY - minY,
    taps: tapYs.map((t) => ({ connectionId: t.connectionId, y: t.absoluteY - minY, side: t.side })),
  };
}

export function projectToFlow(project: Project, selectedId: string | null): { nodes: DiagramNode[]; edges: WireEdgeType[] } {
  const connectedHandles = new Map<string, Set<string>>();
  const markConnected = (deviceId: string, handleId: string) => {
    if (!connectedHandles.has(deviceId)) connectedHandles.set(deviceId, new Set());
    connectedHandles.get(deviceId)!.add(handleId);
  };

  const edges: WireEdgeType[] = [];
  for (const connection of Object.values(project.connections)) {
    const fromDevice = project.devices[connection.from.deviceId];
    if (!fromDevice) continue;

    // A routed wire leaves toward its first corner and arrives from its last one, so it
    // can go around cards instead of straight through them.
    const bundle = connection.bundleId ? project.bundles[connection.bundleId] : undefined;
    const corners = connection.route?.points ?? [];
    let firstCorner = corners[0];
    let lastCorner = (connection.route?.exitPoints ?? []).at(-1) ?? corners.at(-1);
    if (bundle && bundle.points.length > 1) {
      firstCorner = corners[0] ?? memberEntry(project, bundle, connection.id);
      lastCorner = (connection.route?.exitPoints ?? []).at(-1) ?? bundleExit(project, bundle);
    }
    let target: string;
    let targetHandle: string;
    let targetX: number;
    if (isBusRef(connection.to)) {
      const bus = project.buses[connection.to.busId];
      if (!bus) continue;
      target = bus.id;
      targetHandle = connection.id;
      targetX = bus.position.x;
    } else {
      const toDevice = project.devices[connection.to.deviceId];
      if (!toDevice) continue;
      target = toDevice.id;
      const toSide = sideToward(toDevice, lastCorner?.x ?? deviceCenterX(fromDevice));
      targetHandle = portHandleId(connection.to.portId, toSide);
      targetX = deviceCenterX(toDevice);
      markConnected(toDevice.id, targetHandle);
    }

    const fromSide = sideToward(fromDevice, firstCorner?.x ?? targetX);
    const sourceHandle = portHandleId(connection.from.portId, fromSide);
    markConnected(fromDevice.id, sourceHandle);

    const kind = portKindOf(project, connection.from.deviceId, connection.from.portId) ?? "digital-out";
    const color = isBusRef(connection.to) ? busColor(project.buses[connection.to.busId]) : PORT_COLORS[kind];
    edges.push({
      id: connection.id,
      type: "wire",
      source: fromDevice.id,
      sourceHandle,
      target,
      targetHandle,
      data: { connection, color },
      selected: selectedId === connection.id,
    });
  }

  const zoneNodes: ZoneNodeType[] = Object.values(project.zones).map((zone) => ({
    id: zone.id,
    type: "zone",
    position: zone.position,
    data: { zone },
    style: { width: zone.size.width, height: zone.size.height },
    zIndex: -1,
    selected: selectedId === zone.id,
  }));

  // Pictures sit on zones and under the wires, so wiring drawn over a photo stays visible.
  const imageNodes: ImageNodeType[] = Object.values(project.images).map((image) => ({
    id: image.id,
    type: "image",
    position: image.position,
    data: { image },
    style: { width: image.size.width, height: image.size.height },
    zIndex: -1,
    selected: selectedId === image.id,
  }));

  const deviceNodes: DeviceNodeType[] = Object.values(project.devices).map((device) => ({
    id: device.id,
    type: "device",
    position: device.position,
    data: { device, connectedHandles: Array.from(connectedHandles.get(device.id) ?? []) },
    selected: selectedId === device.id,
  }));

  const busNodes: BusNodeType[] = Object.values(project.buses).map((bus) => {
    const geometry = busGeometry(project, bus);
    return {
      id: bus.id,
      type: "bus",
      position: { x: bus.position.x, y: geometry.top },
      data: { bus, taps: geometry.taps, height: geometry.height },
      selected: selectedId === bus.id,
    };
  });

  return { nodes: [...zoneNodes, ...imageNodes, ...busNodes, ...deviceNodes], edges };
}
