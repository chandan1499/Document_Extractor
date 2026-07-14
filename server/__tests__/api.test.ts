import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { createApp } from "../src/app";
import { JsonFileRepository } from "../src/repository/JsonFileRepository";
import { JsonCorrectionStore } from "../src/repository/JsonCorrectionStore";
import type { LLMProvider } from "../src/types";

const mockLlm: LLMProvider = {
  classify: async () => "invoice",
  extract: async () => ({
    data: {
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
    },
  }),
  extractLearningRules: async (_docType, _corrections, learningNotes) => {
    return learningNotes
      .split(/\n|;/)
      .map((r) => r.replace(/^[\s•\-*\d.)]+/, "").trim())
      .filter(Boolean);
  },
};

describe("API integration", () => {
  let dir: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "doc-api-"));
    app = createApp({
      docRepo: new JsonFileRepository(dir),
      correctionRepo: new JsonCorrectionStore(dir),
      llm: mockLlm,
    });
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("POST /api/extract returns structured document", async () => {
    const res = await request(app)
      .post("/api/extract")
      .send({ text: "Invoice INV-1 from ACME" })
      .expect(200);

    expect(res.body.type).toBe("invoice");
    expect(res.body.extractedData.invoiceNumber).toBe("INV-1");
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
    expect(list.body.length).toBe(1);
    expect(list.body[0].id).toBe(saved.body.id);
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

    expect(filtered.body.length).toBe(1);

    const empty = await request(app)
      .get("/api/documents")
      .query({ "total.gt": "100" })
      .expect(200);

    expect(empty.body.length).toBe(0);
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
});
