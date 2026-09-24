import { describe, expect, it } from "vitest";
import { communicationRows, messagesByDevice } from "./messages";
import { sampleProject } from "./sample-project";
import type { Project } from "./types";

const names = (messages: { name: string }[]) => messages.map((m) => m.name);

describe("messagesByDevice", () => {
  it("lists what each device sends and receives", () => {
    const byDevice = Object.fromEntries(messagesByDevice(sampleProject).map((d) => [d.deviceId, [names(d.sent), names(d.received)]]));
    expect(byDevice.computer).toEqual([["PoseEstimate"], ["DriveGoal"]]);
    expect(byDevice.modem).toEqual([["DriveGoal"], ["PoseEstimate"]]);
  });

  it("counts a message once for a device receiving it on two services, and skips unknown devices", () => {
    const message = sampleProject.messages["msg-drive-goal"];
    const project: Project = {
      ...sampleProject,
      messages: {
        [message.id]: { ...message, receivers: [{ deviceId: "computer" }, { deviceId: "computer", serviceId: "navigation" }, { deviceId: "gone" }] },
      },
    };
    const byDevice = messagesByDevice(project);
    expect(byDevice.map((d) => d.deviceId).sort()).toEqual(["computer", "modem"]);
    expect(names(byDevice.find((d) => d.deviceId === "computer")!.received)).toEqual(["DriveGoal"]);
  });
});

describe("communicationRows", () => {
  it("lists fieldbus mappings in the direction their data travels", () => {
    const rows = communicationRows(sampleProject).filter((row) => row.kind === "modbus");
    expect(rows.map((row) => [row.name, row.from, row.to, row.transport])).toEqual([
      ["Charge voltage", "Charging dock", ["Power controller"], "IF1"],
      ["Charge current", "Charging dock", ["Power controller"], "IF1"],
      ["Charge enable", "Power controller", ["Charging dock"], "IF1"],
    ]);
    expect(rows[0].deviceIds).toEqual(["power", "dock"]);
  });

  it("filters CAN frames by every copy of a product party", () => {
    const frame = Object.values(sampleProject.frames).find((f) => f.receiverIds.some((id) => sampleProject.presets[id] && !sampleProject.devices[id]))!;
    expect(frame).toBeDefined();
    const row = communicationRows(sampleProject).find((r) => r.id === frame.id)!;
    const presetId = frame.receiverIds.find((id) => sampleProject.presets[id])!;
    const copies = Object.values(sampleProject.devices).filter((d) => d.presetId === presetId).map((d) => d.id);
    expect(copies.length).toBeGreaterThan(1);
    expect(row.deviceIds).toEqual(expect.arrayContaining(copies));
  });
});
