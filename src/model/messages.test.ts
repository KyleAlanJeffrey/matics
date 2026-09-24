import { describe, expect, it } from "vitest";
import { messagesByDevice } from "./messages";
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
