export type DocType = "invoice" | "resume" | "meeting_notes";

export interface AppliedChange {
  field: string;
  originalValue: unknown;
  correctedValue: unknown;
  rule: string;
  guideline: string;
  accepted?: boolean;
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
