import { describe, it, expect } from "vitest";
import {
  normalizeFieldMeta,
  normalizeFieldPath,
  ensureFieldMetaCoverage,
  getFieldMetaForPath,
  collectLeafPaths,
} from "../src/utils/alignFieldMeta.js";

describe("alignFieldMeta", () => {
  it("strips data. prefix from field paths", () => {
    expect(normalizeFieldPath("data.email")).toBe("email");
    expect(normalizeFieldPath("data.experience.0.company")).toBe(
      "experience.0.company"
    );
  });

  it("merges duplicate entries keeping lower confidence", () => {
    const result = normalizeFieldMeta([
      { field: "data.email", confidence: 0.9, sourceText: "bad" },
      {
        field: "email",
        confidence: 0.5,
        sourceText: "bad",
        reason: "Invalid email",
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].field).toBe("email");
    expect(result[0].confidence).toBe(0.5);
    expect(result[0].reason).toContain("Invalid email");
  });

  it("fills missing leaf paths for UI coverage", () => {
    const data = {
      name: "Jane",
      phone: "12345",
      links: { linkedin: "", github: "" },
    };
    const result = ensureFieldMetaCoverage(data, [
      { field: "name", confidence: 0.9, sourceText: "Jane" },
    ]);

    expect(result.some((m) => m.field === "phone")).toBe(true);
    expect(result.some((m) => m.field === "links.linkedin")).toBe(true);
  });

  it("collects leaf paths from nested data", () => {
    expect(
      collectLeafPaths({
        experience: [{ company: "Acme", position: "Dev" }],
        skills: ["TS"],
      })
    ).toEqual(["experience.0.company", "experience.0.position", "skills.0"]);
  });

  it("resolves meta by path with or without data. prefix", () => {
    const meta = [
      { field: "data.phone", confidence: 0.6, sourceText: "12345" },
    ];
    expect(getFieldMetaForPath(meta, "phone")?.confidence).toBe(0.6);
  });
});
