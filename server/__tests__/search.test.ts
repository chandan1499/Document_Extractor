import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { JsonFileRepository } from "../src/repository/JsonFileRepository";

describe("JsonFileRepository.search field queries", () => {
  let dir: string;
  let repo: JsonFileRepository;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "doc-search-"));
    repo = new JsonFileRepository(dir);
    await repo.save({
      id: "",
      type: "invoice",
      originalText: "ACME invoice",
      extractedData: {
        vendor: { name: "ACME Corp", email: "", address: "" },
        total: 75000,
      },
      validationErrors: [],
      validationWarnings: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await repo.save({
      id: "",
      type: "invoice",
      originalText: "Small",
      extractedData: {
        vendor: { name: "Other", email: "", address: "" },
        total: 100,
      },
      validationErrors: [],
      validationWarnings: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("filters by nested vendor.name", async () => {
    const docs = await repo.search({ "vendor.name": "ACME" });
    expect(docs).toHaveLength(1);
  });

  it("filters total.gt", async () => {
    const docs = await repo.search({ "total.gt": "50000" });
    expect(docs).toHaveLength(1);
    expect(docs[0].extractedData.total).toBe(75000);
  });

  it("filters with free-text q", async () => {
    const docs = await repo.search({ q: "acme" });
    expect(docs).toHaveLength(1);
  });
});
