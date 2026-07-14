import { describe, it, expect } from "vitest";
import {
  InvoiceTotalValidator,
  InvoiceTaxValidator,
  InvoiceDateValidator,
} from "../src/validation/invoice";
import { Invoice } from "../src/schemas/index";
import {
  ResumeEmailValidator,
  ResumeExperienceDatesValidator,
} from "../src/validation/resume";
import {
  MeetingAttendeesValidator,
  MeetingActionItemsValidator,
} from "../src/validation/meetingNotes";

describe("Invoice Validation", () => {
  describe("InvoiceTotalValidator", () => {
    it("should pass when subtotal matches sum of line items", () => {
      const validator = new InvoiceTotalValidator();
      const data: Partial<Invoice> = {
        lineItems: [
          { description: "Item 1", quantity: 1, unitPrice: 100, total: 100 },
          { description: "Item 2", quantity: 2, unitPrice: 50, total: 100 },
        ],
        subtotal: 200,
      };

      const issues = validator.validate(data as Record<string, unknown>);
      expect(issues).toHaveLength(0);
    });

    it("should fail when subtotal does not match sum of line items", () => {
      const validator = new InvoiceTotalValidator();
      const data: Partial<Invoice> = {
        lineItems: [
          { description: "Item 1", quantity: 1, unitPrice: 100, total: 100 },
        ],
        subtotal: 150,
      };

      const issues = validator.validate(data as Record<string, unknown>);
      expect(issues).toHaveLength(1);
      expect(issues[0].field).toBe("subtotal");
      expect(issues[0].severity).toBe("error");
    });
  });

  describe("InvoiceTaxValidator", () => {
    it("should pass when total equals subtotal + tax", () => {
      const validator = new InvoiceTaxValidator();
      const data: Partial<Invoice> = {
        subtotal: 100,
        tax: 10,
        total: 110,
      };

      const issues = validator.validate(data as Record<string, unknown>);
      expect(issues).toHaveLength(0);
    });

    it("should fail when total does not equal subtotal + tax", () => {
      const validator = new InvoiceTaxValidator();
      const data: Partial<Invoice> = {
        subtotal: 100,
        tax: 10,
        total: 120,
      };

      const issues = validator.validate(data as Record<string, unknown>);
      expect(issues).toHaveLength(1);
      expect(issues[0].field).toBe("total");
    });
  });

  describe("InvoiceDateValidator", () => {
    it("should pass with valid invoice date", () => {
      const validator = new InvoiceDateValidator();
      const data: Partial<Invoice> = {
        invoiceDate: new Date("2024-01-15").toISOString(),
      };

      const issues = validator.validate(data as Record<string, unknown>);
      expect(issues).toHaveLength(0);
    });

    it("should warn when invoice date is in the future", () => {
      const validator = new InvoiceDateValidator();
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      const data: Partial<Invoice> = {
        invoiceDate: futureDate.toISOString(),
      };

      const issues = validator.validate(data as Record<string, unknown>);
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe("warning");
    });

    it("should fail when due date is before invoice date", () => {
      const validator = new InvoiceDateValidator();
      const data: Partial<Invoice> = {
        invoiceDate: new Date("2024-01-15").toISOString(),
        dueDate: new Date("2024-01-10").toISOString(),
      };

      const issues = validator.validate(data as Record<string, unknown>);
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe("error");
    });
  });
});

describe("Resume validators", () => {
  it("flags missing email", () => {
    const issues = new ResumeEmailValidator().validate({
      name: "A",
      email: "",
    });
    expect(issues.some((i) => i.field === "email")).toBe(true);
  });

  it("warns when endDate is before startDate", () => {
    const issues = new ResumeExperienceDatesValidator().validate({
      experience: [
        {
          company: "X",
          position: "Y",
          startDate: "2024-01",
          endDate: "2023-01",
        },
      ],
    });
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe("Meeting notes validators", () => {
  it("warns when attendees list is empty", () => {
    const issues = new MeetingAttendeesValidator().validate({ attendees: [] });
    expect(issues[0]?.severity).toBe("warning");
  });

  it("flags action items missing task text", () => {
    const issues = new MeetingActionItemsValidator().validate({
      actionItems: [{ task: "", owner: "A", dueDate: "2025-01-01" }],
    });
    expect(issues.some((i) => i.severity === "error")).toBe(true);
  });
});
