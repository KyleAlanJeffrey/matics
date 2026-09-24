export type PortKind =
  | "ethernet"
  | "can"
  | "gmsl"
  | "pulse"
  | "digital-in"
  | "digital-out"
  | "valve";

export type PortDirection = "in" | "out" | "bidirectional";

export interface PortTemplate {
  id: string;
  name: string;
  kind: PortKind;
  count: number;
  direction: PortDirection;
  // Protocol variant shown as a text badge, e.g. "Classic", "100BASE-TX", "GMSL 2".
  variant?: string;
}

export type DeviceCategory =
  | "controller"
  | "sensor"
  | "camera"
  | "actuator"
  | "vehicle"
  | "other";

export interface DevicePreset {
  id: string;
  name: string;
  model: string;
  manufacturer: string;
  category: DeviceCategory;
  summary: string;
  // Short role on the overview card ("Gateway", "Compute"). Falls back to the category.
  role?: string;
  ports: PortTemplate[];
  // "assets/<file>" inside the project folder, an http URL, or (only in transit through
  // JSON exports and the browser build) a data URL.
  imageUrl?: string;
  // Category dot color in the inspector. Falls back to CATEGORY_ACCENT.
  accent?: string;
  // Manufacturer product page.
  productUrl?: string;
}

export interface Position {
  x: number;
  y: number;
}

export interface DeviceInstance {
  id: string;
  presetId: string;
  name: string;
  zoneId: string | null;
  qty: number;
  position: Position;
  props: Record<string, string>;
  services?: DeviceService[];
  card?: CardDisplay;
}

// How this copy draws on the schematic. Absent fields are the defaults (overview layout,
// large picture in the detailed layout, only the IP address shown).
export interface CardDisplay {
  layout?: CardLayout;
  picture?: CardPicture;
  // Property keys drawn on the card, in place of the default of just "ip".
  props?: string[];
  services?: CardServices;
}

// "first" shows CARD_SERVICE_ROWS rows and a count of the rest.
export type CardServices = "first" | "all";

// Overview puts identity and services first and moves ports to tabs on the card edges;
// detailed lists every port inside the card, for pin-level work.
export type CardLayout = "overview" | "detailed";

export const DEFAULT_CARD_PROPS = ["ip"];
export type CardPicture = "large" | "small" | "none";

// Software declared on a placed device (a web UI, a CAN bridge). Documentation, not live
// state: nothing here claims the process is running. Most services have no network port.
export interface DeviceService {
  id: string;
  name: string;
  description?: string;
  endpoint?: ServiceEndpoint;
}

export interface ServiceEndpoint {
  transport: "tcp" | "udp";
  port: number;
  // Application protocol label shown beside the port, such as HTTP.
  protocol?: string;
}

// A shared network. Color and tag are the bus's identity: wires to it take its color and
// its tag is repeated wherever the bus appears, so two CAN networks read apart.
export interface Bus {
  id: string;
  name: string;
  kind: PortKind;
  rate: string;
  // Top of the bar. The bar grows downward to cover every tap and at least `length`.
  position: Position;
  width: number;
  // Minimum bar length in flow pixels, so a bus with no taps still has a body to drop on.
  length?: number;
  // Short identifier such as "B1".
  tag?: string;
  // Wire color. Falls back to the family color in PORT_COLORS.
  color?: string;
  // Protocol variant such as "Classical CAN" or "CAN FD"; empty means not confirmed.
  variant?: string;
  // Draw the tag beside every tap on the bar, not just at the top.
  repeatLabels?: boolean;
}

export function busColor(bus: Bus): string {
  return bus.color ?? PORT_COLORS[bus.kind];
}

// Variants offered for a family. Anything else can still be typed in.
export const VARIANTS_BY_KIND: Partial<Record<PortKind, string[]>> = {
  can: ["Classical CAN", "CAN FD"],
  ethernet: ["100BASE-TX", "1000BASE-T"],
  gmsl: ["GMSL 2", "GMSL 3"],
};

// Palette for bus colors (Matics connection colors); the first entries match the family colors.
export const BUS_COLORS: { name: string; value: string }[] = [
  { name: "Purple", value: "#713bc4" },
  { name: "Teal", value: "#007f91" },
  { name: "Blue", value: "#245dd8" },
  { name: "Orange", value: "#d96a12" },
  { name: "Green", value: "#267343" },
  { name: "Pink", value: "#c2327a" },
  { name: "Amber", value: "#b7791f" },
  { name: "Slate", value: "#53616e" },
];

export interface Zone {
  id: string;
  name: string;
  position: Position;
  size: { width: number; height: number };
}

// A picture placed on the schematic: a photo of the machine, a mounting sketch, a logo.
export interface DiagramImage {
  id: string;
  // Same forms as DevicePreset.imageUrl: an "assets/<file>" path, a URL or a data URL.
  src: string;
  // Original file name, shown in the inspector.
  name?: string;
  position: Position;
  size: { width: number; height: number };
}

