import { describe, it, expect } from "vitest";
import { adjustFieldMetaFromValidation } from "../src/utils/adjustFieldMeta.js";

describe("adjustFieldMetaFromValidation", () => {
  it("lowers confidence when validation warns on a field", () => {
    const result = adjustFieldMetaFromValidation(
      [{ field: "phone", confidence: 0.95, sourceText: "987654321" }],
      [],
      [
        {
          field: "phone",
          severity: "warning",
          message: "Value failed validation for this field",
        },
      ],
      { phone: "987654321" }
    );

    expect(result[0].confidence).toBe(0.65);
    expect(result[0].reason).toContain("failed validation");
    expect(result[0].sourceText).toBe("987654321");
  });

  it("creates fieldMeta from validation when LLM omitted metadata", () => {
    const result = adjustFieldMetaFromValidation(
      undefined,
      [
        {
          field: "email",
          severity: "error",
          message: "Resume email format looks invalid",
        },
      ],
      [],
      { email: "not-an-email" }
    );

    expect(result).toHaveLength(1);
    expect(result[0].field).toBe("email");
    expect(result[0].confidence).toBe(0.5);
    expect(result[0].sourceText).toBe("not-an-email");
  });

  it("merges multiple issues on the same field", () => {
    const result = adjustFieldMetaFromValidation(
      [{ field: "total", confidence: 0.9, sourceText: "100" }],
      [
        {
          field: "total",
          severity: "error",
          message: "Total mismatch",
        },
      ],
      [
        {
          field: "total",
          severity: "warning",
          message: "Total seems low",
        },
      ]
    );

    expect(result[0].confidence).toBe(0.5);
    expect(result[0].reason).toContain("Total mismatch");
    expect(result[0].reason).toContain("Total seems low");
  });
});
