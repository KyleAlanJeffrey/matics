import { describe, expect, it } from "vitest";
import { pageBreaks } from "./page-breaks";

describe("pageBreaks", () => {
  it("fits a short document on one page", () => {
    expect(pageBreaks(500, 1000, [])).toEqual([{ top: 0, bottom: 500 }]);
  });

  it("moves a cut above a row that would straddle it", () => {
    const rows = [
      { top: 900, bottom: 980 },
      { top: 980, bottom: 1060 },
    ];
    expect(pageBreaks(1500, 1000, rows)).toEqual([
      { top: 0, bottom: 980 },
      { top: 980, bottom: 1500 },
    ]);
  });

  it("cuts through a block taller than a page rather than looping", () => {
    const pages = pageBreaks(2500, 1000, [{ top: 100, bottom: 2400 }]);
    expect(pages[0]).toEqual({ top: 0, bottom: 100 });
    expect(pages[1]).toEqual({ top: 100, bottom: 1100 });
    expect(pages.at(-1)?.bottom).toBe(2500);
  });
});
