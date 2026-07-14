const ACRONYMS = new Set(["GST", "ID", "URL", "PDF", "CSV", "API"]);

const SPECIAL_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  github: "GitHub",
};

/**
 * Convert camelCase / snake_case / dotted field paths to human-readable labels.
 * e.g. invoiceNumber → "Invoice Number", vendor.name → "Vendor › Name"
 */
export function humanizeLabel(field: string): string {
  return field
    .split(".")
    .map((part) => {
      if (SPECIAL_LABELS[part.toLowerCase()]) {
        return SPECIAL_LABELS[part.toLowerCase()];
      }
      return part
        .replace(/_/g, " ")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => {
          const upper = word.toUpperCase();
          if (ACRONYMS.has(upper)) return upper;
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(" ");
    })
    .join(" › ");
}
