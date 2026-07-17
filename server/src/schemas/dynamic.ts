import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { FieldDefinition } from "../types.js";
import { normalizeForStrictMode } from "./strictJsonSchema.js";

const emptyToUndefined = (v: unknown) =>
  v === "" || v === null || v === undefined ? undefined : v;

function dateOnlySchema(required: boolean) {
  const base = z.preprocess((v) => {
    if (typeof v !== "string") return v;
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return v.slice(0, 10);
    return v;
  }, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"));

  if (required) return base;
  return z.preprocess(emptyToUndefined, base.optional());
}

function stringSchema(required: boolean) {
  if (required) return z.string();
  return z.preprocess(emptyToUndefined, z.string().optional());
}

function emailSchema(required: boolean) {
  if (required) {
    return z.preprocess(emptyToUndefined, z.string().email());
  }
  return z.preprocess(emptyToUndefined, z.string().email().optional());
}

function numberSchema(required: boolean) {
  const num = z.preprocess((v) => {
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
      return Number(v);
    }
    return v;
  }, z.number());

  if (required) return num;
  return z.preprocess(emptyToUndefined, num.optional());
}

function booleanSchema(required: boolean) {
  if (required) return z.boolean();
  return z.preprocess(emptyToUndefined, z.boolean().optional());
}

export function buildZodFromField(field: FieldDefinition): z.ZodTypeAny {
  const required = field.required !== false;

  switch (field.type) {
    case "string":
      return stringSchema(required);
    case "email":
      return emailSchema(required);
    case "date":
      return dateOnlySchema(required);
    case "number":
      return numberSchema(required);
    case "boolean":
      return booleanSchema(required);
    case "array": {
      if (field.itemType === "string") {
        const arr = z.array(z.string());
        return required ? arr : arr.optional();
      }
      if (field.itemType === "number") {
        const arr = z.array(z.number());
        return required ? arr : arr.optional();
      }
      if (field.items && field.items.length > 0) {
        const itemShape: Record<string, z.ZodTypeAny> = {};
        for (const itemField of field.items) {
          itemShape[itemField.key] = buildZodFromField(itemField);
        }
        const arr = z.array(z.object(itemShape));
        return required ? arr : arr.optional();
      }
      const fallback = z.array(z.unknown());
      return required ? fallback : fallback.optional();
    }
    case "object": {
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const prop of field.properties ?? []) {
        shape[prop.key] = buildZodFromField(prop);
      }
      const obj = z.object(shape);
      return required ? obj : obj.optional();
    }
    default:
      return required ? z.unknown() : z.unknown().optional();
  }
}

export function buildZodFromFields(
  fields: FieldDefinition[]
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    shape[field.key] = buildZodFromField(field);
  }
  return z.object(shape);
}

export function buildPromptFromFields(
  fields: FieldDefinition[],
  schemaName?: string
): string {
  const title = schemaName ? `${schemaName} data extractor` : "Document data extractor";
  const lines = fields.map((f) => {
    const label = f.label || f.key;
    const req = f.required !== false ? "required" : "optional";
    const desc = f.description ? ` — ${f.description}` : "";
    if (f.type === "object" && f.properties?.length) {
      const nested = f.properties
        .map((p) => `    "${p.key}": ${p.type}${p.required !== false ? "" : " (optional)"}`)
        .join("\n");
      return `- ${label} (object, ${req}):\n${nested}${desc}`;
    }
    if (f.type === "array") {
      return `- ${label} (array, ${req})${desc}`;
    }
    return `- ${label} (${f.type}, ${req})${desc}`;
  });

  return `You are a ${title}. Extract all relevant fields from the document and return them as a JSON object matching the provided schema.

Fields to extract:
${lines.join("\n")}

Use empty strings for missing optional text fields. Return valid JSON matching the provided schema.`;
}

export function buildSchemaFromFields(fields: FieldDefinition[]): {
  jsonSchema: Record<string, unknown>;
  prompt: string;
  zodSchema: z.ZodObject<Record<string, z.ZodTypeAny>>;
} {
  const zodSchema = buildZodFromFields(fields);
  const rawJsonSchema = zodToJsonSchema(zodSchema, {
    target: "openApi3",
    $refStrategy: "none",
  }) as Record<string, unknown>;

  const jsonSchema = normalizeForStrictMode(rawJsonSchema);
  const prompt = buildPromptFromFields(fields);

  return { jsonSchema, prompt, zodSchema };
}

export function slugifySchemaId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 64);
}
