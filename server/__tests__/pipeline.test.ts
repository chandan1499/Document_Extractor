import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { preprocess, validate, extractDocument } from "../src/pipeline/index";
import { JsonSchemaRepository } from "../src/repository/SchemaRepository";
import { SchemaRegistry } from "../src/registry/index";
import type { LLMProvider, SchemaTypeInfo } from "../src/types";

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
  let dir: string;
  let schemaRegistry: SchemaRegistry;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "doc-pipeline-"));
    schemaRegistry = new SchemaRegistry(new JsonSchemaRepository(dir));
    await schemaRegistry.initialize();
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("returns structural errors for missing invoice fields", () => {
    const { errors } = validate({}, "invoice", schemaRegistry);
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
      "invoice",
      schemaRegistry
    );
    const emailErrors = errors.filter((e) => e.field.includes("email"));
    const dateErrors = errors.filter((e) =>
      ["invoiceDate", "dueDate"].includes(e.field)
    );
    expect(emailErrors).toHaveLength(0);
    expect(dateErrors).toHaveLength(0);
  });
});

describe("extractDocument fieldMeta", () => {
  let dir: string;
  let schemaRegistry: SchemaRegistry;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "doc-pipeline-meta-"));
    schemaRegistry = new SchemaRegistry(new JsonSchemaRepository(dir));
    await schemaRegistry.initialize();
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("attaches fieldMeta, extractionText, and average confidence", async () => {
    const text = "Vendor: Zomato Ltd and Swiggy Ltd\nTotal: 10";
    const mockLlm: LLMProvider = {
      classify: async (_t, types: SchemaTypeInfo[]) => types[0].id,
      extract: async () => ({
        data: {
          invoiceNumber: "INV-1",
          invoiceDate: "2025-01-01",
          dueDate: "2025-01-15",
          vendor: { name: "Zomato Ltd", email: "", address: "" },
          customer: { name: "Bob", email: "", address: "" },
          lineItems: [
            { description: "A", quantity: 1, unitPrice: 10, total: 10 },
          ],
          subtotal: 10,
          gstRate: 0,
          tax: 0,
          total: 10,
          currency: "USD",
          notes: "",
        },
        fieldMeta: [
          {
            field: "vendor.name",
            confidence: 0.5,
            sourceText: "Zomato Ltd",
            reason: "two vendors in document",
            alternatives: [{ value: "Swiggy Ltd", sourceText: "Swiggy Ltd" }],
          },
          {
            field: "total",
            confidence: 0.95,
            sourceText: "10",
          },
        ],
      }),
      extractLearningRules: async () => [],
      proposeSchema: async () => [],
    };

    const doc = await extractDocument(
      text,
      mockLlm,
      schemaRegistry,
      [],
      undefined,
      { schemaId: "invoice" }
    );

    expect(doc.extractionText).toBe(preprocess(text));
    expect(doc.fieldMeta!.length).toBeGreaterThanOrEqual(2);
    const vendorMeta = doc.fieldMeta!.find((m) => m.field === "vendor.name");
    expect(vendorMeta?.start).toBeDefined();
    expect(vendorMeta?.alternatives![0].start).toBeDefined();
    expect(doc.confidence).toBeDefined();
  });

  it("downgrades any field confidence when validation flags it", async () => {
    const text = "Jane Doe\nEmail: not-an-email";
    const mockLlm: LLMProvider = {
      classify: async (_t, types: SchemaTypeInfo[]) => types[0].id,
      extract: async () => ({
        data: {
          name: "Jane Doe",
          email: "not-an-email",
          phone: "",
          location: "",
          summary: "",
          links: { linkedin: "", github: "" },
          experience: [
            {
              company: "Acme",
              position: "Engineer",
              startDate: "2020-01",
              endDate: "2024-01",
              description: "",
            },
          ],
          education: [
            {
              school: "State U",
              degree: "BS",
              graduationDate: "2019",
            },
          ],
          skills: ["TypeScript"],
        },
        fieldMeta: [
          {
            field: "email",
            confidence: 0.95,
            sourceText: "not-an-email",
          },
        ],
      }),
      extractLearningRules: async () => [],
      proposeSchema: async () => [],
    };

    const doc = await extractDocument(
      text,
      mockLlm,
      schemaRegistry,
      [],
      undefined,
      { schemaId: "resume" }
    );

    const emailMeta = doc.fieldMeta?.find((m) => m.field === "email");
    expect(emailMeta?.confidence).toBeLessThan(0.7);
    expect(emailMeta?.reason).toMatch(/invalid|email/i);
    expect(doc.validationErrors.some((e) => e.field === "email")).toBe(true);
  });
});
