import { FieldMeta, ValidationIssue } from "../types/index";

export const LOW_CONFIDENCE_THRESHOLD = 0.7;

export interface RiskyField {
  field: string;
  confidence?: number;
  reason?: string;
  source: "confidence" | "validation";
}

function normalizeFieldPath(field: string): string {
  return field.replace(/^data\./, "");
}

function buildFieldMetaMap(fieldMeta: FieldMeta[] | undefined): Map<string, FieldMeta> {
  const map = new Map<string, FieldMeta>();
  for (const meta of fieldMeta ?? []) {
    const key = normalizeFieldPath(meta.field);
    const existing = map.get(key);
    if (!existing || meta.confidence < existing.confidence) {
      map.set(key, { ...meta, field: key });
    }
  }
  return map;
}

export function collectRiskyFields(opts: {
  fieldMeta?: FieldMeta[];
  validationErrors: ValidationIssue[];
  validationWarnings: ValidationIssue[];
  editedFieldPaths: Set<string>;
  threshold?: number;
}): RiskyField[] {
  const threshold = opts.threshold ?? LOW_CONFIDENCE_THRESHOLD;
  const metaMap = buildFieldMetaMap(opts.fieldMeta);
  const byField = new Map<string, RiskyField>();

  for (const [field, meta] of metaMap) {
    if (opts.editedFieldPaths.has(field)) continue;
    if (meta.confidence >= threshold) continue;

    byField.set(field, {
      field,
      confidence: meta.confidence,
      reason: meta.reason,
      source: "confidence",
    });
  }

  const applyValidation = (issue: ValidationIssue) => {
    const field = normalizeFieldPath(issue.field);
    if (opts.editedFieldPaths.has(field)) return;

    const existing = byField.get(field);
    const validationReason = issue.message;

    if (existing) {
      existing.reason = existing.reason
        ? `${existing.reason}; ${validationReason}`
        : validationReason;
      existing.source = "validation";
      return;
    }

    byField.set(field, {
      field,
      confidence: metaMap.get(field)?.confidence,
      reason: validationReason,
      source: "validation",
    });
  };

  for (const issue of opts.validationErrors) applyValidation(issue);
  for (const issue of opts.validationWarnings) applyValidation(issue);

  return Array.from(byField.values()).sort((a, b) =>
    a.field.localeCompare(b.field),
  );
}
