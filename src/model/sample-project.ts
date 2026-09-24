import type { CanFrame, Project, DevicePreset, DeviceInstance, DeviceService, Connection, IoDirection, IoKind, IoModule, IoSignal, ProtoMessage, ServiceEndpoint, WireBundle } from "./types";
import { sampleNotes } from "./sample-notes";

// A fictional demo rover: a core of shared electronics and three identical drive modules.
// Ports are logical labels only; no physical pin assignments.

const presets: Record<string, DevicePreset> = {
  modem: {
    id: "modem",
    name: "Telemetry modem",
    model: "TM-4",
    manufacturer: "Example Devices",
    category: "controller",
    role: "Gateway",
    summary: "LTE modem, 2 CAN ports",
    accent: "#15803d",
    ports: [
      { id: "eth1", name: "ETH 1", kind: "ethernet", count: 1, direction: "bidirectional", variant: "100BASE-TX" },
      { id: "can1", name: "CAN 1", kind: "can", count: 1, direction: "bidirectional", variant: "Classic" },
      { id: "can2", name: "CAN 2", kind: "can", count: 1, direction: "bidirectional", variant: "FD" },
    ],
  },
  computer: {
    id: "computer",
    name: "Main computer",
    model: "MC-8",
    manufacturer: "Example Devices",
    category: "controller",
    role: "Compute",
    summary: "Navigation and perception",
    accent: "#6d28d9",
    ports: [
      { id: "eth1", name: "ETH 1", kind: "ethernet", count: 1, direction: "bidirectional", variant: "1000BASE-T" },
      { id: "can1", name: "CAN 1", kind: "can", count: 1, direction: "bidirectional", variant: "Classic" },
      { id: "gmsl", name: "CAM 1-6", kind: "gmsl", count: 6, direction: "in", variant: "GMSL 2" },
    ],
  },
  power: {
    id: "power",
    name: "Power controller",
    model: "PC-12",
    manufacturer: "Example Devices",
    category: "controller",
    role: "I/O controller",
    summary: "12 switched outputs",
    accent: "#b91c1c",
    ports: [
      { id: "eth1", name: "ETH 1", kind: "ethernet", count: 1, direction: "bidirectional", variant: "100BASE-TX" },
      { id: "can1", name: "CAN 1", kind: "can", count: 1, direction: "bidirectional", variant: "Classic" },
      { id: "out", name: "OUT 1-12", kind: "digital-out", count: 12, direction: "out" },
    ],
  },
  driver: {
    id: "driver",
    name: "Motor driver",
    model: "MD-200",
    manufacturer: "Example Motion",
    category: "controller",
    role: "Drive controller",
    summary: "Dual-channel motor driver, 1 CAN port",
    accent: "#dc2626",
    ports: [
      { id: "can1", name: "CAN 1", kind: "can", count: 1, direction: "bidirectional", variant: "Classic" },
      { id: "enc", name: "ENC 1-4", kind: "digital-in", count: 4, direction: "in", variant: "Pulse" },
      { id: "aux", name: "AUX 1-2", kind: "digital-in", count: 2, direction: "in" },
    ],
  },
  encoder: {
    id: "encoder",
    name: "Wheel encoder",
    model: "WE-1",
    manufacturer: "Example Motion",
    category: "sensor",
    role: "Speed sensor",
    summary: "Pulse output to the motor driver",
    accent: "#15803d",
    ports: [{ id: "pulse", name: "Pulse OUT", kind: "pulse", count: 1, direction: "out", variant: "Pulse" }],
  },
  camera: {
    id: "camera",
    name: "Stereo camera",
    model: "SC-1",
    manufacturer: "Example Vision",
    category: "camera",
    role: "Camera",
    summary: "GMSL 2 to the main computer",
    accent: "#ea580c",
    ports: [{ id: "gmsl", name: "GMSL", kind: "gmsl", count: 1, direction: "out", variant: "GMSL 2" }],
  },
  light: {
    id: "light",
    name: "Work light",
    model: "WL-10",
    manufacturer: "Example Lighting",
    category: "actuator",
    role: "Light",
    summary: "12 VDC LED, switched by the power controller",
    accent: "#475569",
    ports: [{ id: "ctl", name: "Power IN", kind: "digital-out", count: 1, direction: "in" }],
  },
  imu: {
    id: "imu",
    name: "IMU",
    model: "IM-9",
    manufacturer: "Example Devices",
    category: "sensor",
    role: "Motion sensor",
    summary: "Orientation and acceleration over CAN",
    ports: [{ id: "can1", name: "CAN", kind: "can", count: 1, direction: "bidirectional", variant: "Classic" }],
  },
  dock: {
    id: "dock",
    name: "Charging dock",
    model: "CD-2",
    manufacturer: "Example Devices",
    category: "other",
    role: "Dock",
    summary: "Charges the rover, 1 CAN (B2)",
    ports: [{ id: "can1", name: "CAN", kind: "can", count: 1, direction: "bidirectional" }],
  },
};

