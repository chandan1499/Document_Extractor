import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { JsonFileRepository } from "../src/repository/JsonFileRepository";

describe("JsonFileRepository pagination", () => {
  let dir: string;
  let repo: JsonFileRepository;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "doc-page-"));
    repo = new JsonFileRepository(dir);

    for (let i = 0; i < 25; i++) {
      await repo.save({
        id: "",
        type: "invoice",
        originalText: `Doc ${i}`,
        extractedData: { index: i },
        validationErrors: [],
        validationWarnings: [],
        createdAt: new Date(Date.now() - i * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("defaults to page 1 with limit 20", async () => {
    const result = await repo.search({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.items).toHaveLength(20);
    expect(result.total).toBe(25);
    expect(result.totalPages).toBe(2);
  });

  it("returns page 2", async () => {
    const result = await repo.search({ page: 2, limit: 20 });
    expect(result.page).toBe(2);
    expect(result.items).toHaveLength(5);
    expect(result.totalPages).toBe(2);
  });

  it("clamps limit to max 100", async () => {
    const result = await repo.search({ limit: 500 });
    expect(result.limit).toBe(100);
    expect(result.items).toHaveLength(25);
  });

  it("returns empty page beyond total", async () => {
    const result = await repo.search({ page: 10, limit: 20 });
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(25);
  });
});
