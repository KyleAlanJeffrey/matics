import { describe, expect, it } from "vitest";
import { assertCompleteProject, missingProjectFields } from "./project-shape";
import { sampleProject } from "./sample-project";

describe("missingProjectFields", () => {
  it("accepts a complete project", () => {
    expect(missingProjectFields(structuredClone(sampleProject))).toEqual([]);
  });

  it("names the collections an older build did not write", () => {
    const { messages: _messages, sketches: _sketches, ...older } = structuredClone(sampleProject);
    expect(missingProjectFields(older)).toEqual(["messages", "sketches"]);
    expect(() => assertCompleteProject(older, "That file")).toThrow("That file is missing messages, sketches.");
  });

  it("checks the shape, not just the key", () => {
    expect(missingProjectFields({ ...structuredClone(sampleProject), docLinks: {}, frames: [] })).toEqual(["frames", "docLinks"]);
    expect(missingProjectFields(null)).toEqual(["everything"]);
  });
});
