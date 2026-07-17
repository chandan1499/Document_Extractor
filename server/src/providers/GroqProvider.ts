import OpenAI from "openai";
import type { ChatCompletion } from "openai/resources/chat/completions";
import {
  LLMProvider,
  DocType,
  Guideline,
  ExtractResult,
  CorrectionInput,
  SchemaTypeInfo,
  FieldDefinition,
  FieldMeta,
} from "../types.js";
import { logger } from "../config/logger.js";

function normalizeFieldPath(field: string): string {
  return field.replace(/^data\./, "");
}

const FIELD_META_ITEM_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    field: {
      type: "string",
      description:
        'Dotted path to the leaf field (e.g. "vendor.name", "lineItems.0.total")',
    },
    confidence: {
      type: "number",
      description: "0-1 confidence in the chosen value",
    },
    sourceText: {
      type: "string",
      description: "Verbatim quote from the document for the chosen value",
    },
    reason: {
      type: "string",
      description:
        "Short explanation when confidence is low; empty string when confident",
    },
    alternatives: {
      type: "array",
      items: {
        type: "object",
        properties: {
          value: {
            type: "string",
            description: "JSON-encoded alternative value seen in the document",
          },
          sourceText: {
            type: "string",
            description: "Verbatim quote for this alternative",
          },
        },
        required: ["value", "sourceText"],
        additionalProperties: false,
      },
    },
  },
  required: ["field", "confidence", "sourceText", "reason", "alternatives"],
  additionalProperties: false,
};

function wrapExtractionEnvelope(
  dataSchema: Record<string, unknown>,
  options: { includeAppliedChanges: boolean }
): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    data: dataSchema,
    fieldMeta: {
      type: "array",
      items: FIELD_META_ITEM_SCHEMA,
    },
  };
  const required = ["data", "fieldMeta"];

  if (options.includeAppliedChanges) {
    properties.appliedChanges = {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: { type: "string" },
          originalValue: {
            type: "string",
            description:
              "JSON-encoded value as it appeared on the document before rules",
          },
          correctedValue: {
            type: "string",
            description:
              "JSON-encoded value after applying the matching rule",
          },
          rule: { type: "string" },
        },
        required: ["field", "originalValue", "correctedValue", "rule"],
        additionalProperties: false,
      },
    };
    required.push("appliedChanges");
  }

  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

const FIELD_META_PROMPT = `
FIELD METADATA (required for every leaf field in "data"):
Return a "fieldMeta" array with one entry per leaf field you extracted.
Each entry must include:
- "field": dotted path to the leaf (e.g. "vendor.name", "lineItems.0.total")
- "confidence": number 0-1 for how sure you are about the chosen value
- "sourceText": exact verbatim quote from the document supporting the chosen value
- "reason": short explanation when confidence is low; use "" when confident
- "alternatives": array of other plausible values you saw but did not choose
  Each alternative: { "value": "<JSON-encoded value>", "sourceText": "<verbatim quote>" }

Rules for fieldMeta:
- Include EVERY leaf field from "data" (scalars, nested object leaves, array item leaves).
- "field" paths must use schema root keys only (e.g. "name", "email", "experience.0.company").
  Do NOT prefix paths with "data.".
- When the document contains multiple documents or duplicate values (e.g. two invoices in one PDF),
  lower confidence and list the other candidates in "alternatives" with their source quotes.
- "value" in alternatives MUST be JSON-encoded strings (same as appliedChanges values).
- If no alternatives exist, return "alternatives": [].
- "sourceText" must be copied verbatim from the document text provided.

CONFIDENCE SCORING RULES (apply when writing fieldMeta):

A) URL / link fields (any field path containing "link", "url", "website", "github", or "linkedin"):
   - A valid value MUST look like a URL: starts with "http://" or "https://", OR is clearly a full domain (e.g. linkedin.com/in/..., github.com/username).
   - If the document only shows a bare username, handle, or fragment WITHOUT scheme or domain (e.g. "chandan", "@chandan", "linkedin/chandan" with no host):
     * Still extract what appears on the document into "data".
     * In fieldMeta for that field: confidence MUST be <= 0.5 (use 0.3–0.5).
     * "reason" MUST state the value is not a complete URL (missing http/https or domain).
   - Do NOT assign confidence above 0.7 to non-URL link values.
   - Empty string for optional links: confidence may be high if truly absent from document.

B) Phone fields (field path contains "phone", "mobile", or "tel"):
   - Count digits only (ignore spaces, dashes, parentheses).
   - If digit count is clearly wrong when a phone is present (e.g. fewer than 10 or more than 15):
     * confidence MUST be <= 0.5
     * "reason" MUST mention invalid or incomplete phone format.

C) Email fields:
   - If value is not a valid email shape (missing @, domain, etc.): confidence MUST be <= 0.5.

D) General confidence bands:
   - 0.9+ ONLY when the value clearly matches the field type and is unambiguous on the document.
   - 0.7–0.89 when plausible but not fully verified.
   - <= 0.5 when format is wrong, value is incomplete, or you had to guess.
   - Use confidence below 0.7 whenever unsure OR when any rule in A–C applies.
   - "reason" must be non-empty whenever confidence <= 0.7.`;

