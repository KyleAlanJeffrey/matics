import { instancesOf } from "./derived";
import { markdownLines, plainText, type LineKind } from "./markdown";
import { formatFrameRange, partyLabel } from "./frames";
import { CATEGORY_LABELS, PORT_KIND_LABELS, isBusRef, type Bus, type PortRef, type Project } from "./types";

// Plain data behind the documentation report, kept apart from its layout so the numbers
// can be tested without a browser.

export interface ReportSummary {
  devices: number;
  products: number;
  networks: number;
  connections: number;
  zones: number;
  frames: number;
}

export interface DeviceRow {
  id: string;
  name: string;
  product: string;
  maker: string;
  category: string;
  zone: string;
  qty: number;
  props: [string, string][];
}

export interface ProductRow {
  id: string;
  name: string;
  maker: string;
  category: string;
  qty: number;
  ports: string;
}

export interface NetworkRow {
  id: string;
  tag: string;
  name: string;
  family: string;
  variant: string;
  rate: string;
  color: string;
  members: string[];
}

export interface ConnectionRow {
  id: string;
  from: string;
  to: string;
  kind: string;
  lines: number;
  label: string;
}

export interface FrameRow {
  id: string;
  ids: string;
  name: string;
  sender: string;
  receivers: string;
  networks: string;
}

export interface DocumentRow {
  id: string;
  title: string;
  kind: string;
  linkedTo: string;
  source: string;
}

export type NoteLine = { kind: "heading" | "paragraph" | "bullet" | "numbered" | "check" | "code"; text: string; depth: number; level?: number; checked?: boolean };

export interface NoteSection {
  entityId: string;
  title: string;
  lines: NoteLine[];
}

export interface ReportData {
  summary: ReportSummary;
  devices: DeviceRow[];
  products: ProductRow[];
  networks: NetworkRow[];
  connections: ConnectionRow[];
  frames: FrameRow[];
  documents: DocumentRow[];
  notes: NoteSection[];
}

const byText = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

function zoneOrder(project: Project) {
  const order = Object.keys(project.zones);
  return (zoneId: string | null) => {
    const index = zoneId ? order.indexOf(zoneId) : -1;
    return index === -1 ? order.length : index;
  };
}

export function portLabel(project: Project, ref: PortRef): string {
  const device = project.devices[ref.deviceId];
  const port = device && project.presets[device.presetId]?.ports.find((p) => p.id === ref.portId);
  return `${device?.name ?? "Missing device"} / ${port?.name ?? ref.portId}`;
}

function busLabel(bus: Bus | undefined) {
  if (!bus) return "Missing network";
  return bus.tag ? `${bus.name} (${bus.tag})` : bus.name;
}