function device(
  id: string,
  presetId: string,
  name: string,
  zoneId: string | null,
  qty: number,
  x: number,
  y: number,
  props: Record<string, string> = {},
  services: DeviceService[] = [],
): DeviceInstance {
  return { id, presetId, name, zoneId, qty, position: { x, y }, props, services };
}

function service(id: string, name: string, endpoint?: ServiceEndpoint): DeviceService {
  return endpoint ? { id, name, endpoint } : { id, name };
}

const devices: Record<string, DeviceInstance> = {};
const connections: Record<string, Connection> = {};
const bundles: Record<string, WireBundle> = {};

function addDevice(d: DeviceInstance) {
  devices[d.id] = d;
}

function addConnection(c: Connection) {
  connections[c.id] = c;
}

// Core column: cards are 100 to 140px tall, so 180px apart.
addDevice(device("modem", "modem", "Telemetry modem", "core", 1, 40, 60, { ip: "10.0.0.1" }, [
  service("telemetry-uplink", "Telemetry uplink", { transport: "tcp", port: 8883, protocol: "MQTT" }),
  service("can-bridge", "CAN bridge"),
]));
addDevice(device("computer", "computer", "Main computer", "core", 1, 40, 240, { ip: "10.0.0.10", cameras: "6 across 3 modules" }, [
  service("navigation", "Navigation"),
  service("perception", "Perception"),
  service("drive-planner", "Drive planner"),
  service("web-console", "Web console", { transport: "tcp", port: 443, protocol: "HTTPS" }),
]));
addDevice(device("power", "power", "Power controller", "core", 1, 40, 420, { ip: "10.0.0.20", outputs: "12, 4 per module" }, [
  service("output-control", "Output control"),
  service("power-web-ui", "Web UI", { transport: "tcp", port: 80, protocol: "HTTP" }),
]));
addDevice(device("imu", "imu", "IMU", "core", 1, 40, 600));
addDevice(device("dock", "dock", "Charging dock", "core", 1, 40, 780, { bus: "1 connected CAN bus (B2)" }));

addConnection({ id: "eth-modem-computer", from: { deviceId: "modem", portId: "eth1" }, to: { deviceId: "computer", portId: "eth1" }, lineCount: 1 });
addConnection({ id: "eth-computer-power", from: { deviceId: "computer", portId: "eth1" }, to: { deviceId: "power", portId: "eth1" }, lineCount: 1 });
addConnection({ id: "can-modem-b1", from: { deviceId: "modem", portId: "can1" }, to: { busId: "bus1" }, lineCount: 1 });
addConnection({ id: "can-modem-b2", from: { deviceId: "modem", portId: "can2" }, to: { busId: "bus2" }, lineCount: 1 });
addConnection({ id: "can-computer-b1", from: { deviceId: "computer", portId: "can1" }, to: { busId: "bus1" }, lineCount: 1 });
addConnection({ id: "can-power-b1", from: { deviceId: "power", portId: "can1" }, to: { busId: "bus1" }, lineCount: 1 });
addConnection({ id: "can-imu-b1", from: { deviceId: "imu", portId: "can1" }, to: { busId: "bus1" }, lineCount: 1 });
addConnection({ id: "can-dock-b2", from: { deviceId: "dock", portId: "can1" }, to: { busId: "bus2" }, lineCount: 1 });

