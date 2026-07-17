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
} from "../types.js";
import { logger } from "../config/logger.js";

function wrapSchemaWithChanges(
  dataSchema: Record<string, unknown>
): Record<string, unknown> {
  // originalValue/correctedValue are JSON strings so Groq strict schema accepts any shape
  return {
    type: "object",
    properties: {
      data: dataSchema,
      appliedChanges: {
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
      },
    },
    required: ["data", "appliedChanges"],
    additionalProperties: false,
  };
}

function parseJsonValue(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
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

    let systemPrompt = prompt;
    const guidelinesApplied: string[] = [];
    let responseSchema = schema;

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

      responseSchema = wrapSchemaWithChanges(schema);

      systemPrompt += `

⚠️ IMPORTANT - LEARNED CORRECTIONS FROM PREVIOUS EXTRACTIONS:
You MUST apply these corrections to ensure consistency with past corrections:
${rulesText}

These are vendor-provided rules and aliases that have been verified. Apply them without exception.

RESPONSE FORMAT (required):
Return a JSON object with exactly two keys:
1. "data" — the final extracted document fields AFTER applying the rules above.
2. "appliedChanges" — an array of ONLY the fields that changed because of a rule.
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
      max_tokens: hasGuidelines ? 3000 : 2000,
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

      const parsed = JSON.parse(content);

      if (hasGuidelines) {
        const envelope = parsed as {
          data: T;
          appliedChanges?: Array<{
            field: string;
            originalValue: unknown;
            correctedValue: unknown;
            rule: string;
          }>;
        };

        const appliedChanges = (envelope.appliedChanges || [])
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

        logger.info(
          {
            extractedFields: Object.keys(
              (envelope.data || {}) as Record<string, unknown>
            ),
            changesReported: appliedChanges.length,
          },
          "✅ LLM EXTRACT: Envelope extraction completed successfully"
        );

        return {
          data: envelope.data,
          appliedChanges:
            appliedChanges.length > 0 ? appliedChanges : undefined,
        };
      }

      logger.info(
        {
          extractedFields: Object.keys(parsed as Record<string, unknown>),
          guidelinesUsed: false,
        },
        "✅ LLM EXTRACT: Data extraction completed successfully"
      );

      return { data: parsed as T };
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