function parseJsonValue(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function parseFieldMeta(raw: unknown): FieldMeta[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const entry = item as Record<string, unknown>;
      const field = entry.field;
      const confidence = entry.confidence;
      const sourceText = entry.sourceText;

      if (typeof field !== "string" || typeof sourceText !== "string") {
        return null;
      }

      const confNum =
        typeof confidence === "number"
          ? Math.min(1, Math.max(0, confidence))
          : 0.5;

      const reason =
        typeof entry.reason === "string" && entry.reason.trim()
          ? entry.reason.trim()
          : undefined;

      const alternatives = Array.isArray(entry.alternatives)
        ? entry.alternatives
            .map((alt) => {
              if (!alt || typeof alt !== "object") return null;
              const a = alt as Record<string, unknown>;
              if (typeof a.sourceText !== "string") return null;
              return {
                value: parseJsonValue(a.value),
                sourceText: a.sourceText,
              };
            })
            .filter((a): a is NonNullable<typeof a> => a !== null)
        : [];

      const meta: FieldMeta = {
        field: normalizeFieldPath(field),
        confidence: confNum,
        sourceText,
        ...(reason ? { reason } : {}),
        ...(alternatives.length > 0 ? { alternatives } : {}),
      };
      return meta;
    })
    .filter((m): m is FieldMeta => m !== null);
}

export class GroqProvider implements LLMProvider {
  private client: OpenAI;
  private extractModel: string;
  private classifyModel: string;