// Three drive modules, same layout each. Cards sit 280px apart inside 220px-tall zones.
const modules = ["front", "middle", "rear"];
const MODULE_X = 620;
const MODULE_STEP = 320;
// Light wires join a trunk to the right of the modules, which runs under all three and
// comes back up to the power controller between the core column and the buses.
const LIGHT_TRUNK_X = 1780;
const LIGHT_UNDER_Y = 940;
const POWER_APPROACH_X = 340;
const LIGHT_PORT_OFFSET_Y = 40;
const POWER_OUT_Y = 496;
modules.forEach((module, i) => {
  const label = module[0].toUpperCase() + module.slice(1);
  const y = 60 + i * MODULE_STEP;
  const x = MODULE_X;
  addDevice(device(`${module}-cameras`, "camera", `${label} cameras`, module, 2, x, y));
  addDevice(device(`${module}-driver`, "driver", `${label} motor driver`, module, 1, x + 280, y, { canAddress: `0x1${i + 1}` }, [
    service(`${module}-speed-loop`, "Speed loop"),
    service(`${module}-bootloader`, "CAN bootloader"),
  ]));
  addDevice(device(`${module}-encoders`, "encoder", `${label} encoders`, module, 4, x + 560, y));
  addDevice(device(`${module}-lights`, "light", `${label} lights`, module, 4, x + 840, y));

  addConnection({ id: `${module}-gmsl`, from: { deviceId: `${module}-cameras`, portId: "gmsl" }, to: { deviceId: "computer", portId: "gmsl" }, lineCount: 2, label: "GMSL 2" });
  addConnection({ id: `${module}-can`, from: { deviceId: `${module}-driver`, portId: "can1" }, to: { busId: "bus1" }, lineCount: 1 });
  addConnection({ id: `${module}-pulse`, from: { deviceId: `${module}-encoders`, portId: "pulse" }, to: { deviceId: `${module}-driver`, portId: "enc" }, lineCount: 4 });
  addConnection({ id: `${module}-light`, from: { deviceId: `${module}-lights`, portId: "ctl" }, to: { deviceId: "power", portId: "out" }, lineCount: 4, bundleId: "light-trunk" });
});

bundles["light-trunk"] = {
  id: "light-trunk",
  label: "Light power",
  members: modules.map((module) => `${module}-light`),
  points: [
    { x: LIGHT_TRUNK_X, y: 60 + LIGHT_PORT_OFFSET_Y },
    { x: LIGHT_TRUNK_X, y: LIGHT_UNDER_Y },
    { x: POWER_APPROACH_X, y: LIGHT_UNDER_Y },
    { x: POWER_APPROACH_X, y: POWER_OUT_Y },
  ],
  joins: Object.fromEntries(
    modules.map((module, i) => [`${module}-light`, { x: LIGHT_TRUNK_X, y: 60 + i * MODULE_STEP + LIGHT_PORT_OFFSET_Y }]),
  ),
};

// Heartbeat has no bus yet, so the CAN tab shows a frame that still needs a network.
const MOTION = "Motion";
const POWER = "Power";
const STATUS = "Status";
const DRIVE_CAN = ["bus1"];
const frameRows: [string, number, number, string, string, string, string[]][] = [
  ["DriveCommand", 0x100, 0x102, "computer", "driver", MOTION, DRIVE_CAN],
  ["DriveStatus", 0x110, 0x112, "driver", "computer", MOTION, DRIVE_CAN],
  ["DriverWakeup", 0x000, 0x000, "power", "driver", POWER, DRIVE_CAN],
  ["LightCommand", 0x120, 0x120, "computer", "power", POWER, DRIVE_CAN],
  ["PowerStatus", 0x130, 0x131, "power", "computer", POWER, DRIVE_CAN],
  ["ImuData", 0x140, 0x142, "imu", "computer", STATUS, DRIVE_CAN],
  ["Heartbeat", 0x700, 0x700, "modem", "computer", STATUS, []],
];
export const sampleFrames: Record<string, CanFrame> = Object.fromEntries(
  frameRows.map(([name, startId, endId, senderId, receiverId, group, busIds]) => {
    const id = `frame-${name.toLowerCase()}`;
    return [id, { id, name, startId, endId, senderId, receiverIds: [receiverId], busIds, group }];
  }),
);

