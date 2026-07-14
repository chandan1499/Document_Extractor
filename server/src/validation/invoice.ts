import { ValidationIssue, Validator } from "../types.js";
import { Invoice } from "../schemas/index.js";

export class InvoiceTotalValidator implements Validator {
  validate(data: Record<string, unknown>): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const invoice = data as Partial<Invoice>;

    if (invoice.lineItems && invoice.subtotal !== undefined) {
      const calculatedSubtotal = invoice.lineItems.reduce(
        (sum, item) => sum + item.total,
        0
      );
      const tolerance = 0.01; // Allow 1 cent rounding difference

      if (Math.abs(calculatedSubtotal - invoice.subtotal) > tolerance) {
        issues.push({
          field: "subtotal",
          severity: "error",
          message: `Subtotal (${invoice.subtotal}) does not match sum of line items (${calculatedSubtotal})`,
        });
      }
    }

    return issues;
  }
}

export class InvoiceTaxValidator implements Validator {
  validate(data: Record<string, unknown>): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const invoice = data as Partial<Invoice>;

    if (
      invoice.subtotal !== undefined &&
      invoice.tax !== undefined &&
      invoice.total !== undefined
    ) {
      const expectedTotal = invoice.subtotal + invoice.tax;
      const tolerance = 0.01;

      if (Math.abs(expectedTotal - invoice.total) > tolerance) {
        issues.push({
          field: "total",
          severity: "error",
          message: `Total (${invoice.total}) does not equal subtotal (${invoice.subtotal}) + tax (${invoice.tax}) = ${expectedTotal}`,
        });
      }
    }

    return issues;
  }
}

export class InvoiceDateValidator implements Validator {
  validate(data: Record<string, unknown>): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const invoice = data as Partial<Invoice>;

    try {
      if (invoice.invoiceDate) {
        const date = new Date(invoice.invoiceDate as string);
        if (isNaN(date.getTime())) {
          issues.push({
            field: "invoiceDate",
            severity: "error",
            message: "Invalid invoice date format",
          });
        } else if (date > new Date()) {
          issues.push({
            field: "invoiceDate",
            severity: "warning",
            message: "Invoice date is in the future",
          });
        }
      }

      if (invoice.dueDate && invoice.invoiceDate) {
        const dueDate = new Date(invoice.dueDate as string);
        const invDate = new Date(invoice.invoiceDate as string);
        if (dueDate < invDate) {
          issues.push({
            field: "dueDate",
            severity: "error",
            message: "Due date is before invoice date",
          });
        }
      }
    } catch {
      issues.push({
        field: "invoiceDate",
        severity: "error",
        message: "Error validating dates",
      });
    }

    return issues;
  }
}

export class InvoiceGSTValidator implements Validator {
  validate(data: Record<string, unknown>): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const invoice = data as Partial<Invoice>;

    // Validate GST rate range
    if (invoice.gstRate !== undefined) {
      if (invoice.gstRate < 0 || invoice.gstRate > 100) {
        issues.push({
          field: "gstRate",
          severity: "error",
          message: `GST rate (${invoice.gstRate}%) should be between 0 and 100`,
        });
      }
    }

    // Validate GST rate matches calculated tax
    if (
      invoice.gstRate !== undefined &&
      invoice.subtotal !== undefined &&
      invoice.tax !== undefined
    ) {
      const expectedTax = (invoice.subtotal * invoice.gstRate) / 100;
      const tolerance = 1; // Allow 1 unit rounding difference

      if (Math.abs(expectedTax - invoice.tax) > tolerance) {
        issues.push({
          field: "gstRate",
          severity: "warning",
          message: `GST rate (${invoice.gstRate}%) on subtotal (${invoice.subtotal}) should equal approximately ${expectedTax}, but tax is ${invoice.tax}`,
        });
      }
    }

    return issues;
  }
}

export const InvoiceValidators: Validator[] = [
  new InvoiceTotalValidator(),
  new InvoiceTaxValidator(),
  new InvoiceDateValidator(),
  new InvoiceGSTValidator(),
];
