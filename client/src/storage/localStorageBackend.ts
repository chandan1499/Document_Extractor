import {
  Correction,
  ExtractedDocument,
  ExtractionSchema,
  ExtractionSchemaSummary,
  Guideline,
  PaginatedResult,
} from "../types/index";
import {
  getBuiltinSchema,
  isBuiltinSchemaId,
  listBuiltinSchemaSummaries,
} from "./builtinSchemas";
import { buildLocalSchemaPayload } from "./buildLocalSchema";
import {
  readJsonArray,
  readJsonRecord,
  STORAGE_KEYS,
  writeJsonArray,
  writeJsonRecord,
} from "./localPersistence";
import { DocumentFilters, StorageService } from "./types";
import * as api from "../services/api";

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function getByPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

function matchesComparison(value: unknown, op: string, raw: string): boolean {
  const num = Number(raw);
  const left = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(left) || Number.isNaN(num)) {
    return String(value ?? "").toLowerCase().includes(raw.toLowerCase());
  }
  switch (op) {
    case "gt":
      return left > num;
    case "gte":
      return left >= num;
    case "lt":
      return left < num;
    case "lte":
      return left <= num;
    case "eq":
      return left === num;
    default:
      return String(value ?? "").toLowerCase().includes(raw.toLowerCase());
  }
}

function filterDocuments(
  items: ExtractedDocument[],
  filters: DocumentFilters = {}
): ExtractedDocument[] {
  let results = [...items];

  if (filters.type) {
    results = results.filter((d) => d.type === filters.type);
  }

  if (filters.q && String(filters.q).trim()) {
    const q = String(filters.q).trim().toLowerCase();
    results = results.filter((d) => {
      const haystack = `${d.type} ${d.originalText} ${JSON.stringify(d.extractedData)}`.toLowerCase();
      return haystack.includes(q);
    });
  }

  for (const [key, rawValue] of Object.entries(filters)) {
    if (["page", "limit", "type", "q"].includes(key) || rawValue === undefined) {
      continue;
    }
    const raw = String(rawValue);
    const parts = key.split(".");
    const maybeOp = parts.length > 1 ? parts.pop() : "";
    const fieldPath = parts.join(".");
    if (!fieldPath || !raw) continue;
    results = results.filter((d) =>
      matchesComparison(
        getByPath(d.extractedData, fieldPath),
        maybeOp || "",
        raw
      )
    );
  }

  results.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return results;
}

function readCustomSchemas(): Record<string, ExtractionSchema> {
  return readJsonRecord<ExtractionSchema>(STORAGE_KEYS.schemas);
}

function writeCustomSchemas(schemas: Record<string, ExtractionSchema>): void {
  writeJsonRecord(STORAGE_KEYS.schemas, schemas);
}

export const localStorageBackend: StorageService = {
  async listDocuments(filters = {}) {
    const all = readJsonArray<ExtractedDocument>(STORAGE_KEYS.documents);
    const filtered = filterDocuments(all, filters);
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.max(1, Number(filters.limit) || 20);
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);
    const totalPages = Math.max(1, Math.ceil(filtered.length / limit));

    return {
      items,
      total: filtered.length,
      page,
      limit,
      totalPages,
    } satisfies PaginatedResult<ExtractedDocument>;
  },

  async getDocument(id) {
    const all = readJsonArray<ExtractedDocument>(STORAGE_KEYS.documents);
    return all.find((d) => d.id === id) ?? null;
  },

  async saveDocument(doc) {
    const all = readJsonArray<ExtractedDocument>(STORAGE_KEYS.documents);
    const now = new Date().toISOString();
    const saved: ExtractedDocument = {
      ...doc,
      id: doc.id || crypto.randomUUID(),
      createdAt: doc.createdAt || now,
      updatedAt: now,
    };
    const next = all.filter((d) => d.id !== saved.id);
    next.unshift(saved);
    writeJsonArray(STORAGE_KEYS.documents, next);
    return saved;
  },

  async listSchemas() {
    const custom = Object.values(readCustomSchemas()).map(
      (s): ExtractionSchemaSummary => ({
        id: s.id,
        name: s.name,
        description: s.description,
        isBuiltin: false,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })
    );
    return [...listBuiltinSchemaSummaries(), ...custom].sort((a, b) => {
      if (a.isBuiltin !== b.isBuiltin) return a.isBuiltin ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  },

  async getSchema(id) {
    const builtin = getBuiltinSchema(id);
    if (builtin) return builtin;
    return readCustomSchemas()[id] ?? null;
  },

  async saveSchema(payload) {
    const schemas = readCustomSchemas();
    const schemaId = payload.id?.trim() || slugify(payload.name);
    if (!schemaId) {
      throw new Error("Invalid schema id");
    }
    if (isBuiltinSchemaId(schemaId)) {
      throw new Error("Cannot modify built-in schema");
    }
    const existing = schemas[schemaId];
    const built = buildLocalSchemaPayload(
      schemaId,
      payload.name.trim(),
      (payload.description ?? "").trim(),
      payload.fieldDefinitions,
      payload.prompt?.trim() ||
        `Extract ${payload.name.trim()} fields from the document.`
    );
    const saved: ExtractionSchema = {
      ...built,
      createdAt: existing?.createdAt ?? built.createdAt,
      updatedAt: new Date().toISOString(),
    };
    schemas[schemaId] = saved;
    writeCustomSchemas(schemas);
    return saved;
  },

  async deleteSchema(id) {
    if (isBuiltinSchemaId(id)) {
      throw new Error("Cannot delete built-in schema");
    }
    const schemas = readCustomSchemas();
    delete schemas[id];
    writeCustomSchemas(schemas);
  },

  async proposeSchema(payload) {
    return api.proposeSchema(payload);
  },

  async listGuidelines(docType) {
    const all = readJsonArray<Guideline>(STORAGE_KEYS.guidelines);
    if (!docType) return all;
    return all.filter((g) => g.docType === docType);
  },

  async submitCorrectionsBatch(_docId, docType, originalText, corrections, learningNotes) {
    const result = await api.extractLearningRules(docType, corrections, learningNotes);
    const storedCorrections = readJsonArray<Correction>(STORAGE_KEYS.corrections);
    const now = new Date().toISOString();
    for (const item of corrections) {
      storedCorrections.push({
        id: crypto.randomUUID(),
        docType: docType as import("../types/index").DocType,
        field: item.field,
        originalValue: item.originalValue,
        correctedValue: item.correctedValue,
        contextSnippet: originalText.slice(0, 200),
        userExplanation: learningNotes?.trim(),
        createdAt: now,
      });
    }
    writeJsonArray(STORAGE_KEYS.corrections, storedCorrections);

    const guidelines = readJsonArray<Guideline>(STORAGE_KEYS.guidelines);
    for (const guideline of result.guidelines) {
      guidelines.push({
        ...guideline,
        id: guideline.id || crypto.randomUUID(),
        docType: docType as import("../types/index").DocType,
        createdAt: guideline.createdAt || now,
      });
    }
    writeJsonArray(STORAGE_KEYS.guidelines, guidelines);

    return result;
  },
};

export function getLocalDataBundle() {
  return {
    documents: readJsonArray<ExtractedDocument>(STORAGE_KEYS.documents),
    schemas: Object.values(readCustomSchemas()),
    corrections: readJsonArray<Correction>(STORAGE_KEYS.corrections),
    guidelines: readJsonArray<Guideline>(STORAGE_KEYS.guidelines),
  };
}
