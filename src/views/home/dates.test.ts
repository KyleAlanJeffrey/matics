import { describe, expect, it } from "vitest";
import { dayLabel } from "./dates";

describe("dayLabel", () => {
  const now = new Date(2026, 8, 24, 0, 5);

  it("counts calendar days, not hours", () => {
    expect(dayLabel(new Date(2026, 8, 24, 0, 1), now)).toBe("today");
    expect(dayLabel(new Date(2026, 8, 23, 23, 59), now)).toBe("yesterday");
  });

  it("names the year only when it is not this year", () => {
    expect(dayLabel(new Date(2026, 8, 20), now)).not.toContain("2026");
    expect(dayLabel(new Date(2025, 8, 20), now)).toContain("2025");
  });
});
