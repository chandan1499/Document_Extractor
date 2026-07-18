import { v4 as uuidv4 } from "uuid";
import pg from "pg";
import {
  CorrectionRepository,
  Correction,
  Guideline,
  DocType,
} from "../types.js";
import {
  CorrectionRow,
  GuidelineRow,
  rowToCorrection,
  rowToGuideline,
} from "./rowMappers.js";

export class PostgresCorrectionRepository implements CorrectionRepository {
  constructor(private pool: pg.Pool) {}

  async saveCorrection(
    correction: Correction,
    userId: string
  ): Promise<Correction> {
    if (!correction.id) {
      correction.id = uuidv4();
    }
    if (!correction.createdAt) {
      correction.createdAt = new Date().toISOString();
    }
    correction.userId = userId;

    await this.pool.query(
      `INSERT INTO corrections (
        id, doc_type, field, original_value, corrected_value,
        context_snippet, scope_key, user_explanation, user_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO NOTHING`,
      [
        correction.id,
        correction.docType,
        correction.field,
        JSON.stringify(correction.originalValue),
        JSON.stringify(correction.correctedValue),
        correction.contextSnippet ?? null,
        correction.scopeKey ?? null,
        correction.userExplanation ?? null,
        userId,
        correction.createdAt,
      ]
    );

    return correction;
  }

  async listCorrections(
    docType: DocType | undefined,
    userId: string
  ): Promise<Correction[]> {
    if (docType) {
      const result = await this.pool.query<CorrectionRow>(
        `SELECT * FROM corrections
         WHERE doc_type = $1 AND user_id = $2
         ORDER BY created_at DESC`,
        [docType, userId]
      );
      return result.rows.map(rowToCorrection);
    }

    const result = await this.pool.query<CorrectionRow>(
      "SELECT * FROM corrections WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    return result.rows.map(rowToCorrection);
  }

  async saveGuideline(guideline: Guideline, userId: string): Promise<Guideline> {
    const scopeKey = guideline.scopeKey ?? null;

    const existing = await this.pool.query<GuidelineRow>(
      `SELECT * FROM guidelines
       WHERE doc_type = $1
         AND COALESCE(scope_key, '') = COALESCE($2, '')
         AND lower(rule) = lower($3)
         AND user_id = $4`,
      [guideline.docType, scopeKey, guideline.rule, userId]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      const mergedIds = Array.from(
        new Set([
          ...row.source_correction_ids,
          ...guideline.sourceCorrectionIds,
        ])
      );

      await this.pool.query(
        `UPDATE guidelines SET source_correction_ids = $1 WHERE id = $2`,
        [JSON.stringify(mergedIds), row.id]
      );

      return {
        ...rowToGuideline(row),
        sourceCorrectionIds: mergedIds,
      };
    }

    if (!guideline.id) {
      guideline.id = uuidv4();
    }
    if (!guideline.createdAt) {
      guideline.createdAt = new Date().toISOString();
    }
    guideline.userId = userId;

    await this.pool.query(
      `INSERT INTO guidelines (
        id, doc_type, scope_key, rule, source_correction_ids, user_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING`,
      [
        guideline.id,
        guideline.docType,
        scopeKey,
        guideline.rule,
        JSON.stringify(guideline.sourceCorrectionIds),
        userId,
        guideline.createdAt,
      ]
    );

    return guideline;
  }

  async listGuidelines(
    docType: DocType | undefined,
    userId: string,
    scopeKey?: string
  ): Promise<Guideline[]> {
    const clauses: string[] = ["user_id = $1"];
    const params: unknown[] = [userId];

    if (docType) {
      params.push(docType);
      clauses.push(`doc_type = $${params.length}`);
    }

    if (scopeKey !== undefined) {
      params.push(scopeKey);
      clauses.push(`(scope_key IS NULL OR scope_key = $${params.length})`);
    }

    const where = `WHERE ${clauses.join(" AND ")}`;
    const result = await this.pool.query<GuidelineRow>(
      `SELECT * FROM guidelines ${where} ORDER BY created_at DESC`,
      params
    );

    return result.rows.map(rowToGuideline);
  }
}
