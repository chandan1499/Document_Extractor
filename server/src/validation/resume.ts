import { ValidationIssue, Validator } from "../types.js";

export class ResumeEmailValidator implements Validator {
  validate(data: Record<string, unknown>): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const email = data.email;

    if (email === undefined || email === null || String(email).trim() === "") {
      issues.push({
        field: "email",
        severity: "error",
        message: "Resume email is required",
      });
      return issues;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
      issues.push({
        field: "email",
        severity: "error",
        message: "Resume email format looks invalid",
      });
    }

    return issues;
  }
}

export class ResumeExperienceDatesValidator implements Validator {
  validate(data: Record<string, unknown>): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const experience = data.experience;

    if (!Array.isArray(experience)) return issues;

    experience.forEach((item, idx) => {
      if (!item || typeof item !== "object") return;
      const exp = item as Record<string, unknown>;
      const start = String(exp.startDate || "");
      const end = String(exp.endDate || "");
      if (!start || !end) return;

      // Compare YYYY-MM or YYYY-MM-DD lexicographically when formats align
      if (end < start) {
        issues.push({
          field: `experience.${idx}.endDate`,
          severity: "warning",
          message: `End date (${end}) is before start date (${start})`,
        });
      }
    });

    return issues;
  }
}

export class ResumeSkillsValidator implements Validator {
  validate(data: Record<string, unknown>): ValidationIssue[] {
    const skills = data.skills;
    if (!Array.isArray(skills) || skills.length === 0) {
      return [
        {
          field: "skills",
          severity: "warning",
          message: "No skills listed on resume",
        },
      ];
    }
    return [];
  }
}

export const ResumeValidators: Validator[] = [
  new ResumeEmailValidator(),
  new ResumeExperienceDatesValidator(),
  new ResumeSkillsValidator(),
];