export type PortRef = { deviceId: string; portId: string };
export type BusRef = { busId: string };
export type Endpoint = PortRef | BusRef;

export function isBusRef(endpoint: Endpoint): endpoint is BusRef {
  return "busId" in endpoint;
}

// Manual routing. `points` are the corners between the two handle stubs, in flow
// coordinates; the wire is orthogonalized around them. Without points the wire takes
// a step route whose middle segment is shifted by `centerOffset`.
export interface WireRoute {
  // Corners of the wire, or of the entry tail when the wire is bundled.
  points?: Position[];
  // Corners of the exit tail (bundle end to target). Bundled wires only.
  exitPoints?: Position[];
  centerOffset?: number;
  // Where the wire taps a bus, as an absolute flow y. Defaults to the source card's middle.
  tapY?: number;
}

// A wire that is not attached to ports: an annotation drawn with the wire tool.
export interface FreeWire {
  id: string;
  kind: PortKind;
  points: Position[];
  lineCount: number;
  label?: string;
}

export interface Connection {
  id: string;
  from: PortRef;
  to: Endpoint;
  lineCount: number;
  label?: string;
  route?: WireRoute;
  // Wires in a bundle share one trunk between the two tails (see WireBundle).
  bundleId?: string;
}

// Several wires drawn as one thick trunk in transit. Each member keeps its own tail from
// its source port to where it joins the trunk (a `joins` point, or the trunk's start end)
// and from the exit end to its target. The exit end is the trunk end nearer the members'
// shared target. A bundle can itself run into a parent trunk, so harnesses form a tree.
export interface WireBundle {
  id: string;
  label?: string;
  // Orthogonal trunk polyline in flow coordinates, at least two points.
  points: Position[];
  members: string[];
  // Where a member's tail meets the trunk, when not at the start end. On the polyline.
  joins?: Record<string, Position>;
  // This trunk's exit continues into `bundleId` at `point` (on the parent's trunk).
  parent?: { bundleId: string; point: Position };
}

export type DocumentKind = "pdf" | "note" | "guide";
export type DocumentScope = "preset" | "instance" | "shared";

export interface Document {
  id: string;
  title: string;
  kind: DocumentKind;
  scope: DocumentScope;
  presetId?: string;
  // External link (datasheet PDF, product page, wiki page).
  url?: string;
  // File inside the project folder, e.g. "assets/datasheet-1a2b3c4d.pdf".
  file?: string;
}

export interface DocLink {
  documentId: string;
  entityId: string;
}

// Obsidian-style markdown; see model/markdown.ts.
export type NoteContent = string;

// Documentation lives on the product (preset), not on each placed device.
// `entityId` is a preset id, a bus id or a document id.
export interface Note {
  entityId: string;
  content: NoteContent;
  updatedAt?: string;
}

// A CAN frame definition: which identifiers a sender puts on the bus and who consumes
// them. Parties are device ids, or a preset id when every copy of a product takes part.
export interface CanFrame {
  id: string;
  name: string;
  // Inclusive identifier range; a single frame has startId === endId.
  startId: number;
  endId: number;
  senderId: string;
  receiverIds: string[];
  // Networks the frame travels on; a gateway can forward it onto several. Empty = unset.
  busIds: string[];
  // Row group in the frames table, e.g. "Perception -> Controller".
  group?: string;
  notes?: string;
}

// A Protobuf message definition, usually imported from a .proto file.
export interface ProtoField {
  tag: number;
  name: string;
  // Scalar or message type as written in the schema, e.g. "uint32" or "map<string, int32>".
  type: string;
  repeated?: boolean;
}

// A device, optionally narrowed to one of the services running on it.
export interface MessageEndpoint {
  deviceId: string;
  serviceId?: string;
}

export interface ProtoMessage {
  id: string;
  name: string;
  // The .proto file it came from, its package, and the version taken from the package, e.g. "v1".
  schemaFile?: string;
  package?: string;
  version?: string;
  fields: ProtoField[];
  sender?: MessageEndpoint;
  receivers: MessageEndpoint[];
  // How it travels, in words ("ZMQ PUB :5555", "WebSocket"). Unset until known.
  transport?: string;
}

// Physical I/O: named signals bound to the hardware channels of a controller's modules.
// Channels are known only through their bindings, so a module lists no capacity of its own.
export type IoKind = "ai" | "ao" | "di" | "do" | "pwm" | "encoder" | "other";
export type IoDirection = "input" | "output";

// A block of channels on a controller: its local I/O or an expansion module.
export interface IoModule {
  id: string;
  // The placed device the module belongs to.
  deviceId: string;
  name: string;
  description?: string;
}

// A binding that configures a channel rather than wiring to it, such as a PWM output's
// period or its current feedback.
export interface IoSetting {
  role: string;
  channel: string;
  direction: IoDirection;
  variable?: string;
  task?: string;
}

