import {
  AppliedChange,
  Correction,
  DocType,
  ExtractedDocument,
  FieldMeta,
  Guideline,
  ValidationIssue,
} from "../types.js";

export interface DocumentRow {
  id: string;
  type: string;
  original_text: string;
  extracted_data: Record<string, unknown>;
  applied_changes: AppliedChange[] | null;
  validation_errors: ValidationIssue[];
  validation_warnings: ValidationIssue[];
  confidence: number | null;
  field_metadata: FieldMeta[] | null;
  extraction_text: string | null;
  user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CorrectionRow {
  id: string;
  doc_type: string;
  field: string;
  original_value: unknown;
  corrected_value: unknown;
  context_snippet: string | null;
  scope_key: string | null;
  user_explanation: string | null;
  user_id: string | null;
  created_at: Date;
}

export interface GuidelineRow {
  id: string;
  doc_type: string;
  scope_key: string | null;
  rule: string;
  source_correction_ids: string[];
  user_id: string | null;
  created_at: Date;
}

export function rowToDocument(row: DocumentRow): ExtractedDocument {
  return {
    id: row.id,
    type: row.type as DocType,
    originalText: row.original_text,
    extractedData: row.extracted_data ?? {},
    appliedChanges: row.applied_changes ?? undefined,
    validationErrors: row.validation_errors ?? [],
    validationWarnings: row.validation_warnings ?? [],
    confidence: row.confidence ?? undefined,
    fieldMeta: row.field_metadata ?? undefined,
    extractionText: row.extraction_text ?? undefined,
    userId: row.user_id ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function rowToCorrection(row: CorrectionRow): Correction {
  return {
    id: row.id,
    docType: row.doc_type as DocType,
    field: row.field,
    originalValue: row.original_value,
    correctedValue: row.corrected_value,
    contextSnippet: row.context_snippet ?? undefined,
    scopeKey: row.scope_key ?? undefined,
    userExplanation: row.user_explanation ?? undefined,
    userId: row.user_id ?? undefined,
    createdAt: row.created_at.toISOString(),
  };
}

export function rowToGuideline(row: GuidelineRow): Guideline {
  return {
    id: row.id,
    docType: row.doc_type as DocType,
    scopeKey: row.scope_key ?? undefined,
    rule: row.rule,
    sourceCorrectionIds: row.source_correction_ids ?? [],
    userId: row.user_id ?? undefined,
    createdAt: row.created_at.toISOString(),
  };
}
