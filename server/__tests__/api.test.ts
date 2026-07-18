import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { createApp } from "../src/app";
import { JsonFileRepository } from "../src/repository/JsonFileRepository";
import { JsonCorrectionStore } from "../src/repository/JsonCorrectionStore";
import { JsonSchemaRepository } from "../src/repository/SchemaRepository";
import { SchemaRegistry } from "../src/registry/index";
import type { LLMProvider, SchemaTypeInfo } from "../src/types";

const USER_A = "00000000-0000-4000-8000-000000000001";
const USER_B = "00000000-0000-4000-8000-000000000002";

const mockInvoiceData = {
  invoiceNumber: "INV-1",
  invoiceDate: "2025-01-01",
  dueDate: "2025-01-15",
  vendor: { name: "ACME", email: "a@b.com", address: "x" },
  customer: { name: "Bob", email: "b@c.com", address: "y" },
  lineItems: [{ description: "A", quantity: 1, unitPrice: 10, total: 10 }],
  subtotal: 10,
  gstRate: 0,
  tax: 0,
  total: 10,
  currency: "USD",
  notes: "",
};

const mockLlm: LLMProvider = {
  classify: async (_text, types: SchemaTypeInfo[]) =>
    types.find((t) => t.id === "invoice")?.id ?? types[0]?.id ?? "invoice",
  extract: async () => ({ data: mockInvoiceData }),
  extractLearningRules: async (_docType, _corrections, learningNotes) => {
    return learningNotes
      .split(/\n|;/)
      .map((r) => r.replace(/^[\s•\-*\d.)]+/, "").trim())
      .filter(Boolean);
  },
  proposeSchema: async () => [
    { key: "orderNumber", type: "string", required: true, label: "Order Number" },
    { key: "total", type: "number", required: true, label: "Total" },
  ],
};

function createTestApp(dir: string, testUserId: string) {
  const schemaRegistry = new SchemaRegistry(new JsonSchemaRepository(dir));
  return {
    schemaRegistry,
    app: createApp({
      docRepo: new JsonFileRepository(dir),
      correctionRepo: new JsonCorrectionStore(dir),
      llm: mockLlm,
      schemaRegistry,
      testUserId,
    }),
  };
}

