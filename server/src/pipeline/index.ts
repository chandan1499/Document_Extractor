import {
  LLMProvider,
  DocType,
  ValidationIssue,
  ExtractedDocument,
  Guideline,
  ExtractionChange,
} from "../types.js";
import { getRegistryEntry } from "../registry/index.js";
import { schemas } from "../schemas/index.js";
import { logger } from "../config/logger.js";

/**
 * Ingestion: accept raw input in various formats
 */
export async function ingest(
  input: string | Buffer
): Promise<{ text: string; format: string }> {
  let text: string;

  if (typeof input === "string") {
    text = input;
  } else if (Buffer.isBuffer(input)) {
    text = input.toString("utf-8");
  } else {
    throw new Error("Invalid input format");
  }

  return { text, format: "text" };
}

/**
 * Preprocess: clean and normalize text
 */
export function preprocess(text: string): string {
  return text
    .replace(/page \d+ of \d+/gi, "")
    .replace(/confidential/gi, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

/**
 * Classification: determine document type
 */
export async function classify(
  text: string,
  llmProvider: LLMProvider
): Promise<DocType> {
  try {
    const docType = await llmProvider.classify(text);
    logger.info({ docType }, "Document classified");
    return docType;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMsg }, "Classification failed");
    throw new Error(`Classification failed: ${errorMsg}`);
  }
}

/**
 * Extraction: use LLM to extract structured data (single call).
 * When guidelines are present the provider returns data + appliedChanges
 * in one envelope response.
 */
export async function extract<T>(
  text: string,
  docType: DocType,
  llmProvider: LLMProvider,
  guidelines?: Guideline[]
): Promise<{
  data: T;
  rawResponse: string;
  appliedChanges?: ExtractionChange[];
}> {
  try {
    const entry = getRegistryEntry(docType);

    const { data, appliedChanges } = await llmProvider.extract<T>(
      text,
      entry.schema,
      entry.prompt,
      guidelines
    );

    logger.info(
      { docType, changesApplied: appliedChanges?.length || 0 },
      "Data extracted"
    );
    return {
      data,
      rawResponse: JSON.stringify(data),
      appliedChanges,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMsg }, "Extraction failed");
    throw new Error(`Extraction failed: ${errorMsg}`);
  }
}

/**
 * Validation: structural (Zod) + semantic (custom validators)
 */
export function validate(
  data: Record<string, unknown>,
  docType: DocType
): { errors: ValidationIssue[]; warnings: ValidationIssue[] } {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // Structural validation (Zod)
  const schemaValidator = schemas[docType];
  if (schemaValidator) {
    const result = schemaValidator.safeParse(data);
    if (!result.success) {
      result.error.errors.forEach((err) => {
        errors.push({
          field: err.path.join("."),
          severity: "error",
          message: err.message,
        });
      });
    }
  }

  // Semantic validation (custom validators)
  const entry = getRegistryEntry(docType);
  entry.validators.forEach((validator) => {
    const issues = validator.validate(data, docType);
    issues.forEach((issue) => {
      if (issue.severity === "error") {
        errors.push(issue);
      } else {
        warnings.push(issue);
      }
    });
  });

  logger.info(
    { docType, errorCount: errors.length, warningCount: warnings.length },
    "Validation complete"
  );

  return { errors, warnings };
}

/**
 * Full pipeline orchestration
 */
export async function extractDocument(
  rawInput: string | Buffer,
  llmProvider: LLMProvider,
  guidelines?: Guideline[],
  guidelineLoader?: (docType: string) => Promise<Guideline[]>
): Promise<ExtractedDocument> {
  try {
    // Ingest
    const ingested = await ingest(rawInput);

    // Preprocess
    const cleaned = preprocess(ingested.text);

    // Classify
    const docType = await classify(cleaned, llmProvider);

    // Load guidelines after classification if loader is provided
    let applicableGuidelines = guidelines || [];
    if (guidelineLoader && (!guidelines || guidelines.length === 0)) {
      try {
        applicableGuidelines = await guidelineLoader(docType);
        logger.info(
          { docType, guidelineCount: applicableGuidelines.length },
          "Guidelines loaded after classification"
        );
      } catch (error) {
        logger.warn(error, "Failed to load guidelines after classification");
      }
    }

    // Extract (single LLM call; envelope includes appliedChanges when guidelines exist)
    const { data, appliedChanges } = await extract<Record<string, unknown>>(
      cleaned,
      docType,
      llmProvider,
      applicableGuidelines
    );

    // Validate
    const { errors, warnings } = validate(data, docType);

    // Build extracted document
    const doc: ExtractedDocument = {
      id: "", // Will be assigned on save
      type: docType,
      originalText: ingested.text,
      extractedData: data,
      appliedChanges: appliedChanges
        ? appliedChanges.map((change) => ({
            field: change.field,
            originalValue: change.originalValue,
            correctedValue: change.correctedValue,
            rule: change.rule,
            guideline: change.rule,
            accepted: false,
          }))
        : undefined,
      validationErrors: errors,
      validationWarnings: warnings,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return doc;
  } catch (error) {
    logger.error(error, "Pipeline failed");
    throw error;
  }
}
