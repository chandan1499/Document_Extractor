import {
  LLMProvider,
  DocType,
  ValidationIssue,
  ExtractedDocument,
  Guideline,
  ExtractionChange,
  SchemaTypeInfo,
  FieldMeta,
} from "../types.js";
import { SchemaRegistry } from "../registry/index.js";
import { buildZodFromFields } from "../schemas/dynamic.js";
import { logger } from "../config/logger.js";
import { averageConfidence, locateFieldMeta } from "../utils/locateSpans.js";
import { adjustFieldMetaFromValidation } from "../utils/adjustFieldMeta.js";
import {
  ensureFieldMetaCoverage,
  normalizeFieldMeta,
} from "../utils/alignFieldMeta.js";

export interface ExtractDocumentOptions {
  schemaId?: string;
}

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
 * Classification: determine document type among registered schemas
 */
export async function classify(
  text: string,
  llmProvider: LLMProvider,
  types: SchemaTypeInfo[]
): Promise<DocType> {
  if (types.length === 0) {
    throw new Error("No schemas registered for classification");
  }
  if (types.length === 1) {
    return types[0].id;
  }

  try {
    const docType = await llmProvider.classify(text, types);
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
 */
export async function extract<T>(
  text: string,
  docType: DocType,
  llmProvider: LLMProvider,
  schemaRegistry: SchemaRegistry,
  userId: string,
  guidelines?: Guideline[]
): Promise<{
  data: T;
  rawResponse: string;
  appliedChanges?: ExtractionChange[];
  fieldMeta?: FieldMeta[];
}> {
  try {
    const entry = await schemaRegistry.getEntry(docType, userId);

    const { data, appliedChanges, fieldMeta } = await llmProvider.extract<T>(
      text,
      entry.schema,
      entry.prompt,
      guidelines
    );

    logger.info(
      {
        docType,
        changesApplied: appliedChanges?.length || 0,
        fieldMetaCount: fieldMeta?.length || 0,
      },
      "Data extracted"
    );
    return {
      data,
      rawResponse: JSON.stringify(data),
      appliedChanges,
      fieldMeta,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMsg }, "Extraction failed");
    throw new Error(`Extraction failed: ${errorMsg}`);
  }
}

/**
 * Validation: structural (runtime Zod from field definitions) + semantic validators
 */
export async function validate(
  data: Record<string, unknown>,
  docType: DocType,
  schemaRegistry: SchemaRegistry,
  userId: string
): Promise<{ errors: ValidationIssue[]; warnings: ValidationIssue[] }> {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const entry = await schemaRegistry.getEntry(docType, userId);

  if (entry.fieldDefinitions && entry.fieldDefinitions.length > 0) {
    const schemaValidator = buildZodFromFields(entry.fieldDefinitions);
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
  schemaRegistry: SchemaRegistry,
  userId: string,
  guidelines?: Guideline[],
  guidelineLoader?: (docType: string) => Promise<Guideline[]>,
  options?: ExtractDocumentOptions
): Promise<ExtractedDocument> {
  try {
    const ingested = await ingest(rawInput);
    const cleaned = preprocess(ingested.text);

    let docType: DocType;

    if (options?.schemaId) {
      if (!(await schemaRegistry.has(options.schemaId, userId))) {
        throw new Error(`Unknown schema: ${options.schemaId}`);
      }
      docType = options.schemaId;
      logger.info({ docType, mode: "explicit" }, "Using explicit schema");
    } else {
      docType = await classify(
        cleaned,
        llmProvider,
        await schemaRegistry.listTypes(userId)
      );
    }

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

    const { data, appliedChanges, fieldMeta: rawFieldMeta } =
      await extract<Record<string, unknown>>(
        cleaned,
        docType,
        llmProvider,
        schemaRegistry,
        userId,
        applicableGuidelines
      );

    const { errors, warnings } = await validate(
      data,
      docType,
      schemaRegistry,
      userId
    );

    const alignedMeta = ensureFieldMetaCoverage(
      data,
      normalizeFieldMeta(rawFieldMeta ?? [])
    );
    const adjustedMeta = adjustFieldMetaFromValidation(
      alignedMeta,
      errors,
      warnings,
      data
    );
    const fieldMeta =
      adjustedMeta.length > 0 ? locateFieldMeta(cleaned, adjustedMeta) : undefined;
    const confidence = fieldMeta ? averageConfidence(fieldMeta) : undefined;

    const doc: ExtractedDocument = {
      id: "",
      type: docType,
      originalText: ingested.text,
      extractionText: cleaned,
      extractedData: data,
      fieldMeta,
      confidence,
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
