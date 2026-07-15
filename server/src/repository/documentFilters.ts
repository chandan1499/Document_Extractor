import { DocumentFilters, ExtractedDocument } from "../types.js";

export const RESERVED_FILTERS = new Set([
  "type",
  "createdAfter",
  "createdBefore",
  "q",
  "page",
  "limit",
]);

const OPS = new Set(["gt", "gte", "lt", "lte", "eq"]);

export function getByPath(obj: unknown, fieldPath: string): unknown {
  return fieldPath.split(".").reduce<unknown>((acc, key) => {
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

function matchesComparison(
  fieldValue: unknown,
  op: string,
  raw: string
): boolean {
  const left = Number(fieldValue);
  const right = Number(raw);
  if (Number.isNaN(left) || Number.isNaN(right)) {
    if (op === "eq") {
      return String(fieldValue ?? "").toLowerCase() === raw.toLowerCase();
    }
    return false;
  }
  switch (op) {
    case "gt":
      return left > right;
    case "gte":
      return left >= right;
    case "lt":
      return left < right;
    case "lte":
      return left <= right;
    case "eq":
      return left === right;
    default:
      return false;
  }
}

function matchesContains(fieldValue: unknown, raw: string): boolean {
  if (fieldValue === undefined || fieldValue === null) return false;
  if (typeof fieldValue === "object") {
    return JSON.stringify(fieldValue).toLowerCase().includes(raw.toLowerCase());
  }
  return String(fieldValue).toLowerCase().includes(raw.toLowerCase());
}

export function hasDynamicFilters(filters: DocumentFilters): boolean {
  return Object.keys(filters).some(
    (key) => !RESERVED_FILTERS.has(key) && filters[key] !== undefined
  );
}

export function applyDocumentFilters(
  documents: ExtractedDocument[],
  filters: DocumentFilters
): ExtractedDocument[] {
  let results = documents;

  if (filters.type) {
    results = results.filter((d) => d.type === filters.type);
  }

  if (filters.createdAfter) {
    const after = new Date(String(filters.createdAfter));
    results = results.filter((d) => new Date(d.createdAt) >= after);
  }

  if (filters.createdBefore) {
    const before = new Date(String(filters.createdBefore));
    results = results.filter((d) => new Date(d.createdAt) <= before);
  }

  if (filters.q !== undefined && String(filters.q).trim() !== "") {
    const q = String(filters.q).toLowerCase();
    results = results.filter((d) => {
      const haystack = `${d.type} ${d.originalText} ${JSON.stringify(
        d.extractedData
      )}`.toLowerCase();
      return haystack.includes(q);
    });
  }

  Object.entries(filters).forEach(([key, value]) => {
    if (RESERVED_FILTERS.has(key) || value === undefined) return;

    const raw = String(value);
    const parts = key.split(".");
    const maybeOp = parts[parts.length - 1];

    if (parts.length >= 2 && OPS.has(maybeOp)) {
      const fieldPath = parts.slice(0, -1).join(".");
      results = results.filter((d) =>
        matchesComparison(getByPath(d.extractedData, fieldPath), maybeOp, raw)
      );
      return;
    }

    results = results.filter((d) =>
      matchesContains(getByPath(d.extractedData, key), raw)
    );
  });

  return results.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
