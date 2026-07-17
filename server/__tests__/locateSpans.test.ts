import { describe, it, expect } from "vitest";
import {
  locateQuote,
  locateFieldMeta,
  averageConfidence,
} from "../src/utils/locateSpans.js";

describe("locateQuote", () => {
  it("finds exact match", () => {
    const text = "Vendor: Zomato Ltd\nTotal: 500";
    const span = locateQuote(text, "Zomato Ltd");
    expect(span).toEqual({ start: 8, end: 18 });
  });

  it("finds whitespace-normalized match", () => {
    const text = "Vendor:  Zomato   Ltd";
    const span = locateQuote(text, "Zomato Ltd");
    expect(span).toBeDefined();
    expect(text.slice(span!.start, span!.end).replace(/\s+/g, " ")).toBe(
      "Zomato Ltd"
    );
  });

  it("returns undefined when quote not found", () => {
    expect(locateQuote("hello world", "missing")).toBeUndefined();
    expect(locateQuote("hello", "")).toBeUndefined();
  });
});

describe("locateFieldMeta", () => {
  it("attaches spans to meta and alternatives", () => {
    const text = "Invoice from Zomato Ltd and Swiggy Ltd";
    const result = locateFieldMeta(text, [
      {
        field: "vendor.name",
        confidence: 0.5,
        sourceText: "Zomato Ltd",
        reason: "two vendors",
        alternatives: [{ value: "Swiggy Ltd", sourceText: "Swiggy Ltd" }],
      },
    ]);

    expect(result[0].start).toBeDefined();
    expect(result[0].end).toBeGreaterThan(result[0].start!);
    expect(result[0].alternatives![0].start).toBeDefined();
  });
});

describe("averageConfidence", () => {
  it("returns average of field confidences", () => {
    expect(
      averageConfidence([
        { field: "a", confidence: 0.8, sourceText: "x" },
        { field: "b", confidence: 0.6, sourceText: "y" },
      ])
    ).toBeCloseTo(0.7);
  });

  it("returns undefined for empty array", () => {
    expect(averageConfidence([])).toBeUndefined();
  });
});
