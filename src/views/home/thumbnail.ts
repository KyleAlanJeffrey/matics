import { busColor, isBusRef, PORT_COLORS, type DeviceInstance, type Position, type Project } from "@/model/types";
import { portKindOf } from "@/model/derived";
import { busGeometry, DEVICE_CARD_HEIGHT_ESTIMATE, DEVICE_CARD_WIDTH } from "@/views/diagram/to-flow";
import { orthogonalize } from "@/views/diagram/wire-geometry";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// A schematic reduced to boxes and lines for the project home. Card heights and port rows
// are only known once the diagram is drawn, so cards use the estimated size and wires
// leave from the middle of a card.
export interface Thumbnail {
  box: Rect;
  zones: (Rect & { name: string })[];
  images: Rect[];
  devices: (Rect & { name: string })[];
  buses: { x: number; top: number; bottom: number; color: string }[];
  wires: { points: Position[]; color: string }[];
}

const PADDING = 40;

function middleY(device: DeviceInstance) {
  return device.position.y + DEVICE_CARD_HEIGHT_ESTIMATE / 2;
}

function cardEdge(device: DeviceInstance, towardX: number): Position {
  const left = towardX < device.position.x + DEVICE_CARD_WIDTH / 2;
  return { x: left ? device.position.x : device.position.x + DEVICE_CARD_WIDTH, y: middleY(device) };
}

// Straight across, or across and down with the turn halfway, as the editor draws an
// unrouted wire.
function unrouted(start: Position, end: Position): Position[] {
  if (start.y === end.y) return [start, end];
  const turn = (start.x + end.x) / 2;
  return [start, { x: turn, y: start.y }, { x: turn, y: end.y }, end];
}

function wiresOf(project: Project): Thumbnail["wires"] {
  const wires: Thumbnail["wires"] = [];
  for (const connection of Object.values(project.connections)) {
    const from = project.devices[connection.from.deviceId];
    if (!from) continue;
    const corners = connection.route?.points ?? [];
    let end: Position;
    let color: string;
    if (isBusRef(connection.to)) {
      const bus = project.buses[connection.to.busId];
      if (!bus) continue;
      end = { x: bus.position.x + bus.width / 2, y: connection.route?.tapY ?? middleY(from) };
      color = busColor(bus);
    } else {
      const to = project.devices[connection.to.deviceId];
      if (!to) continue;
      end = cardEdge(to, corners.at(-1)?.x ?? from.position.x + DEVICE_CARD_WIDTH / 2);
      color = PORT_COLORS[portKindOf(project, from.id, connection.from.portId) ?? "digital-out"];
    }
    const start = cardEdge(from, corners[0]?.x ?? end.x);
    const points = corners.length > 0 ? orthogonalize([start, ...corners, end], "h") : unrouted(start, end);
    wires.push({ points, color });
  }
  for (const wire of Object.values(project.freeWires)) {
    if (wire.points.length > 1) wires.push({ points: wire.points, color: PORT_COLORS[wire.kind] });
  }
  return wires;
}

export function thumbnailOf(project: Project): Thumbnail | null {
  const zones = Object.values(project.zones).map((zone) => ({ ...zone.position, ...zone.size, name: zone.name }));
  const images = Object.values(project.images).map((image) => ({ ...image.position, ...image.size }));
  const devices = Object.values(project.devices).map((device) => ({
    ...device.position,
    width: DEVICE_CARD_WIDTH,
    height: DEVICE_CARD_HEIGHT_ESTIMATE,
    name: device.name,
  }));
  const buses = Object.values(project.buses).map((bus) => {
    const { top, height } = busGeometry(project, bus);
    return { x: bus.position.x + bus.width / 2, top, bottom: top + height, color: busColor(bus) };
  });
  const wires = wiresOf(project);

  // A loop rather than Math.min(...), which has an argument limit a big project can reach.
  const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  const include = (x: number, y: number) => {
    bounds.left = Math.min(bounds.left, x);
    bounds.right = Math.max(bounds.right, x);
    bounds.top = Math.min(bounds.top, y);
    bounds.bottom = Math.max(bounds.bottom, y);
  };
  for (const rect of [...zones, ...images, ...devices]) {
    include(rect.x, rect.y);
    include(rect.x + rect.width, rect.y + rect.height);
  }
  for (const bus of buses) {
    include(bus.x, bus.top);
    include(bus.x, bus.bottom);
  }
  for (const wire of wires) {
    for (const point of wire.points) include(point.x, point.y);
  }
  if (bounds.left === Infinity) return null;

  const box = {
    x: bounds.left - PADDING,
    y: bounds.top - PADDING,
    width: bounds.right - bounds.left + 2 * PADDING,
    height: bounds.bottom - bounds.top + 2 * PADDING,
  };
  return { box, zones, images, devices, buses, wires };
}
