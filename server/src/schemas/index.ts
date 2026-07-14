import { z } from "zod";

const emptyToUndefined = (v: unknown) =>
  v === "" || v === null || v === undefined ? undefined : v;

const optionalEmail = z.preprocess(
  emptyToUndefined,
  z.string().email().optional()
);

const optionalString = z.preprocess(
  emptyToUndefined,
  z.string().optional()
);

const dateOnly = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return v.slice(0, 10);
  return v;
}, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"));

const optionalDateOnly = z.preprocess((v) => {
  if (v === "" || v === null || v === undefined) return undefined;
  if (typeof v !== "string") return v;
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return v.slice(0, 10);
  return v;
}, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional());

const numberFromUnknown = z.preprocess((v) => {
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return v;
}, z.number());

const optionalNumberFromUnknown = z.preprocess((v) => {
  if (v === "" || v === null || v === undefined) return undefined;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return v;
}, z.number().optional());

// Invoice schema
export const InvoiceSchema = z.object({
  invoiceNumber: z.string().describe("Unique invoice identifier"),
  invoiceDate: dateOnly.describe("Date the invoice was issued (YYYY-MM-DD)"),
  dueDate: optionalDateOnly.describe("Payment due date (YYYY-MM-DD)"),
  vendor: z.object({
    name: z.string(),
    email: optionalEmail,
    address: optionalString,
  }),
  customer: z.object({
    name: z.string(),
    email: optionalEmail,
    address: optionalString,
  }),
  lineItems: z.array(
    z.object({
      description: z.string(),
      quantity: numberFromUnknown,
      unitPrice: numberFromUnknown,
      total: numberFromUnknown,
    })
  ),
  subtotal: numberFromUnknown,
  gstRate: optionalNumberFromUnknown.describe(
    "GST/Tax rate percentage (e.g., 18 for 18%)"
  ),
  tax: numberFromUnknown.describe("Total tax/GST amount"),
  total: numberFromUnknown,
  currency: z.string().default("USD"),
  notes: optionalString,
});

export type Invoice = z.infer<typeof InvoiceSchema>;

// Resume schema
export const ResumeSchema = z.object({
  name: z.string(),
  email: z.preprocess(emptyToUndefined, z.string().email()),
  phone: optionalString,
  location: optionalString,
  summary: optionalString,
  links: z
    .object({
      linkedin: optionalString,
      github: optionalString,
    })
    .optional(),
  experience: z.array(
    z.object({
      company: z.string(),
      position: z.string(),
      startDate: z.string(),
      endDate: optionalString,
      description: optionalString,
    })
  ),
  education: z.array(
    z.object({
      school: z.string(),
      degree: z.string(),
      graduationDate: optionalString,
    })
  ),
  skills: z.array(z.string()),
});

export type Resume = z.infer<typeof ResumeSchema>;

// Meeting notes schema — accept date or datetime
export const MeetingNotesSchema = z.object({
  title: z.string(),
  date: z.string().min(1),
  attendees: z.array(z.string()),
  agenda: z.array(z.string()).optional(),
  keyPoints: z.array(z.string()),
  actionItems: z.array(
    z.object({
      task: z.string(),
      owner: optionalString,
      dueDate: optionalString,
    })
  ),
  notes: optionalString,
});

export type MeetingNotes = z.infer<typeof MeetingNotesSchema>;

// Export all for registry
export const schemas = {
  invoice: InvoiceSchema,
  resume: ResumeSchema,
  meeting_notes: MeetingNotesSchema,
};
