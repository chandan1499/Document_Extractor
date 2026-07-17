import { ExtractionSchema, FieldDefinition } from "../types.js";
import {
  TInvoiceSchema,
  TMeetingNotesSchema,
  TResumeSchema,
} from "./types.js";

const INVOICE_PROMPT = `You are an invoice data extractor. Extract all relevant fields from the invoice and return them as a JSON object matching this schema:
{
  "invoiceNumber": "string",
  "invoiceDate": "Must be YYYY-MM-DD format (e.g., "2024-01-20")",
  "dueDate": "Must be YYYY-MM-DD format (e.g., "2024-02-20") (optional — use empty string if missing)",
  "vendor": {"name": "string", "email": "string (empty if missing)", "address": "string (empty if missing)"},
  "customer": {"name": "string", "email": "string (empty if missing)", "address": "string (empty if missing)"},
  "lineItems": [{"description": "string", "quantity": "number", "unitPrice": "number", "total": "number"}],
  "subtotal": "number (sum of line item totals before tax)",
  "gstRate": "number - GST/Tax rate as percentage (e.g., 18 for 18% GST) (use 0 if unknown)",
  "tax": "number - Total GST/tax amount",
  "total": "number (subtotal + tax)",
  "currency": "string (default USD)",
  "notes": "string - payment terms, special conditions, or empty string"
}

IMPORTANT INSTRUCTIONS:
1. Extract the GST/Tax rate percentage if visible (e.g., "18%" → 18); use 0 if not found
2. Be precise with numbers and dates (YYYY-MM-DD)
3. Ensure the total equals subtotal + tax
4. Verify gstRate calculation: (subtotal * gstRate / 100) ≈ tax
5. For notes field: Extract any payment terms (e.g., "Net 15", "Net 30"), special conditions, disclaimers, or general notes section - use empty string if none`;

const RESUME_PROMPT = `You are a resume data extractor. Extract all relevant fields from the resume and return them as a JSON object.
Focus on:
- Personal information (name, email, phone, location)
- Links: LinkedIn and GitHub profile URLs (use empty strings if not found)
- Professional summary/objective
- Work experience (company, position, dates, description)
- Education (school, degree, graduation date)
- Skills

For links.linkedin and links.github:
- Extract exactly what appears on the resume into "data".
- If the text is NOT a full URL (does not start with http:// or https:// and is not a full linkedin.com/github.com URL), treat it as an INCOMPLETE link in fieldMeta: confidence <= 0.5 and reason explaining missing URL scheme or domain.
- Examples that MUST get low confidence in fieldMeta: "chandan", "@chandan", "github/chandan" without https://github.com/...
- Only use high confidence (>= 0.9) in fieldMeta when the value is a complete URL.
Use empty strings for missing optional text fields. Return valid JSON matching the provided schema.`;

const MEETING_NOTES_PROMPT = `You are a meeting notes extractor. Extract:
- Title/meeting name
- Date and time
- Attendees list
- Agenda items (if present; empty array if none)
- Key points discussed
- Action items with owner and due date (if specified; empty strings if missing)
- General notes (empty string if none)

Return valid JSON matching the provided schema.`;

export const INVOICE_FIELD_DEFINITIONS: FieldDefinition[] = [
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
  {
    key: "customer",
    type: "object",
    required: true,
    properties: [
      { key: "name", type: "string", required: true },
      { key: "email", type: "email", required: false },
      { key: "address", type: "string", required: false },
    ],
  },
  {
    key: "lineItems",
    type: "array",
    required: true,
    items: [
      { key: "description", type: "string", required: true },
      { key: "quantity", type: "number", required: true },
      { key: "unitPrice", type: "number", required: true },
      { key: "total", type: "number", required: true },
    ],
  },
  { key: "subtotal", type: "number", required: true },
  { key: "gstRate", type: "number", required: false, description: "GST/Tax rate percentage" },
  { key: "tax", type: "number", required: true },
  { key: "total", type: "number", required: true },
  { key: "currency", type: "string", required: true },
  { key: "notes", type: "string", required: false },
];

export const RESUME_FIELD_DEFINITIONS: FieldDefinition[] = [
  { key: "name", type: "string", required: true },
  { key: "email", type: "email", required: true },
  { key: "phone", type: "string", required: false },
  { key: "location", type: "string", required: false },
  { key: "summary", type: "string", required: false },
  {
    key: "links",
    type: "object",
    required: false,
    properties: [
      { key: "linkedin", type: "string", required: false },
      { key: "github", type: "string", required: false },
    ],
  },
  {
    key: "experience",
    type: "array",
    required: true,
    items: [
      { key: "company", type: "string", required: true },
      { key: "position", type: "string", required: true },
      { key: "startDate", type: "string", required: true },
      { key: "endDate", type: "string", required: false },
      { key: "description", type: "string", required: false },
    ],
  },
  {
    key: "education",
    type: "array",
    required: true,
    items: [
      { key: "school", type: "string", required: true },
      { key: "degree", type: "string", required: true },
      { key: "graduationDate", type: "string", required: false },
    ],
  },
  { key: "skills", type: "array", required: true, itemType: "string" },
];

export const MEETING_NOTES_FIELD_DEFINITIONS: FieldDefinition[] = [
  { key: "title", type: "string", required: true },
  { key: "date", type: "string", required: true, description: "Date or datetime" },
  { key: "attendees", type: "array", required: true, itemType: "string" },
  { key: "agenda", type: "array", required: false, itemType: "string" },
  { key: "keyPoints", type: "array", required: true, itemType: "string" },
  {
    key: "actionItems",
    type: "array",
    required: true,
    items: [
      { key: "task", type: "string", required: true },
      { key: "owner", type: "string", required: false },
      { key: "dueDate", type: "string", required: false },
    ],
  },
  { key: "notes", type: "string", required: false },
];

function seedTimestamp(): string {
  return new Date().toISOString();
}

export function getBuiltinSchemaSeeds(): ExtractionSchema[] {
  const now = seedTimestamp();
  return [
    {
      id: "invoice",
      name: "Invoice",
      description: "Commercial invoice with vendor, customer, line items, tax, and totals",
      jsonSchema: TInvoiceSchema as Record<string, unknown>,
      prompt: INVOICE_PROMPT,
      fieldDefinitions: INVOICE_FIELD_DEFINITIONS,
      isBuiltin: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "resume",
      name: "Resume",
      description: "Professional resume or CV with experience, education, and skills",
      jsonSchema: TResumeSchema as Record<string, unknown>,
      prompt: RESUME_PROMPT,
      fieldDefinitions: RESUME_FIELD_DEFINITIONS,
      isBuiltin: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "meeting_notes",
      name: "Meeting Notes",
      description: "Meeting minutes with attendees, agenda, key points, and action items",
      jsonSchema: TMeetingNotesSchema as Record<string, unknown>,
      prompt: MEETING_NOTES_PROMPT,
      fieldDefinitions: MEETING_NOTES_FIELD_DEFINITIONS,
      isBuiltin: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
}
