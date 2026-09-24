import { describe, expect, it } from "vitest";
import { markdownLines, markdownOpenItems, markdownOutline, plainText, renameWikiLinks, wikiLinks } from "./markdown";

describe("wiki links", () => {
  it("finds targets and aliases", () => {
    expect(wikiLinks("On [[Drive CAN]] and [[Service CAN|B2]].")).toEqual([
      { from: 3, to: 16, target: "Drive CAN", alias: undefined },
      { from: 21, to: 39, target: "Service CAN", alias: "B2" },
    ]);
  });

  it("follows a rename and keeps aliases", () => {
    expect(renameWikiLinks("[[drive can]], [[Drive CAN|B1]], [[Other]]", "Drive CAN", "Motion CAN")).toBe("[[Motion CAN]], [[Motion CAN|B1]], [[Other]]");
  });
});

describe("markdown lines", () => {
  const note = "# Title\n\nText with `code`.\n\n```\n# not a heading\n```\n\n- [ ] Open *one*\n- [x] Done\n\t- [ ] Nested";

  it("builds an outline outside code fences", () => {
    expect(markdownOutline(note)).toEqual([{ line: 1, level: 1, text: "Title" }]);
  });

  it("lists unchecked items with their line", () => {
    expect(markdownOpenItems(note)).toEqual([
      { line: 9, text: "Open one" },
      { line: 11, text: "Nested" },
    ]);
  });

  it("strips inline markup", () => {
    expect(plainText("**Bold**, [site](https://x.dev) and [[A|b]]")).toBe("Bold, site and b");
    expect(plainText("See Front_Encoders_Driver and _this_")).toBe("See Front_Encoders_Driver and this");
    expect(plainText("Run `*not* __bold__` then *em*")).toBe("Run *not* __bold__ then em");
  });
});

describe("CommonMark details", () => {
  it("closes a fence only on a matching, bare closing fence", () => {
    const md = ["````", "```js", "# not a heading", "```", "````", "# Heading"].join("\n");
    const lines = markdownLines(md);
    expect(lines[0]).toMatchObject({ kind: "code", text: "```js\n# not a heading\n```" });
    expect(markdownOutline(md).map((h) => h.text)).toEqual(["Heading"]);
  });

  it("does not open a fence indented four spaces", () => {
    expect(markdownLines("    ```\n# Heading").some((l) => l.kind === "code")).toBe(false);
  });
});
