import { describe, it, expect } from "vitest";
import { applyDocumentFilters, getByPath } from "../src/repository/documentFilters";
import type { ExtractedDocument } from "../src/types";

const sampleDoc = (overrides: Partial<ExtractedDocument> = {}): ExtractedDocument => ({
  id: "1",
  type: "invoice",
  originalText: "ACME invoice text",
  extractedData: {
    vendor: { name: "ACME Corp" },
    total: 75000,
  },
  validationErrors: [],
  validationWarnings: [],
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
  ...overrides,
});

describe("documentFilters", () => {
  it("getByPath resolves nested fields", () => {
    expect(getByPath({ vendor: { name: "ACME" } }, "vendor.name")).toBe("ACME");
  });

  it("filters by type", () => {
    const docs = [
      sampleDoc({ type: "invoice" }),
      sampleDoc({ id: "2", type: "resume" }),
    ];
    const result = applyDocumentFilters(docs, { type: "invoice" });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("invoice");
  });

  it("filters by comparison operator", () => {
    const docs = [
      sampleDoc(),
      sampleDoc({ id: "2", extractedData: { total: 100 } }),
    ];
    const result = applyDocumentFilters(docs, { "total.gt": "50000" });
    expect(result).toHaveLength(1);
    expect(result[0].extractedData.total).toBe(75000);
  });

  it("filters by free-text q", () => {
    const docs = [
      sampleDoc(),
      sampleDoc({
        id: "2",
        originalText: "other vendor",
        extractedData: { vendor: { name: "Other Corp" } },
      }),
    ];
    const result = applyDocumentFilters(docs, { q: "acme" });
    expect(result).toHaveLength(1);
  });

  it("ignores page and limit reserved keys", () => {
    const docs = [sampleDoc(), sampleDoc({ id: "2" })];
    const result = applyDocumentFilters(docs, { page: 2, limit: 1 });
    expect(result).toHaveLength(2);
  });
});
