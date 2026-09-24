import { describe, expect, it } from "vitest";
import { isCodeLike, propLabel } from "./props";

describe("device property labels", () => {
  it("turns free-form keys into words", () => {
    expect(propLabel("canAddress")).toBe("CAN address");
    expect(propLabel("ip")).toBe("IP address");
    expect(propLabel("CAN bitrate")).toBe("CAN bitrate");
    expect(propLabel("on hand")).toBe("On hand");
    expect(propLabel("wake-up")).toBe("Wake up");
    expect(propLabel("B2")).toBe("B2");
    expect(propLabel("__proto__")).toBe("Proto");
    expect(propLabel("toString")).toBe("To string");
  });

  it("spots addresses and IDs", () => {
    expect(isCodeLike("0x000")).toBe(true);
    expect(isCodeLike("192.168.1.100")).toBe(true);
    expect(isCodeLike("250 kbit/s")).toBe(false);
  });
});