const ROVER_SCHEMA = { schemaFile: "rover.proto", package: "rover.v1", version: "v1" };
const sampleMessages: Record<string, ProtoMessage> = {
  "msg-pose-estimate": {
    id: "msg-pose-estimate",
    name: "PoseEstimate",
    ...ROVER_SCHEMA,
    fields: [
      { tag: 1, name: "timestamp_ns", type: "uint64" },
      { tag: 2, name: "x", type: "double" },
      { tag: 3, name: "y", type: "double" },
      { tag: 4, name: "heading", type: "float" },
    ],
    sender: { deviceId: "computer", serviceId: "navigation" },
    receivers: [{ deviceId: "modem", serviceId: "telemetry-uplink" }],
    transport: "MQTT :8883",
  },
  "msg-drive-goal": {
    id: "msg-drive-goal",
    name: "DriveGoal",
    ...ROVER_SCHEMA,
    fields: [
      { tag: 1, name: "goal_id", type: "string" },
      { tag: 2, name: "x", type: "double" },
      { tag: 3, name: "y", type: "double" },
      { tag: 4, name: "max_speed", type: "float" },
    ],
    sender: { deviceId: "modem", serviceId: "telemetry-uplink" },
    receivers: [{ deviceId: "computer", serviceId: "drive-planner" }],
    transport: "MQTT :8883",
  },
};

// The power controller's I/O. A few mappings are left incomplete so Mapping review has work.
const sampleIoModules: Record<string, IoModule> = {
  "io-local": { id: "io-local", deviceId: "power", name: "IO-1", description: "Local I/O" },
  "io-analog": { id: "io-analog", deviceId: "power", name: "AI-4", description: "Analog expansion" },
};

type SignalRow = [string, string, string, IoKind, IoDirection, string, Partial<IoSignal>?];
const signalRows: SignalRow[] = [
  ["io-local", "BatteryVoltage", "AnalogInput01", "ai", "input", "Cyclic#5"],
  ["io-local", "EStopPressed", "DigitalInput01", "di", "input", "Cyclic#1", { pin: "X3.1" }],
  ["io-local", "DockContact", "DigitalInput02", "di", "input", "Cyclic#5", { fieldDeviceId: "dock", pin: "X3.2" }],
  ["io-local", "FrontLights", "DigitalOutput01", "do", "output", "Cyclic#4", { fieldDeviceId: "front-lights", pin: "X2.1" }],
  ["io-local", "MiddleLights", "DigitalOutput02", "do", "output", "Cyclic#4", { fieldDeviceId: "middle-lights", pin: "X2.2" }],
  ["io-local", "RearLights", "DigitalOutput03", "do", "output", "Cyclic#4", { fieldDeviceId: "rear-lights" }],
  [
    "io-local",
    "CoolingFan",
    "PWMOutput05",
    "pwm",
    "output",
    "Cyclic#1",
    {
      variable: "gIo.Outputs.CoolingFan.Output_INT32767",
      settings: [
        { role: "Period", channel: "PWMPeriod05", direction: "output", variable: "gIo.Outputs.CoolingFan.Period_us", task: "Cyclic#5" },
        { role: "Feedback", channel: "Current05", direction: "input", variable: "gIo.Outputs.CoolingFan.Current_mA", task: "Cyclic#5" },
      ],
    },
  ],
  ["io-local", "ModuleOk", "ModuleOk", "other", "input", "Cyclic#6", { variable: "gIo.Inputs.Internal.ModuleOk" }],
  ["io-analog", "MotorTemperature[0]", "AnalogInput01", "ai", "input", "Cyclic#5", { fieldDeviceId: "front-driver", pin: "X1.1", range: "-40 to 150 C" }],
  ["io-analog", "MotorTemperature[1]", "AnalogInput02", "ai", "input", "Cyclic#5", { fieldDeviceId: "middle-driver", pin: "X1.2", range: "-40 to 150 C" }],
  ["io-analog", "MotorTemperature[2]", "AnalogInput03", "ai", "input", "Cyclic#5", { fieldDeviceId: "rear-driver" }],
];
const sampleIoSignals: Record<string, IoSignal> = Object.fromEntries(
  signalRows.map(([moduleId, name, channel, kind, direction, task, extra]) => {
    const id = `signal-${moduleId}-${channel.toLowerCase()}`;
    const variable = `gIo.${direction === "input" ? "Inputs" : "Outputs"}.${name}`;
    return [id, { id, moduleId, name, channel, kind, direction, task, variable, settings: [], ...extra }];
  }),
);

