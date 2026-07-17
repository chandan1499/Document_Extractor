export const BUILTIN_DOC_TYPES = ["invoice", "resume", "meeting_notes"] as const;
export type BuiltinDocType = (typeof BUILTIN_DOC_TYPES)[number];
export type DocType = string;

export type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "email"
  | "array"
  | "object";

export interface FieldDefinition {
  key: string;
  label?: string;
  type: FieldType;
  required?: boolean;
  description?: string;
  itemType?: "string" | "number";
  items?: FieldDefinition[];
  properties?: FieldDefinition[];
}

export interface ExtractionSchemaSummary {
  id: string;
  name: string;
  description: string;
  isBuiltin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExtractionSchema extends ExtractionSchemaSummary {
  jsonSchema: Record<string, unknown>;
  prompt: string;
  fieldDefinitions: FieldDefinition[] | null;
}

export interface ProposedSchemaDraft {
  id: string;
  name: string;
  description: string;
  jsonSchema: Record<string, unknown>;
  prompt: string;
  fieldDefinitions: FieldDefinition[];
}

export interface AppliedChange {
  field: string;
  originalValue: unknown;
  correctedValue: unknown;
  rule: string;
  guideline: string;
  accepted?: boolean;
}

export interface FieldCandidate {
  value: unknown;
  sourceText: string;
  start?: number;
  end?: number;
}

export interface FieldMeta {
  field: string;
  confidence: number;
  sourceText: string;
  reason?: string;
  alternatives?: FieldCandidate[];
  start?: number;
  end?: number;
}

export interface ExtractedDocument {
  id: string;
  type: DocType;
  originalText: string;
  extractedData: Record<string, unknown>;
  appliedChanges?: AppliedChange[];
  validationErrors: ValidationIssue[];
  validationWarnings: ValidationIssue[];
  confidence?: number;
  fieldMeta?: FieldMeta[];
  extractionText?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ValidationIssue {
  field: string;
  severity: "error" | "warning";
  message: string;
}

export interface Guideline {
  id: string;
  docType: DocType;
  scopeKey?: string;
  rule: string;
  sourceCorrectionIds: string[];
  createdAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
