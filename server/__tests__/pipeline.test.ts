import { describe, it, expect } from "vitest";
import { preprocess, validate } from "../src/pipeline/index";

describe("preprocess", () => {
  it("preserves newlines between non-empty lines", () => {
    const input = "Line one\n\nLine two\n  Line three  ";
    const result = preprocess(input);
    expect(result).toBe("Line one\nLine two\nLine three");
  });

  it("collapses horizontal whitespace but not across lines", () => {
    const input = "A    B\nC\t\tD";
    const result = preprocess(input);
    expect(result).toBe("A B\nC D");
  });

  it("strips page X of Y and confidential boilerplate", () => {
    const input = "Hello\nPage 1 of 3\nCONFIDENTIAL\nWorld";
    const result = preprocess(input);
    expect(result.toLowerCase()).not.toContain("page 1 of 3");
    expect(result.toLowerCase()).not.toContain("confidential");
    expect(result).toContain("Hello");
    expect(result).toContain("World");
  });
});

describe("validate", () => {
  it("returns structural errors for missing invoice fields", () => {
    const { errors } = validate({}, "invoice");
    expect(errors.length).toBeGreaterThan(0);
  });

  it("accepts empty vendor email and ISO datetime invoiceDate", () => {
    const { errors } = validate(
      {
        invoiceNumber: "INV-1",
        invoiceDate: "2025-01-01T00:00:00Z",
        dueDate: "2025-01-15",
        vendor: { name: "ACME", email: "", address: "" },
        customer: { name: "Bob", email: "", address: "" },
        lineItems: [
          { description: "A", quantity: 1, unitPrice: 10, total: 10 },
        ],
        subtotal: 10,
        tax: "0",
        total: 10,
        currency: "USD",
        notes: "",
      },
      "invoice"
    );
    const emailErrors = errors.filter((e) => e.field.includes("email"));
    const dateErrors = errors.filter((e) =>
      ["invoiceDate", "dueDate"].includes(e.field)
    );
    expect(emailErrors).toHaveLength(0);
    expect(dateErrors).toHaveLength(0);
  });
});
