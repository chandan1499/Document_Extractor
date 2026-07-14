import { DocType, Validator } from "../types.js";
import { InvoiceValidators } from "../validation/invoice.js";
import { ResumeValidators } from "../validation/resume.js";
import { MeetingNotesValidators } from "../validation/meetingNotes.js";
import { TInvoiceSchema, TMeetingNotesSchema, TResumeSchema } from "./types.js";


export interface RegistryEntry {
  schema: Record<string, unknown>;
  prompt: string;
  validators: Validator[];
}

export const REGISTRY: Record<DocType, RegistryEntry> = {
  invoice: {
    schema: TInvoiceSchema,
    prompt: `You are an invoice data extractor. Extract all relevant fields from the invoice and return them as a JSON object matching this schema:
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
5. For notes field: Extract any payment terms (e.g., "Net 15", "Net 30"), special conditions, disclaimers, or general notes section - use empty string if none`,
    validators: InvoiceValidators,
  },
  resume: {
    schema: TResumeSchema,
    prompt: `You are a resume data extractor. Extract all relevant fields from the resume and return them as a JSON object.
Focus on:
- Personal information (name, email, phone, location)
- Links: LinkedIn and GitHub profile URLs (use empty strings if not found)
- Professional summary/objective
- Work experience (company, position, dates, description)
- Education (school, degree, graduation date)
- Skills

For links.linkedin and links.github, prefer full URLs when present (e.g. https://linkedin.com/in/..., https://github.com/...).
Use empty strings for missing optional text fields. Return valid JSON matching the provided schema.`,
    validators: ResumeValidators,
  },
  meeting_notes: {
    schema: TMeetingNotesSchema,
    prompt: `You are a meeting notes extractor. Extract:
- Title/meeting name
- Date and time
- Attendees list
- Agenda items (if present; empty array if none)
- Key points discussed
- Action items with owner and due date (if specified; empty strings if missing)
- General notes (empty string if none)

Return valid JSON matching the provided schema.`,
    validators: MeetingNotesValidators,
  },
};

export function getRegistryEntry(docType: DocType): RegistryEntry {
  return REGISTRY[docType];
}