  constructor(apiKey: string, extractModel?: string, classifyModel?: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: "https://api.groq.com/openai/v1",
    });
    this.extractModel = extractModel || "openai/gpt-oss-120b";
    this.classifyModel = classifyModel || "llama-3.1-8b-instant";
    logger.info(
      { extractModel: this.extractModel, classifyModel: this.classifyModel },
      "GroqProvider initialized"
    );
  }

  async classify(
    text: string,
    types: SchemaTypeInfo[]
  ): Promise<DocType> {
    if (types.length === 0) {
      throw new Error("No document types available for classification");
    }

    const allowedIds = types.map((t) => t.id);
    const typeCatalog = types
      .map(
        (t) =>
          `- ${t.id}: ${t.name}${t.description ? ` — ${t.description}` : ""}`
      )
      .join("\n");

    logger.info(
      { model: this.classifyModel, textLength: text.length, typeCount: types.length },
      "🔍 LLM CLASSIFY: Starting document classification"
    );

    const prompt = `Classify this document into exactly one of these types:

${typeCatalog}

Return a JSON object with a single field "type" containing the schema id.

Document:
${text.slice(0, 2000)}`;

    const response = await this.client.chat.completions.create({
      model: this.classifyModel,
      messages: [
        {
          role: "system",
          content: `You are a document classifier. Respond only with valid JSON in the format {"type": "<schema_id>"}. Valid ids: ${allowedIds.join(", ")}`,
        },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      max_tokens: 100,
    });

    try {
      const content = response.choices[0].message.content;
      if (!content) throw new Error("Empty response from Groq");

      const parsed = JSON.parse(content);
      const type = parsed.type as DocType;
      if (!allowedIds.includes(type)) {
        throw new Error(`Invalid document type: ${type}`);
      }

      logger.info(
        { classifiedType: type },
        "✅ LLM CLASSIFY: Classification completed successfully"
      );
      return type;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(
        { error: errorMsg, response: response.choices[0].message.content },
        "❌ LLM CLASSIFY: Classification failed"
      );
      throw new Error(`Document classification failed: ${errorMsg}`);
    }
  }

  async extract<T>(
    text: string,
    schema: Record<string, unknown>,
    prompt: string,
    guidelines?: Guideline[]
  ): Promise<ExtractResult<T>> {
    const hasGuidelines = Boolean(guidelines && guidelines.length > 0);

    logger.info(
      {
        model: this.extractModel,
        textLength: text.length,
        guidelinesCount: guidelines?.length || 0,
        envelopeMode: hasGuidelines,
      },
      "🔍 LLM EXTRACT: Starting data extraction"
    );

    let systemPrompt = prompt + FIELD_META_PROMPT;
    const guidelinesApplied: string[] = [];
    const responseSchema = wrapExtractionEnvelope(schema, {
      includeAppliedChanges: hasGuidelines,
    });

    if (hasGuidelines && guidelines) {
      logger.info(
        { guidelinesCount: guidelines.length },
        "📋 LLM EXTRACT: Applying guidelines (envelope mode)"
      );

      const rulesText = guidelines
        .map((g) => `• ${g.rule}`)
        .slice(0, 10)
        .join("\n");

      guidelinesApplied.push(...guidelines.slice(0, 10).map((g) => g.rule));

      systemPrompt += `

⚠️ IMPORTANT - LEARNED CORRECTIONS FROM PREVIOUS EXTRACTIONS:
You MUST apply these corrections to ensure consistency with past corrections:
${rulesText}

These are vendor-provided rules and aliases that have been verified. Apply them without exception.

RESPONSE FORMAT (required):
Return a JSON object with:
1. "data" — the final extracted document fields AFTER applying the rules above.
2. "fieldMeta" — metadata for every leaf field (see FIELD METADATA above).
3. "appliedChanges" — an array of ONLY the fields that changed because of a rule.
   Each entry must be:
   {
     "field": "<top-level field name that changed>",
     "originalValue": "<JSON string of the value as it appears on the document before any rule>",
     "correctedValue": "<JSON string of the value after applying the matching rule>",
     "rule": "<the exact rule text that caused this change>"
   }

Rules for appliedChanges:
- "field" may be a top-level key ("vendor") or a dotted path ("vendor.name").
  Prefer the most specific path that changed (e.g. "vendor.name" when only the name changed).
- Include a field ONLY when originalValue differs from correctedValue.
- If no rules changed any field, return "appliedChanges": [].
- originalValue / correctedValue MUST be JSON-encoded strings
  (e.g. "\\"ZMT LIMITED\\"" for a string, or "{\\"name\\":\\"ZMT LIMITED\\",\\"email\\":\\"\\",\\"address\\":\\"\\"}" for an object).
- originalValue must reflect what was literally on the document (e.g. ZMT LIMITED).
- correctedValue must reflect the value after the rule (e.g. ZOMATO LIMITED).
- Do NOT invent changes for fields that were not affected by a rule.`;

      logger.debug(
        { appliedRules: guidelinesApplied },
        "📝 LLM EXTRACT: Guidelines rules being applied"
      );
    } else {
      systemPrompt += `

RESPONSE FORMAT (required):
Return a JSON object with:
1. "data" — the extracted document fields matching the schema.
2. "fieldMeta" — metadata for every leaf field (see FIELD METADATA above).`;
    }

    logger.debug(
      { systemPromptLength: systemPrompt.length },
      "📝 LLM EXTRACT: System prompt prepared"
    );
    logger.debug(
      { userPromptLength: text.length, userPromptPreview: text.slice(0, 200) },
      "📝 LLM EXTRACT: User input text"
    );

    const response = (await this.client.chat.completions.create({
      model: this.extractModel,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: `Extract the data from this document:\n\n${text}`,
        },
      ],
      temperature: 0,
      max_tokens: 3500,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "extraction",
          schema: responseSchema as Record<string, unknown>,
          strict: true,
        },
      },
    })) as ChatCompletion;

    try {
      const content = response.choices[0].message.content;
      if (!content) throw new Error("Empty response from Groq");

      logger.debug(
        { rawOutput: content.slice(0, 500) },
        "📤 LLM EXTRACT: Raw output from Groq (first 500 chars)"
      );

      const parsed = JSON.parse(content) as {
        data: T;
        fieldMeta?: unknown;
        appliedChanges?: Array<{
          field: string;
          originalValue: unknown;
          correctedValue: unknown;
          rule: string;
        }>;
      };

      const fieldMeta = parseFieldMeta(parsed.fieldMeta);

      let appliedChanges: ExtractResult<T>["appliedChanges"];
      if (hasGuidelines) {
        appliedChanges = (parsed.appliedChanges || [])
          .map((c) => ({
            field: c.field,
            originalValue: parseJsonValue(c.originalValue),
            correctedValue: parseJsonValue(c.correctedValue),
            rule: c.rule,
          }))
          .filter(
            (c) =>
              JSON.stringify(c.originalValue) !==
              JSON.stringify(c.correctedValue)
          );

        if (appliedChanges.length === 0) {
          appliedChanges = undefined;
        }
      }

      logger.info(
        {
          extractedFields: Object.keys(
            (parsed.data || {}) as Record<string, unknown>
          ),
          fieldMetaCount: fieldMeta.length,
          changesReported: appliedChanges?.length || 0,
          guidelinesUsed: hasGuidelines,
        },
        "✅ LLM EXTRACT: Envelope extraction completed successfully"
      );

      return {
        data: parsed.data,
        fieldMeta: fieldMeta.length > 0 ? fieldMeta : undefined,
        appliedChanges,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(
        {
          error: errorMsg,
          rawResponse: response.choices[0].message.content?.slice(0, 500),
          guidelinesApplied: guidelinesApplied.length,
        },
        "❌ LLM EXTRACT: Data extraction failed"
      );
      throw new Error(`Data extraction failed: ${errorMsg}`);
    }
  }

  async extractLearningRules(
    docType: DocType,
    corrections: CorrectionInput[],
    learningNotes: string
  ): Promise<string[]> {
    const trimmed = learningNotes.trim();
    if (!trimmed) return [];

    const correctionsText = corrections
      .map(
        (c) =>
          `- ${c.field}: ${JSON.stringify(c.originalValue)} → ${JSON.stringify(c.correctedValue)}`
      )
      .join("\n");

    const prompt = `Document type: ${docType}

The user manually corrected these extracted fields:
${correctionsText || "(no field-level diffs recorded)"}

The user provided these learning notes (may contain multiple rules):
"""
${trimmed}
"""

Extract every distinct, reusable rule the system should apply on future ${docType} extractions.
Return one rule per item — split bullet points, numbered lists, and separate sentences into separate rules when they describe different behaviors.
Each rule must be self-contained and actionable (what field or pattern to change and how).
Do not merge unrelated rules into one string.`;

    logger.info(
      {
        docType,
        correctionCount: corrections.length,
        notesLength: trimmed.length,
      },
      "🧠 LLM LEARN: Extracting rules from learning notes"
    );

    try {
      const response = await this.client.chat.completions.create({
        model: this.classifyModel,
        messages: [
          {
            role: "system",
            content:
              'You extract reusable document-extraction rules from user feedback. Respond only with valid JSON in the format {"rules": ["rule one", "rule two"]}.',
          },
          { role: "user", content: prompt },
        ],
        temperature: 0,
        max_tokens: 1000,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0].message.content;
      if (!content) throw new Error("Empty response from Groq");

      const parsed = JSON.parse(content) as { rules?: string[] };
      const rules = (parsed.rules || [])
        .map((r) => r.trim())
        .filter((r) => r.length > 0);

      logger.info(
        { ruleCount: rules.length },
        "✅ LLM LEARN: Rules extracted from learning notes"
      );

      return rules.length > 0 ? rules : [trimmed];
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn(
        { error: errorMsg },
        "⚠️ LLM LEARN: Rule extraction failed, storing notes as single rule"
      );
      return [trimmed];
    }
  }

  async proposeSchema(
    sampleText: string,
    hint?: { name?: string; description?: string }
  ): Promise<FieldDefinition[]> {
    const nameHint = hint?.name ? `Suggested name: ${hint.name}` : "";
    const descHint = hint?.description
      ? `Suggested description: ${hint.description}`
      : "";

    const prompt = `Analyze this sample document and propose a field list for structured extraction.

${nameHint}
${descHint}

Return JSON with a "fields" array. Each field must have:
- key (camelCase string)
- type: one of string, number, boolean, date, email, array, object
- required: boolean (default true)
- label: human-readable name (optional)
- description: extraction hint (optional)
- itemType: "string" or "number" when type is array of primitives
- items: array of field objects when type is array of objects
- properties: array of field objects when type is object

Sample document:
${sampleText.slice(0, 4000)}`;

    logger.info(
      { sampleLength: sampleText.length },
      "🔍 LLM PROPOSE: Generating schema from sample"
    );

    const response = await this.client.chat.completions.create({
      model: this.classifyModel,
      messages: [
        {
          role: "system",
          content:
            'You propose extraction schemas from documents. Respond only with valid JSON: {"fields": [...]}',
        },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error("Empty response from Groq");

    const parsed = JSON.parse(content) as { fields?: FieldDefinition[] };
    const fields = parsed.fields ?? [];
    if (fields.length === 0) {
      throw new Error("LLM did not propose any fields");
    }

    return fields;
  }
}
