import { describe, expect, it } from "vitest";
import { safeExternalUrl } from "./links";

describe("safeExternalUrl", () => {
  it("allows web and mail links", () => {
    expect(safeExternalUrl("https://example.com/a.pdf")).toBe("https://example.com/a.pdf");
    expect(safeExternalUrl("example.com/a")).toBe("https://example.com/a");
    expect(safeExternalUrl("mailto:a@b.dev")).toBe("mailto:a@b.dev");
  });

  it("refuses script, data and file links", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,x")).toBeNull();
    expect(safeExternalUrl("file:///etc/passwd")).toBeNull();
  });
});
