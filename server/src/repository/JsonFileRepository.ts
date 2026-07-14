import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import {
  DocumentRepository,
  ExtractedDocument,
  DocumentFilters,
} from "../types.js";

const RESERVED_FILTERS = new Set([
  "type",
  "createdAfter",
  "createdBefore",
  "q",
]);

const OPS = new Set(["gt", "gte", "lt", "lte", "eq"]);

function getByPath(obj: unknown, fieldPath: string): unknown {
  return fieldPath.split(".").reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    if (Array.isArray(acc)) {
      const idx = Number(key);
      return Number.isInteger(idx) ? acc[idx] : undefined;
    }
    if (typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function matchesComparison(
  fieldValue: unknown,
  op: string,
  raw: string
): boolean {
  const left = Number(fieldValue);
  const right = Number(raw);
  if (Number.isNaN(left) || Number.isNaN(right)) {
    if (op === "eq") {
      return String(fieldValue ?? "").toLowerCase() === raw.toLowerCase();
    }
    return false;
  }
  switch (op) {
    case "gt":
      return left > right;
    case "gte":
      return left >= right;
    case "lt":
      return left < right;
    case "lte":
      return left <= right;
    case "eq":
      return left === right;
    default:
      return false;
  }
}

function matchesContains(fieldValue: unknown, raw: string): boolean {
  if (fieldValue === undefined || fieldValue === null) return false;
  if (typeof fieldValue === "object") {
    return JSON.stringify(fieldValue).toLowerCase().includes(raw.toLowerCase());
  }
  return String(fieldValue).toLowerCase().includes(raw.toLowerCase());
}

export class JsonFileRepository implements DocumentRepository {
  private dataDir: string;
  private documentsFile: string;

  constructor(dataDir: string = "./data") {
    this.dataDir = dataDir;
    this.documentsFile = path.join(dataDir, "documents.json");
  }

  private async ensureFile(): Promise<void> {
    try {
      await fs.access(this.documentsFile);
    } catch {
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.writeFile(
        this.documentsFile,
        JSON.stringify({ documents: [] }, null, 2)
      );
    }
  }

  private async readData(): Promise<{ documents: ExtractedDocument[] }> {
    await this.ensureFile();
    const content = await fs.readFile(this.documentsFile, "utf-8");
    return JSON.parse(content);
  }

  private async writeData(data: {
    documents: ExtractedDocument[];
  }): Promise<void> {
    await fs.writeFile(this.documentsFile, JSON.stringify(data, null, 2));
  }

  async save(doc: ExtractedDocument): Promise<ExtractedDocument> {
    const data = await this.readData();

    const existingIndex = data.documents.findIndex((d) => d.id === doc.id);
    if (existingIndex >= 0) {
      doc.updatedAt = new Date().toISOString();
      data.documents[existingIndex] = doc;
    } else {
      doc.id = uuidv4();
      doc.createdAt = new Date().toISOString();
      doc.updatedAt = new Date().toISOString();
      data.documents.push(doc);
    }

    await this.writeData(data);
    return doc;
  }

  async findById(id: string): Promise<ExtractedDocument | null> {
    const data = await this.readData();
    return data.documents.find((d) => d.id === id) || null;
  }

  async list(): Promise<ExtractedDocument[]> {
    const data = await this.readData();
    return data.documents.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async search(filters: DocumentFilters): Promise<ExtractedDocument[]> {
    const data = await this.readData();
    let results = data.documents;

    if (filters.type) {
      results = results.filter((d) => d.type === filters.type);
    }

    if (filters.createdAfter) {
      const after = new Date(String(filters.createdAfter));
      results = results.filter((d) => new Date(d.createdAt) >= after);
    }

    if (filters.createdBefore) {
      const before = new Date(String(filters.createdBefore));
      results = results.filter((d) => new Date(d.createdAt) <= before);
    }

    if (filters.q !== undefined && String(filters.q).trim() !== "") {
      const q = String(filters.q).toLowerCase();
      results = results.filter((d) => {
        const haystack = `${d.type} ${d.originalText} ${JSON.stringify(
          d.extractedData
        )}`.toLowerCase();
        return haystack.includes(q);
      });
    }

    Object.entries(filters).forEach(([key, value]) => {
      if (RESERVED_FILTERS.has(key) || value === undefined) return;

      const raw = String(value);
      const parts = key.split(".");
      const maybeOp = parts[parts.length - 1];

      if (parts.length >= 2 && OPS.has(maybeOp)) {
        const fieldPath = parts.slice(0, -1).join(".");
        results = results.filter((d) =>
          matchesComparison(getByPath(d.extractedData, fieldPath), maybeOp, raw)
        );
        return;
      }

      results = results.filter((d) =>
        matchesContains(getByPath(d.extractedData, key), raw)
      );
    });

    return results.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
}
