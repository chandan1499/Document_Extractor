import {
  ExtractionSchema,
  ExtractionSchemaSummary,
  FieldDefinition,
} from "../types/index";

const NOW = "2024-01-01T00:00:00.000Z";

const BUILTIN_SUMMARIES: ExtractionSchemaSummary[] = [
  {
    id: "invoice",
    name: "Invoice",
    description:
      "Commercial invoice with vendor, customer, line items, tax, and totals",
    isBuiltin: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: "resume",
    name: "Resume",
    description:
      "Professional resume or CV with experience, education, and skills",
    isBuiltin: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: "meeting_notes",
    name: "Meeting Notes",
    description:
      "Meeting minutes with attendees, agenda, key points, and action items",
    isBuiltin: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
];

const INVOICE_FIELDS: FieldDefinition[] = [
  { key: "invoiceNumber", type: "string", required: true, label: "Invoice Number" },
  { key: "invoiceDate", type: "date", required: true, label: "Invoice Date" },
  { key: "dueDate", type: "date", required: false, label: "Due Date" },
  {
    key: "vendor",
    type: "object",
    required: true,
    properties: [
      { key: "name", type: "string", required: true },
      { key: "email", type: "email", required: false },
      { key: "address", type: "string", required: false },
    ],
  },
  { key: "total", type: "number", required: true },
  { key: "currency", type: "string", required: true },
];

const RESUME_FIELDS: FieldDefinition[] = [
  { key: "name", type: "string", required: true },
  { key: "email", type: "email", required: true },
  { key: "phone", type: "string", required: false },
  { key: "skills", type: "array", required: true, itemType: "string" },
];

const MEETING_FIELDS: FieldDefinition[] = [
  { key: "title", type: "string", required: true },
  { key: "date", type: "string", required: true },
  { key: "attendees", type: "array", required: true, itemType: "string" },
  { key: "keyPoints", type: "array", required: true, itemType: "string" },
];

const BUILTIN_DETAILS: Record<string, Omit<ExtractionSchema, "createdAt" | "updatedAt">> = {
  invoice: {
    id: "invoice",
    name: "Invoice",
    description: BUILTIN_SUMMARIES[0].description,
    jsonSchema: { type: "object" },
    prompt: "Extract invoice fields from the document.",
    fieldDefinitions: INVOICE_FIELDS,
    isBuiltin: true,
  },
  resume: {
    id: "resume",
    name: "Resume",
    description: BUILTIN_SUMMARIES[1].description,
    jsonSchema: { type: "object" },
    prompt: "Extract resume fields from the document.",
    fieldDefinitions: RESUME_FIELDS,
    isBuiltin: true,
  },
  meeting_notes: {
    id: "meeting_notes",
    name: "Meeting Notes",
    description: BUILTIN_SUMMARIES[2].description,
    jsonSchema: { type: "object" },
    prompt: "Extract meeting note fields from the document.",
    fieldDefinitions: MEETING_FIELDS,
    isBuiltin: true,
  },
};

export function listBuiltinSchemaSummaries(): ExtractionSchemaSummary[] {
  return BUILTIN_SUMMARIES;
}

export function getBuiltinSchema(id: string): ExtractionSchema | null {
  const base = BUILTIN_DETAILS[id];
  if (!base) return null;
  return {
    ...base,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

export function isBuiltinSchemaId(id: string): boolean {
  return id in BUILTIN_DETAILS;
}