export interface IoSignal {
  id: string;
  moduleId: string;
  name: string;
  // The channel as the controller names it, e.g. "AnalogInput01". Not a connector pin.
  channel: string;
  // "other" is a binding to the module itself, such as its status, not a physical channel.
  kind: IoKind;
  direction: IoDirection;
  // The PLC variable bound to the channel, e.g. "gIo.Inputs.BatteryVoltage".
  variable?: string;
  // Task class as the controller names it, e.g. "Cyclic#5". Not a duration.
  task?: string;
  settings: IoSetting[];
  // The placed device on the field side of the channel.
  fieldDeviceId?: string;
  pin?: string;
  range?: string;
}

// A controller's network interface that carries symbolic data mappings, e.g. IF2 / Modbus.
export interface NetInterface {
  id: string;
  deviceId: string;
  // The hardware module the interface is on, as the controller names it.
  module?: string;
  name: string;
  protocol: string;
  // The device on the other end, when known.
  peerDeviceId?: string;
  transport?: string;
  unitId?: string;
}

// One PLC variable exchanged over a NetInterface under a symbolic name.
export interface NetMapping {
  id: string;
  interfaceId: string;
  name: string;
  symbol: string;
  direction: IoDirection;
  variable?: string;
  task?: string;
  register?: string;
}

// Who talks to whom and how, independent of what the payload looks like: an MQTT link
// between two services, a proxy route. Messages name the route they travel on.
export interface Route {
  id: string;
  name: string;
  from?: MessageEndpoint;
  to?: MessageEndpoint;
  protocol: string;
  path?: string;
  // Planned but not yet built; shown apart from the defined routes.
  proposed?: boolean;
}

// A freeform Excalidraw drawing. Elements and files are Excalidraw's own JSON, kept as-is.
export interface Sketch {
  id: string;
  name: string;
  elements: unknown[];
  files?: Record<string, unknown>;
  // Devices this sketch is about, shown as links beside it.
  deviceIds: string[];
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  // Subtitle shown under the name on the canvas, e.g. "Three drive modules, one main computer".
  description?: string;
  presets: Record<string, DevicePreset>;
  devices: Record<string, DeviceInstance>;
  buses: Record<string, Bus>;
  zones: Record<string, Zone>;
  connections: Record<string, Connection>;
  bundles: Record<string, WireBundle>;
  freeWires: Record<string, FreeWire>;
  images: Record<string, DiagramImage>;
  documents: Record<string, Document>;
  docLinks: DocLink[];
  notes: Record<string, Note>;
  frames: Record<string, CanFrame>;
  messages: Record<string, ProtoMessage>;
  sketches: Record<string, Sketch>;
  ioModules: Record<string, IoModule>;
  ioSignals: Record<string, IoSignal>;
  netInterfaces: Record<string, NetInterface>;
  netMappings: Record<string, NetMapping>;
  routes: Record<string, Route>;
}

export type EntityKind = "device" | "preset" | "bus" | "zone" | "document";

export const PORT_COLORS: Record<PortKind, string> = {
  ethernet: "#245dd8",
  can: "#713bc4",
  gmsl: "#d96a12",
  pulse: "#267343",
  "digital-in": "#267343",
  "digital-out": "#7a8086",
  valve: "#53616e",
};

export const PORT_KIND_LABELS: Record<PortKind, string> = {
  ethernet: "Ethernet",
  can: "CAN",
  gmsl: "GMSL",
  pulse: "Pulse",
  "digital-in": "Digital input",
  "digital-out": "Digital output",
  valve: "Valve I/O",
};

export const CATEGORY_ACCENT: Record<DeviceCategory, string> = {
  controller: "#1d4ed8",
  sensor: "#15803d",
  camera: "#c2410c",
  actuator: "#475569",
  vehicle: "#0f766e",
  other: "#64748b",
};

export const CATEGORY_LABELS: Record<DeviceCategory, string> = {
  controller: "Controllers",
  sensor: "Sensors",
  camera: "Cameras",
  actuator: "Actuators",
  vehicle: "Vehicles",
  other: "Other",
};

export const CATEGORY_ROLE: Record<DeviceCategory, string> = {
  controller: "Controller",
  sensor: "Sensor",
  camera: "Camera",
  actuator: "Actuator",
  vehicle: "Vehicle",
  other: "Device",
};

// Tab labels on overview cards, where a port has only a few pixels.
export const PORT_KIND_SHORT: Record<PortKind, string> = {
  ethernet: "ETH",
  can: "CAN",
  gmsl: "GMSL",
  pulse: "PLS",
  "digital-in": "DI",
  "digital-out": "DO",
  valve: "VLV",
};

export const PORT_KINDS: PortKind[] = ["ethernet", "can", "gmsl", "pulse", "digital-in", "digital-out", "valve"];

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: string;
  // Project folder on disk (desktop app only).
  dir?: string;
}

// What the project home remembers on this computer, never inside the projects themselves.
// Keyed by project folder in the desktop app and by project id in the browser build.
export interface WorkspacePrefs {
  starred: string[];
  archived: string[];
  // When each project was last opened, as ISO strings.
  opened: Record<string, string>;
}
