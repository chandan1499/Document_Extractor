// Document types
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
  /** Primitive type for arrays of strings/numbers */
  itemType?: "string" | "number";
  /** Schema for array items when type is array of objects */
  items?: FieldDefinition[];
  /** Nested object properties when type is object */
  properties?: FieldDefinition[];
}

export interface ExtractionSchema {
  id: string;
  name: string;
  description: string;
  jsonSchema: Record<string, unknown>;
  prompt: string;
  fieldDefinitions: FieldDefinition[] | null;
  isBuiltin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SchemaTypeInfo {
  id: string;
  name: string;
  description: string;
  isBuiltin: boolean;
}

export interface ProposedSchemaDraft {
  id: string;
  name: string;
  description: string;
  jsonSchema: Record<string, unknown>;
  prompt: string;
  fieldDefinitions: FieldDefinition[];
}

export interface SchemaRepository {
  list(): Promise<ExtractionSchema[]>;
  findById(id: string): Promise<ExtractionSchema | null>;
  save(schema: ExtractionSchema): Promise<ExtractionSchema>;
  delete(id: string): Promise<boolean>;
  upsertIfMissing(schema: ExtractionSchema): Promise<void>;
}

// Applied guideline change
export interface AppliedChange {
  field: string;
  originalValue: unknown;
  correctedValue: unknown;
  rule: string;
  guideline: string;
  accepted?: boolean;
}

// Extracted document
export interface ExtractedDocument {
  id: string;
  type: DocType;
  originalText: string;
  extractedData: Record<string, unknown>;
  appliedChanges?: AppliedChange[];
  validationErrors: ValidationIssue[];
  validationWarnings: ValidationIssue[];
  confidence?: number;
  createdAt: string;
  updatedAt: string;
}

// Validation
export interface ValidationIssue {
  field: string;
  severity: "error" | "warning";
  message: string;
}

export interface Validator {
  validate(data: Record<string, unknown>, docType: DocType): ValidationIssue[];
}

// Correction store
export interface Correction {
  id: string;
  docType: DocType;
  field: string;
  originalValue: unknown;
  correctedValue: unknown;
  contextSnippet?: string;
  scopeKey?: string; // e.g., vendor name
  userExplanation?: string;
  createdAt: string;
}

export interface Guideline {
  id: string;
  docType: DocType;
  scopeKey?: string;
  rule: string;
  sourceCorrectionIds: string[];
  createdAt: string;
}

// Pagination
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Repository
export interface DocumentRepository {
  save(doc: ExtractedDocument): Promise<ExtractedDocument>;
  findById(id: string): Promise<ExtractedDocument | null>;
  list(): Promise<ExtractedDocument[]>;
  search(filters: DocumentFilters): Promise<PaginatedResult<ExtractedDocument>>;
}

export interface DocumentFilters {
  type?: DocType;
  createdAfter?: string;
  createdBefore?: string;
  /** Free-text search over type, originalText, and extractedData */
  q?: string;
  page?: number;
  limit?: number;
  [key: string]: unknown; // Nested paths (vendor.name) and ops (total.gt)
}

export interface CorrectionRepository {
  saveCorrection(correction: Correction): Promise<Correction>;
  listCorrections(docType?: DocType): Promise<Correction[]>;
  saveGuideline(guideline: Guideline): Promise<Guideline>;
  listGuidelines(docType?: DocType, scopeKey?: string): Promise<Guideline[]>;
}

/** One field changed by a learned guideline during extraction */
export interface ExtractionChange {
  field: string;
  originalValue: unknown;
  correctedValue: unknown;
  rule: string;
}

/** Result of a single LLM extract call */
export interface ExtractResult<T> {
  data: T;
  appliedChanges?: ExtractionChange[];
}

export interface CorrectionInput {
  field: string;
  originalValue: unknown;
  correctedValue: unknown;
}

// LLM Provider
export interface LLMProvider {
  classify(
    text: string,
    types: SchemaTypeInfo[]
  ): Promise<DocType>;
  extract<T>(
    text: string,
    schema: Record<string, unknown>,
    prompt: string,
    guidelines?: Guideline[]
  ): Promise<ExtractResult<T>>;
  /** Parse one user learning note into distinct reusable extraction rules */
  extractLearningRules(
    docType: DocType,
    corrections: CorrectionInput[],
    learningNotes: string
  ): Promise<string[]>;
  proposeSchema(
    sampleText: string,
    hint?: { name?: string; description?: string }
  ): Promise<FieldDefinition[]>;
}
