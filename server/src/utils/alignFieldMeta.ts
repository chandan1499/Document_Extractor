import { FieldDefinition, FieldMeta } from "../types.js";

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

/** Strip envelope prefix the LLM sometimes adds (e.g. data.name -> name). */
export function normalizeFieldPath(field: string): string {
  return field.replace(/^data\./, "");
}

function mergeMeta(existing: FieldMeta, incoming: FieldMeta): FieldMeta {
  const confidence = Math.min(existing.confidence, incoming.confidence);
  const reasons = [existing.reason, incoming.reason].filter(Boolean);
  const reason =
    reasons.length > 0 ? [...new Set(reasons)].join("; ") : undefined;

  return {
    field: existing.field,
    confidence,
    sourceText: existing.sourceText || incoming.sourceText,
    ...(reason ? { reason } : {}),
    alternatives: existing.alternatives ?? incoming.alternatives,
    start: existing.start ?? incoming.start,
    end: existing.end ?? incoming.end,
  };
}

/** Normalize paths and merge duplicate entries for the same field. */
export function normalizeFieldMeta(fieldMeta: FieldMeta[]): FieldMeta[] {
  const byField = new Map<string, FieldMeta>();

  for (const meta of fieldMeta) {
    const normalized: FieldMeta = {
      ...meta,
      field: normalizeFieldPath(meta.field),
    };
    const existing = byField.get(normalized.field);
    byField.set(
      normalized.field,
      existing ? mergeMeta(existing, normalized) : normalized
    );
  }

  return Array.from(byField.values());
}

/** Collect dotted paths to every scalar leaf in extracted data. */
export function collectLeafPaths(
  value: unknown,
  prefix = ""
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, idx) => {
      const path = prefix ? `${prefix}.${idx}` : String(idx);
      if (item !== null && typeof item === "object") {
        return collectLeafPaths(item, path);
      }
      return [path];
    });
  }

  if (value !== null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, child]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        if (child !== null && typeof child === "object") {
          return collectLeafPaths(child, path);
        }
        return [path];
      }
    );
  }

  return prefix ? [prefix] : [];
}

/** Ensure every extracted leaf has metadata so the UI can show confidence everywhere. */
export function ensureFieldMetaCoverage(
  data: Record<string, unknown>,
  fieldMeta: FieldMeta[]
): FieldMeta[] {
  const byField = new Map(fieldMeta.map((m) => [m.field, { ...m }]));

  for (const path of collectLeafPaths(data)) {
    if (byField.has(path)) continue;
    byField.set(path, {
      field: path,
      confidence: 0.85,
      sourceText: valueToSourceText(getByPath(data, path)),
    });
  }

  return Array.from(byField.values());
}

/** Resolve fieldMeta for a UI path, tolerating data. prefix from older extractions. */
export function getFieldMetaForPath(
  fieldMeta: FieldMeta[] | undefined,
  fieldPath: string
): FieldMeta | undefined {
  if (!fieldMeta?.length) return undefined;

  const map = new Map<string, FieldMeta>();
  for (const meta of fieldMeta) {
    map.set(normalizeFieldPath(meta.field), meta);
  }

  return map.get(fieldPath) ?? map.get(`data.${fieldPath}`);
}

/** Collect leaf paths from field definitions (fallback when data is sparse). */
export function collectLeafPathsFromDefinitions(
  fields: FieldDefinition[],
  prefix = ""
): string[] {
  const paths: string[] = [];

  for (const field of fields) {
    const path = prefix ? `${prefix}.${field.key}` : field.key;

    if (field.type === "object" && field.properties?.length) {
      paths.push(...collectLeafPathsFromDefinitions(field.properties, path));
    } else if (field.type === "array" && field.items?.length) {
      paths.push(...collectLeafPathsFromDefinitions(field.items, `${path}.0`));
    } else if (field.type === "array") {
      paths.push(`${path}.0`);
    } else {
      paths.push(path);
    }
  }

  return paths;
}
