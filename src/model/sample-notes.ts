import type { Note } from "./types";

// Notes for the fictional demo rover. Keyed by preset id: documentation belongs to the
// product, not to each placed copy.

function note(entityId: string, content: string): Note {
  return { entityId, content };
}

export const sampleNotes: Record<string, Note> = {
  modem: note("modem", `## Overview

LTE modem that links the rover to the operator station. It also bridges the two CAN networks for remote diagnostics.

## Connections

- Ethernet to the [[Main computer]].
- On [[Drive CAN]] and [[Service CAN]].

## Open items

- [ ] Choose the data plan for field tests
- [ ] Decide whether the modem logs CAN traffic
`),
  computer: note("computer", `## Overview

Runs navigation, perception and the drive planner. Receives six camera streams and sends drive commands to each [[Motor driver]].

## Connections

- Ethernet to the [[Telemetry modem]] and the [[Power controller]].
- On [[Drive CAN]] at 500 kbit/s.
- Six GMSL 2 inputs, two per drive module.

## Open items

- [ ] Confirm the camera input order
- [ ] Measure boot time from power on
`),
  power: note("power", `## Overview

Switches the rover's 12 V loads. Four outputs per drive module drive the [[Work light]] strings; the rest are spare.

## Connections

- Ethernet to the [[Main computer]].
- On [[Drive CAN]]. Sends the wake-up frame to every [[Motor driver]].

## Open items

- [ ] Set the current limit per output
- [ ] Label the spare outputs
`),
  driver: note("driver", `## Overview

One driver per drive module, two motor channels each. Reads four [[Wheel encoder]] inputs and reports speed and current on [[Drive CAN]].

## Commissioning

- Each driver needs a unique CAN address (0x11, 0x12, 0x13).
- Drivers stay idle until they receive the wake-up frame.

## Open items

- [ ] Confirm the CAN address switch settings
- [ ] Tune the speed loop on the rear module
`),
  encoder: note("encoder", `## Overview

Quadrature wheel encoder. Four per drive module, wired to the [[Motor driver]] encoder inputs.

## Open items

- [ ] Check the pulse count per revolution
`),
  camera: note("camera", `## Overview

Stereo camera over GMSL 2. Two per drive module, all six into the [[Main computer]].

## Open items

- [ ] Calibrate the front pair
`),
  light: note("light", `## Overview

12 VDC LED work light. Four per drive module, switched by the [[Power controller]] through the light trunk.
`),
  imu: note("imu", `## Overview

Reports orientation and acceleration on [[Drive CAN]] at 100 Hz.

## Open items

- [ ] Choose the mounting position
`),
  dock: note("dock", `## Overview

Charges the rover and talks to it over [[Service CAN]] while docked.
`),
  bus1: note("bus1", `## Drive CAN

Classical CAN at 500 kbit/s. Carries drive commands, driver status, power control and IMU data. Terminated at the [[Main computer]] and the rear [[Motor driver]].
`),
  bus2: note("bus2", `## Service CAN

CAN FD for diagnostics and charging. Only the [[Telemetry modem]] and the [[Charging dock]] are on it. Rate still to be chosen.
`),
  "can-setup": note("can-setup", `## CAN network setup

1. Set each [[Motor driver]] to its module address.
2. Check termination: 120 ohm at each end of [[Drive CAN]].
3. Power up and confirm every node sends its heartbeat.
`),
  "power-io": note("power-io", `## Output map

| Outputs | Load |
| --- | --- |
| 1-4 | Front lights |
| 5-8 | Middle lights |
| 9-12 | Rear lights |
`),
};
