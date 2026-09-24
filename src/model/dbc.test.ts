import { describe, expect, it } from "vitest";
import { dbcNodes, matchNode, parseDbc } from "./dbc";

const SAMPLE = `VERSION ""

NS_ :
	CM_
	BA_DEF_

BS_:

BU_: Computer Power Driver


BO_ 3221225472 VECTOR__INDEPENDENT_SIG_MSG: 0 Vector__XXX
 SG_ Spare : 0|8@1+ (1,0) [0|0] "" Vector__XXX

BO_ 256 DriveCommand: 8 Computer
 SG_ Mode : 0|8@1+ (1,0) [0|255] "" Power
 SG_ Speed : 8|16@1+ (0.1,0) [0|6553.5] "km/h" Power,Driver

BO_ 512 SchemaVersion: 2 Power
 SG_ Major : 0|8@1+ (1,0) [0|255] "" Computer

BO_ 2147484113 DriveStatus1: 8 Driver
 SG_ Current : 0|16@1+ (0.01,0) [0|655.35] "A" Vector__XXX

BO_ 0 DriverWakeup: 1 Vector__XXX

BO_TX_BU_ 0 : Power,Computer;

CM_ BO_ 256 "Drive setpoints,
one per channel";
CM_ SG_ 256 Mode "Drive mode";
`;

describe("parseDbc", () => {
  const file = parseDbc(SAMPLE);

  it("lists nodes and skips Vector placeholders", () => {
    expect(file.nodes).toEqual(["Computer", "Power", "Driver"]);
    expect(file.messages.map((m) => m.name)).toEqual(["DriveCommand", "SchemaVersion", "DriveStatus1", "DriverWakeup"]);
  });

  it("collects transmitters and distinct receivers", () => {
    const command = file.messages[0];
    expect(command.id).toBe(0x100);
    expect(command.transmitters).toEqual(["Computer"]);
    expect(command.receivers).toEqual(["Power", "Driver"]);
    expect(command.comment).toBe("Drive setpoints,\none per channel");
  });

  it("strips the extended id flag", () => {
    expect(file.messages[2].id).toBe(0x1d1);
    expect(file.messages[2].receivers).toEqual([]);
  });

  it("reads extra transmitters", () => {
    expect(file.messages[3].transmitters).toEqual(["Power", "Computer"]);
  });

  it("names every node the file mentions", () => {
    expect(dbcNodes({ nodes: ["Computer"], messages: [{ id: 1, name: "A", transmitters: ["Power"], receivers: ["Computer", "Driver"] }] })).toEqual(["Computer", "Power", "Driver"]);
  });
});

describe("matchNode", () => {
  const parties = [
    { id: "computer", label: "Main computer" },
    { id: "power", label: "PC-12 power controller" },
    { id: "driver", label: "Motor driver (all 3)" },
    { id: "front-driver", label: "Front motor driver" },
  ];

  it("matches by containment when it is unambiguous", () => {
    expect(matchNode("PC12", parties)).toBe("power");
    expect(matchNode("Computer", parties)).toBe("computer");
    expect(matchNode("PC-12_Power_Controller", parties)).toBe("power");
  });

  it("gives up on ambiguous or unknown names", () => {
    expect(matchNode("Driver", parties)).toBeUndefined();
    expect(matchNode("Dock", parties)).toBeUndefined();
  });
});
