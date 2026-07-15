import { v4 as uuidv4 } from "uuid";
import pg from "pg";
import {
  DocumentRepository,
  ExtractedDocument,
  DocumentFilters,
  PaginatedResult,
} from "../types.js";
import {
  applyDocumentFilters,
  hasDynamicFilters,
} from "./documentFilters.js";
import {
  buildPaginatedResult,
  parsePagination,
} from "./pagination.js";
import { DocumentRow, rowToDocument } from "./rowMappers.js";

export class PostgresDocumentRepository implements DocumentRepository {
  constructor(private pool: pg.Pool) {}

  async save(doc: ExtractedDocument): Promise<ExtractedDocument> {
    const isNew = !doc.id;
    if (isNew) {
      doc.id = uuidv4();
      doc.createdAt = new Date().toISOString();
    }
    doc.updatedAt = new Date().toISOString();

    await this.pool.query(
      `INSERT INTO documents (
        id, type, original_text, extracted_data, applied_changes,
        validation_errors, validation_warnings, confidence, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        type = EXCLUDED.type,
        original_text = EXCLUDED.original_text,
        extracted_data = EXCLUDED.extracted_data,
        applied_changes = EXCLUDED.applied_changes,
        validation_errors = EXCLUDED.validation_errors,
        validation_warnings = EXCLUDED.validation_warnings,
        confidence = EXCLUDED.confidence,
        updated_at = EXCLUDED.updated_at`,
      [
        doc.id,
        doc.type,
        doc.originalText,
        JSON.stringify(doc.extractedData),
        doc.appliedChanges ? JSON.stringify(doc.appliedChanges) : null,
        JSON.stringify(doc.validationErrors),
        JSON.stringify(doc.validationWarnings),
        doc.confidence ?? null,
        doc.createdAt,
        doc.updatedAt,
      ]
    );

    return doc;
  }

  async findById(id: string): Promise<ExtractedDocument | null> {
    const result = await this.pool.query<DocumentRow>(
      "SELECT * FROM documents WHERE id = $1",
      [id]
    );
    if (result.rows.length === 0) return null;
    return rowToDocument(result.rows[0]);
  }

  async list(): Promise<ExtractedDocument[]> {
    const result = await this.pool.query<DocumentRow>(
      "SELECT * FROM documents ORDER BY created_at DESC"
    );
    return result.rows.map(rowToDocument);
  }

  async search(
    filters: DocumentFilters
  ): Promise<PaginatedResult<ExtractedDocument>> {
    const { page, limit } = parsePagination(filters);

    if (hasDynamicFilters(filters)) {
      const { clauses, params } = this.buildSqlClauses(filters);
      const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
      const result = await this.pool.query<DocumentRow>(
        `SELECT * FROM documents ${where} ORDER BY created_at DESC`,
        params
      );
      const filtered = applyDocumentFilters(
        result.rows.map(rowToDocument),
        filters
      );
      const total = filtered.length;
      const start = (page - 1) * limit;
      const items = filtered.slice(start, start + limit);
      return buildPaginatedResult(items, total, page, limit);
    }

    const { clauses, params } = this.buildSqlClauses(filters);
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM documents ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const offset = (page - 1) * limit;
    const dataParams = [...params, limit, offset];
    const result = await this.pool.query<DocumentRow>(
      `SELECT * FROM documents ${where} ORDER BY created_at DESC LIMIT $${
        params.length + 1
      } OFFSET $${params.length + 2}`,
      dataParams
    );

    return buildPaginatedResult(
      result.rows.map(rowToDocument),
      total,
      page,
      limit
    );
  }

  private buildSqlClauses(filters: DocumentFilters): {
    clauses: string[];
    params: unknown[];
  } {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filters.type) {
      params.push(filters.type);
      clauses.push(`type = $${params.length}`);
    }

    if (filters.createdAfter) {
      params.push(filters.createdAfter);
      clauses.push(`created_at >= $${params.length}`);
    }

    if (filters.createdBefore) {
      params.push(filters.createdBefore);
      clauses.push(`created_at <= $${params.length}`);
    }

    if (filters.q !== undefined && String(filters.q).trim() !== "") {
      params.push(`%${String(filters.q).trim()}%`);
      clauses.push(
        `(type ILIKE $${params.length} OR original_text ILIKE $${params.length} OR extracted_data::text ILIKE $${params.length})`
      );
    }

    return { clauses, params };
  }
}