export const sampleProject: Project = {
  id: "demo-rover",
  name: "Demo Rover",
  description: "A fictional rover. Three drive modules, one main computer, two CAN networks.",
  presets,
  devices,
  connections,
  bundles,
  buses: {
    bus1: { id: "bus1", name: "Drive CAN", tag: "B1", color: "#713bc4", variant: "Classical CAN", kind: "can", rate: "500 kbit/s", position: { x: 440, y: 40 }, width: 0 },
    bus2: { id: "bus2", name: "Service CAN", tag: "B2", color: "#007f91", variant: "CAN FD", kind: "can", rate: "Rate TBD", position: { x: 520, y: 40 }, width: 0 },
  },
  zones: {
    core: { id: "core", name: "Core", position: { x: 20, y: 20 }, size: { width: 280, height: 880 } },
    front: { id: "front", name: "Front module", position: { x: 600, y: 20 }, size: { width: 1120, height: 220 } },
    middle: { id: "middle", name: "Middle module", position: { x: 600, y: 340 }, size: { width: 1120, height: 220 } },
    rear: { id: "rear", name: "Rear module", position: { x: 600, y: 660 }, size: { width: 1120, height: 220 } },
  },
  freeWires: {},
  images: {},
  frames: sampleFrames,
  messages: sampleMessages,
  sketches: {},
  ioModules: sampleIoModules,
  ioSignals: sampleIoSignals,
  netInterfaces: {},
  netMappings: {},
  routes: {},
  documents: {
    "driver-manual": { id: "driver-manual", title: "MD-200 manual", kind: "pdf", scope: "preset", presetId: "driver", url: "https://example.com/docs/md-200-manual.pdf" },
    "encoder-wiring": { id: "encoder-wiring", title: "Encoder wiring notes", kind: "note", scope: "preset", presetId: "driver" },
    "can-setup": { id: "can-setup", title: "CAN network setup", kind: "guide", scope: "shared" },
    "camera-product": { id: "camera-product", title: "SC-1 product page", kind: "guide", scope: "preset", presetId: "camera", url: "https://example.com/products/sc-1" },
    "power-io": { id: "power-io", title: "Power controller output map", kind: "note", scope: "preset", presetId: "power" },
    "rover-overview": { id: "rover-overview", title: "Rover system overview", kind: "guide", scope: "shared", url: "https://example.com/rover/overview" },
  },
  docLinks: [
    { documentId: "driver-manual", entityId: "driver" },
    { documentId: "encoder-wiring", entityId: "driver" },
    { documentId: "can-setup", entityId: "driver" },
    { documentId: "can-setup", entityId: "bus1" },
    { documentId: "camera-product", entityId: "camera" },
    { documentId: "power-io", entityId: "power" },
    { documentId: "rover-overview", entityId: "modem" },
    { documentId: "rover-overview", entityId: "computer" },
    { documentId: "rover-overview", entityId: "power" },
    { documentId: "rover-overview", entityId: "dock" },
  ],
  notes: {
    ...sampleNotes,
    "encoder-wiring": {
      entityId: "encoder-wiring",
      content: "Encoder inputs on the [[Motor driver]]. Keep channel order the same on every module.",
    },
  },
};
