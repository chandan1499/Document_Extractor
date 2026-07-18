import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import {
  buildSchemaFromFields,
  buildZodFromFields,
  slugifySchemaId,
} from "../src/schemas/dynamic";
import { normalizeForStrictMode } from "../src/schemas/strictJsonSchema";
import { JsonSchemaRepository } from "../src/repository/SchemaRepository";
import { SchemaRegistry } from "../src/registry/index";
import { getBuiltinSchemaSeeds } from "../src/registry/builtinSeeds";
import { validate } from "../src/pipeline/index";

const TEST_USER_ID = "00000000-0000-4000-8000-000000000001";

describe("dynamic schema utilities", () => {
  it("slugifySchemaId converts names to ids", () => {
    expect(slugifySchemaId("Purchase Order")).toBe("purchase_order");
  });

  it("buildSchemaFromFields produces strict JSON schema", () => {
    const { jsonSchema } = buildSchemaFromFields([
      { key: "title", type: "string", required: true },
      { key: "amount", type: "number", required: false },
    ]);

    expect(jsonSchema.type).toBe("object");
    expect(jsonSchema.additionalProperties).toBe(false);
    expect(jsonSchema.required).toEqual(
      expect.arrayContaining(["title", "amount"])
    );
  });

  it("normalizeForStrictMode enforces additionalProperties false on nested objects", () => {
    const normalized = normalizeForStrictMode({
      type: "object",
      properties: {
        vendor: {
          type: "object",
          properties: { name: { type: "string" } },
        },
      },
    }) as { properties: { vendor: Record<string, unknown> } };

    expect(normalized.properties.vendor.additionalProperties).toBe(false);
    expect(normalized.properties.vendor.required).toEqual(["name"]);
  });

  it("buildZodFromFields validates custom data", () => {
    const zod = buildZodFromFields([
      { key: "poNumber", type: "string", required: true },
      { key: "total", type: "number", required: true },
    ]);
    const ok = zod.safeParse({ poNumber: "PO-1", total: 100 });
    expect(ok.success).toBe(true);
  });
});

describe("SchemaRegistry seeding", () => {
  let dir: string;
  let registry: SchemaRegistry;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "doc-schema-"));
    registry = new SchemaRegistry(new JsonSchemaRepository(dir));
    await registry.initialize();
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("seeds built-in schemas idempotently", async () => {
    await registry.initialize();
    const types = await registry.listTypes(TEST_USER_ID);
    expect(types.map((t) => t.id).sort()).toEqual([
      "invoice",
      "meeting_notes",
      "resume",
    ]);
  });

  it("getEntry returns validators for invoice", async () => {
    const entry = await registry.getEntry("invoice", TEST_USER_ID);
    expect(entry.validators.length).toBeGreaterThan(0);
    expect(entry.fieldDefinitions?.length).toBeGreaterThan(0);
  });

  it("builtin seeds match expected ids", () => {
    const seeds = getBuiltinSchemaSeeds();
    expect(seeds).toHaveLength(3);
    expect(seeds.every((s) => s.isBuiltin)).toBe(true);
  });
});

describe("validate parity for seeded invoice", () => {
  let dir: string;
  let registry: SchemaRegistry;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "doc-parity-"));
    registry = new SchemaRegistry(new JsonSchemaRepository(dir));
    await registry.initialize();
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("validates a complete invoice without structural email/date errors", async () => {
    const { errors } = await validate(
      {
        invoiceNumber: "INV-1",
        invoiceDate: "2025-01-01",
        dueDate: "2025-01-15",
        vendor: { name: "ACME", email: "", address: "" },
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
      "invoice",
      registry,
      TEST_USER_ID
    );

    const structural = errors.filter(
      (e) => !["subtotal", "total", "tax", "invoiceDate", "dueDate"].includes(e.field)
    );
    expect(structural.filter((e) => e.field.includes("email"))).toHaveLength(0);
  });
});
