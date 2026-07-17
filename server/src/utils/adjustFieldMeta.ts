import { FieldMeta, ValidationIssue } from "../types.js";

const CONFIDENCE_CAP = {
  error: 0.5,
  warning: 0.65,
} as const;

function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
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

function valueToSourceText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

/**
 * Merge validation errors/warnings into fieldMeta confidence and reasons.
 * Creates entries for validated fields even when the LLM omitted metadata.
 */
export function adjustFieldMetaFromValidation(
  fieldMeta: FieldMeta[] | undefined,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
  data?: Record<string, unknown>
): FieldMeta[] {
  const byField = new Map<string, FieldMeta>();

  for (const meta of fieldMeta ?? []) {
    byField.set(meta.field, { ...meta });
  }

  const applyIssue = (issue: ValidationIssue) => {
    const cap =
      issue.severity === "error" ? CONFIDENCE_CAP.error : CONFIDENCE_CAP.warning;
    const existing = byField.get(issue.field);

    if (existing) {
      existing.confidence = Math.min(existing.confidence, cap);
      existing.reason = existing.reason
        ? `${existing.reason}; ${issue.message}`
        : issue.message;
      if (!existing.sourceText && data) {
        const sourceText = valueToSourceText(getByPath(data, issue.field));
        if (sourceText) existing.sourceText = sourceText;
      }
      return;
    }

    const sourceText =
      data != null ? valueToSourceText(getByPath(data, issue.field)) : "";

    byField.set(issue.field, {
      field: issue.field,
      confidence: cap,
      sourceText,
      reason: issue.message,
    });
  };

  for (const issue of errors) applyIssue(issue);
  for (const issue of warnings) applyIssue(issue);

  return Array.from(byField.values());
}