describe("API integration", () => {
  let dir: string;
  let app: ReturnType<typeof createApp>;
  let schemaRegistry: SchemaRegistry;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "doc-api-"));
    const setup = createTestApp(dir, USER_A);
    schemaRegistry = setup.schemaRegistry;
    await schemaRegistry.initialize();
    app = setup.app;
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("returns 401 for protected routes without auth", async () => {
    const unauthApp = createApp({
      docRepo: new JsonFileRepository(dir),
      correctionRepo: new JsonCorrectionStore(dir),
      llm: mockLlm,
      schemaRegistry,
    });

    await request(unauthApp).get("/api/schemas").expect(401);
  });

  it("GET /api/health is public", async () => {
    await request(app).get("/api/health").expect(200);
  });

  it("GET /api/schemas lists built-in schemas", async () => {
    const res = await request(app).get("/api/schemas").expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
    expect(res.body.some((s: { id: string }) => s.id === "invoice")).toBe(true);
  });

  it("POST /api/extract returns structured document", async () => {
    const res = await request(app)
      .post("/api/extract")
      .send({ text: "Invoice INV-1 from ACME" })
      .expect(200);

    expect(res.body.type).toBe("invoice");
    expect(res.body.extractedData.invoiceNumber).toBe("INV-1");
    expect(res.body.extractionText).toBeDefined();
  });

  it("POST /api/documents persists fieldMeta and confidence", async () => {
    const res = await request(app)
      .post("/api/documents")
      .send({
        type: "invoice",
        originalText: "raw",
        extractionText: "cleaned",
        extractedData: mockInvoiceData,
        validationErrors: [],
        confidence: 0.85,
        fieldMeta: [
          {
            field: "vendor.name",
            confidence: 0.5,
            sourceText: "ACME",
          },
        ],
      })
      .expect(201);

    expect(res.body.confidence).toBe(0.85);
    expect(res.body.fieldMeta).toHaveLength(1);
    expect(res.body.extractionText).toBe("cleaned");
  });

  it("POST /api/extract with schemaId skips classification", async () => {
    const res = await request(app)
      .post("/api/extract")
      .send({ text: "anything", schemaId: "invoice" })
      .expect(200);

    expect(res.body.type).toBe("invoice");
  });

  it("POST /api/extract rejects inaccessible schemaId", async () => {
    await request(app)
      .post("/api/extract")
      .send({ text: "x", schemaId: "not_a_schema" })
      .expect(403);
  });

  it("POST /api/schemas creates custom schema", async () => {
    const res = await request(app)
      .post("/api/schemas")
      .send({
        name: "Purchase Order",
        description: "PO documents",
        fieldDefinitions: [
          { key: "poNumber", type: "string", required: true },
          { key: "total", type: "number", required: true },
        ],
      })
      .expect(201);

    expect(res.body.id).toBe("purchase_order");
    expect(res.body.fieldDefinitions).toHaveLength(2);
  });

  it("DELETE /api/schemas/:id blocks built-in", async () => {
    await request(app).delete("/api/schemas/invoice").expect(409);
  });

  it("POST /api/schemas/propose returns draft", async () => {
    const res = await request(app)
      .post("/api/schemas/propose")
      .send({ sampleText: "PO #123 total $500", name: "Purchase Order" })
      .expect(200);

    expect(res.body.fieldDefinitions.length).toBeGreaterThan(0);
    expect(res.body.id).toBeTruthy();
  });

  it("POST /api/documents saves and GET lists it", async () => {
    const extract = await request(app)
      .post("/api/extract")
      .send({ text: "Invoice INV-1 from ACME" })
      .expect(200);

    const saved = await request(app)
      .post("/api/documents")
      .send(extract.body)
      .expect(201);

    expect(saved.body.id).toBeTruthy();

    const list = await request(app).get("/api/documents").expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.total).toBe(1);
    expect(list.body.page).toBe(1);
    expect(list.body.items[0].id).toBe(saved.body.id);
  });

  it("GET /api/documents?total.gt=5 filters", async () => {
    const extract = await request(app)
      .post("/api/extract")
      .send({ text: "Invoice" })
      .expect(200);

    await request(app).post("/api/documents").send(extract.body).expect(201);

    const filtered = await request(app)
      .get("/api/documents")
      .query({ "total.gt": "5" })
      .expect(200);

    expect(filtered.body.items).toHaveLength(1);

    const empty = await request(app)
      .get("/api/documents")
      .query({ "total.gt": "100" })
      .expect(200);

    expect(empty.body.items).toHaveLength(0);
    expect(empty.body.total).toBe(0);
  });

  it("POST /api/documents/:id/correct-batch saves corrections and extracts rules", async () => {
    const extract = await request(app)
      .post("/api/extract")
      .send({ text: "Invoice INV-1 from ACME" })
      .expect(200);

    const saved = await request(app)
      .post("/api/documents")
      .send(extract.body)
      .expect(201);

    const batch = await request(app)
      .post(`/api/documents/${saved.body.id}/correct-batch`)
      .send({
        corrections: [
          {
            field: "vendor.name",
            originalValue: "ACME",
            correctedValue: "ACME Cloud",
          },
          {
            field: "total",
            originalValue: 10,
            correctedValue: 12,
          },
        ],
        learningNotes:
          "Vendor is always ACME Cloud\nTotal must include 20% GST",
      })
      .expect(201);

    expect(batch.body.corrections).toHaveLength(2);
    expect(batch.body.guidelines.length).toBeGreaterThanOrEqual(2);

    const guidelines = await request(app).get("/api/guidelines").expect(200);
    expect(guidelines.body.length).toBeGreaterThanOrEqual(2);
  });

  it("isolates custom schemas and documents between users", async () => {
    const created = await request(app)
      .post("/api/schemas")
      .send({
        name: "Private PO",
        fieldDefinitions: [
          { key: "poNumber", type: "string", required: true },
        ],
      })
      .expect(201);

    const extract = await request(app)
      .post("/api/extract")
      .send({ text: "PO 999", schemaId: created.body.id })
      .expect(200);

    const saved = await request(app)
      .post("/api/documents")
      .send(extract.body)
      .expect(201);

    const appB = createApp({
      docRepo: new JsonFileRepository(dir),
      correctionRepo: new JsonCorrectionStore(dir),
      llm: mockLlm,
      schemaRegistry,
      testUserId: USER_B,
    });

    await request(appB).get(`/api/schemas/${created.body.id}`).expect(404);
    await request(appB)
      .post("/api/extract")
      .send({ text: "PO 999", schemaId: created.body.id })
      .expect(403);
    await request(appB).delete(`/api/schemas/${created.body.id}`).expect(404);
    await request(appB).get("/api/documents").expect(200);
    expect((await request(appB).get("/api/documents")).body.items).toHaveLength(
      0
    );
    await request(appB).get(`/api/documents/${saved.body.id}`).expect(404);

    const schemasB = await request(appB).get("/api/schemas").expect(200);
    expect(
      schemasB.body.some((s: { id: string }) => s.id === created.body.id)
    ).toBe(false);
    expect(
      schemasB.body.some((s: { id: string }) => s.id === "invoice")
    ).toBe(true);
  });
});
