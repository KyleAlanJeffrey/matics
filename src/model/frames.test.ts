import { describe, expect, it } from "vitest";
import { sampleProject } from "./sample-project";
import { formatFrameRange, frameFlows, frameIdCount, framesForParty, parseCanId, partyLabel, partyTotals, totalFrameIds } from "./frames";

describe("CAN ids", () => {
  it("parses hex and decimal identifiers", () => {
    expect(parseCanId("0x1D1")).toBe(0x1d1);
    expect(parseCanId("1d1")).toBe(0x1d1);
    expect(parseCanId("512")).toBe(512);
    expect(parseCanId("0x")).toBeUndefined();
    expect(parseCanId("zz")).toBeUndefined();
  });

  it("formats ranges inclusively", () => {
    expect(formatFrameRange({ startId: 0x100, endId: 0x117 })).toBe("0x100 - 0x117");
    expect(formatFrameRange({ startId: 0, endId: 0 })).toBe("0x000");
    expect(frameIdCount({ startId: 0x100, endId: 0x117 })).toBe(24);
  });
});

describe("sample frames", () => {
  const frames = Object.values(sampleProject.frames);

  it("cover 14 identifiers across 7 definitions", () => {
    expect(frames).toHaveLength(7);
    expect(totalFrameIds(frames)).toBe(14);
  });

  it("total identifiers per party", () => {
    const byParty = Object.fromEntries(partyTotals(sampleProject).map((t) => [t.partyId, [t.txIds, t.rxIds]]));
    expect(byParty.computer).toEqual([4, 9]);
    expect(byParty.power).toEqual([3, 1]);
    expect(byParty.driver).toEqual([3, 4]);
    expect(partyLabel(sampleProject, "driver")).toBe("Motor driver (all 3)");
  });

  it("describe logical flows between parties", () => {
    const flows = frameFlows(sampleProject).map((f) => `${f.fromId}>${f.toId}=${f.ids}`);
    expect(flows).toEqual(["computer>driver=3", "driver>computer=3", "power>driver=1", "computer>power=1", "power>computer=2", "imu>computer=3", "modem>computer=1"]);
  });

  it("finds frames for a placed copy through its product", () => {
    const { tx, rx } = framesForParty(sampleProject, "middle-driver");
    expect(tx.map((f) => f.name)).toEqual(["DriveStatus"]);
    expect(rx.map((f) => f.name)).toEqual(["DriveCommand", "DriverWakeup"]);
  });
});
