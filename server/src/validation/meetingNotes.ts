import { ValidationIssue, Validator } from "../types.js";

export class MeetingAttendeesValidator implements Validator {
  validate(data: Record<string, unknown>): ValidationIssue[] {
    const attendees = data.attendees;
    if (!Array.isArray(attendees) || attendees.length === 0) {
      return [
        {
          field: "attendees",
          severity: "warning",
          message: "Attendees list is empty",
        },
      ];
    }
    return [];
  }
}

export class MeetingActionItemsValidator implements Validator {
  validate(data: Record<string, unknown>): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const actionItems = data.actionItems;

    if (!Array.isArray(actionItems)) return issues;

    actionItems.forEach((item, idx) => {
      if (!item || typeof item !== "object") return;
      const task = (item as Record<string, unknown>).task;
      if (task === undefined || task === null || String(task).trim() === "") {
        issues.push({
          field: `actionItems.${idx}.task`,
          severity: "error",
          message: "Action item is missing task text",
        });
      }
    });

    return issues;
  }
}

export const MeetingNotesValidators: Validator[] = [
  new MeetingAttendeesValidator(),
  new MeetingActionItemsValidator(),
];
