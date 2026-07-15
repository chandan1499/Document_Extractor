import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import {
  DocumentRepository,
  ExtractedDocument,
  DocumentFilters,
  PaginatedResult,
} from "../types.js";
import { applyDocumentFilters } from "./documentFilters.js";
import { paginateArray, parsePagination } from "./pagination.js";

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

  async search(
    filters: DocumentFilters
  ): Promise<PaginatedResult<ExtractedDocument>> {
    const { page, limit } = parsePagination(filters);
    const data = await this.readData();
    const filtered = applyDocumentFilters(data.documents, filters);
    return paginateArray(filtered, page, limit);
  }
}