export function buildReport(project: Project): ReportData {
  const rank = zoneOrder(project);

  const devices: DeviceRow[] = Object.values(project.devices)
    .map((device) => {
      const preset = project.presets[device.presetId];
      return {
        id: device.id,
        name: device.name,
        product: preset?.name ?? "Unknown product",
        maker: [preset?.manufacturer, preset?.model].filter(Boolean).join(" "),
        category: preset ? CATEGORY_LABELS[preset.category] : "",
        zone: device.zoneId ? (project.zones[device.zoneId]?.name ?? "") : "",
        qty: device.qty,
        props: Object.entries(device.props).filter(([, value]) => value.trim() !== ""),
        rank: rank(device.zoneId),
      };
    })
    .sort((a, b) => a.rank - b.rank || byText(a.name, b.name))
    .map(({ rank: _rank, ...row }) => row);

  const products: ProductRow[] = Object.values(project.presets)
    .map((preset) => ({
      id: preset.id,
      name: preset.name,
      maker: [preset.manufacturer, preset.model].filter(Boolean).join(" "),
      category: CATEGORY_LABELS[preset.category],
      qty: instancesOf(project, preset.id).reduce((sum, id) => sum + (project.devices[id]?.qty ?? 0), 0),
      ports: preset.ports.map((p) => (p.count > 1 ? `${p.name} x${p.count}` : p.name)).join(", "),
    }))
    .filter((row) => row.qty > 0)
    .sort((a, b) => byText(a.category, b.category) || byText(a.name, b.name));

  const networks: NetworkRow[] = Object.values(project.buses)
    .map((bus) => {
      const members = new Set<string>();
      for (const conn of Object.values(project.connections)) {
        if (isBusRef(conn.to) && conn.to.busId === bus.id) members.add(project.devices[conn.from.deviceId]?.name ?? "Missing device");
      }
      return {
        id: bus.id,
        tag: bus.tag ?? "",
        name: bus.name,
        family: PORT_KIND_LABELS[bus.kind],
        variant: bus.variant ?? "",
        rate: bus.rate,
        color: bus.color ?? "",
        members: Array.from(members).sort(byText),
      };
    })
    .sort((a, b) => byText(a.tag || a.name, b.tag || b.name));

  const connections: ConnectionRow[] = Object.values(project.connections)
    .map((conn) => {
      const device = project.devices[conn.from.deviceId];
      const kind = device && project.presets[device.presetId]?.ports.find((p) => p.id === conn.from.portId)?.kind;
      return {
        id: conn.id,
        from: portLabel(project, conn.from),
        to: isBusRef(conn.to) ? busLabel(project.buses[conn.to.busId]) : portLabel(project, conn.to),
        kind: kind ? PORT_KIND_LABELS[kind] : "",
        lines: conn.lineCount,
        label: conn.label ?? (conn.bundleId ? (project.bundles[conn.bundleId]?.label ?? "") : ""),
      };
    })
    .sort((a, b) => byText(a.from, b.from) || byText(a.to, b.to));

  const frames: FrameRow[] = Object.values(project.frames)
    .sort((a, b) => a.startId - b.startId)
    .map((frame) => ({
      id: frame.id,
      ids: formatFrameRange(frame),
      name: frame.name,
      sender: partyLabel(project, frame.senderId),
      receivers: frame.receiverIds.map((id) => partyLabel(project, id)).join(", "),
      networks: frame.busIds.map((id) => project.buses[id]?.tag || project.buses[id]?.name || "").filter(Boolean).join(", "),
    }));

  const documents: DocumentRow[] = Object.values(project.documents)
    .map((doc) => {
      const linked = project.docLinks
        .filter((link) => link.documentId === doc.id)
        .map((link) => project.presets[link.entityId]?.name ?? project.buses[link.entityId]?.name ?? project.devices[link.entityId]?.name)
        .filter((name): name is string => !!name);
      return {
        id: doc.id,
        title: doc.title,
        kind: doc.kind.toUpperCase(),
        linkedTo: Array.from(new Set(linked)).sort(byText).join(", "),
        source: doc.url ?? doc.file?.slice(doc.file.lastIndexOf("/") + 1) ?? "",
      };
    })
    .sort((a, b) => byText(a.title, b.title));

  // Product and network notes, in the order the products appear in the parts list.
  const noteOwners = [...products.map((p) => p.id), ...networks.map((n) => n.id)];
  const notes: NoteSection[] = noteOwners
    .map((entityId) => ({
      entityId,
      title: project.presets[entityId]?.name ?? project.buses[entityId]?.name ?? entityId,
      lines: noteLines(project.notes[entityId]?.content),
    }))
    .filter((section) => section.lines.length > 0);

  return {
    summary: {
      devices: devices.reduce((sum, d) => sum + d.qty, 0),
      products: products.length,
      networks: networks.length,
      connections: connections.length,
      zones: Object.keys(project.zones).length,
      frames: frames.length,
    },
    devices,
    products,
    networks,
    connections,
    frames,
    documents,
    notes,
  };
}

const LINE_KINDS: Partial<Record<LineKind, NoteLine["kind"]>> = {
  heading: "heading",
  paragraph: "paragraph",
  quote: "paragraph",
  bullet: "bullet",
  numbered: "numbered",
  check: "check",
  code: "code",
};

// Note markdown as printable lines, inline markup removed. Rules and empty lines are
// left out.
export function noteLines(markdown: string | undefined): NoteLine[] {
  const lines: NoteLine[] = [];
  for (const line of markdownLines(markdown ?? "")) {
    const kind = LINE_KINDS[line.kind];
    const text = kind === "code" ? line.text : plainText(line.text);
    if (!kind || !text.trim()) continue;
    lines.push({ kind, text, depth: line.depth, level: line.level, checked: line.checked });
  }
  return lines;
}
