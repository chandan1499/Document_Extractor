import { Check } from "lucide-react";

export const AUTH_FEATURES = [
  "Upload TXT, PDF, CSV, or images (OCR) — or paste text",
  "Classify type and extract structured fields (LLM + validation)",
  "Review with per-field confidence and source highlighting",
  "Save, search, filter, and export (JSON / CSV)",
  "Learn from corrections to improve future extractions",
  "Custom extraction schemas when signed in",
  "Sync guest data and unlimited extractions after sign-in",
] as const;

export default function AuthFeaturesPanel() {
  return (
    <aside
      className="flex flex-col justify-center bg-primary px-8 py-10 text-primary-foreground md:h-full md:overflow-y-auto md:px-12 md:py-16"
      aria-label="Product features"
    >
      <div className="mx-auto w-full max-w-lg">
        <p className="mb-2 text-sm font-medium uppercase tracking-wider text-primary-foreground/80">
          Document Extraction
        </p>
        <h1 className="mb-4 text-3xl font-bold leading-tight lg:text-4xl">
          Turn unstructured documents into structured data
        </h1>
        <p className="mb-8 text-primary-foreground/90">
          AI-powered extraction with human review, confidence scores, and a
          learning loop from your corrections.
        </p>
        <ul className="space-y-4">
          {AUTH_FEATURES.map((feature) => (
            <li key={feature} className="flex gap-3 text-sm lg:text-base">
              <Check
                className="mt-0.5 h-5 w-5 shrink-0 text-primary-foreground"
                aria-hidden="true"
              />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
