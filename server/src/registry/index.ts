import {
  DocType,
  ExtractionSchema,
  FieldDefinition,
  SchemaRepository,
  SchemaTypeInfo,
  Validator,
} from "../types.js";
import { InvoiceValidators } from "../validation/invoice.js";
import { ResumeValidators } from "../validation/resume.js";
import { MeetingNotesValidators } from "../validation/meetingNotes.js";
import { getBuiltinSchemaSeeds } from "./builtinSeeds.js";

export interface RegistryEntry {
  schema: Record<string, unknown>;
  prompt: string;
  validators: Validator[];
  fieldDefinitions: FieldDefinition[] | null;
}

export const BUILTIN_VALIDATORS: Record<string, Validator[]> = {
  invoice: InvoiceValidators,
  resume: ResumeValidators,
  meeting_notes: MeetingNotesValidators,
};

export class SchemaRegistry {
  private cache = new Map<string, ExtractionSchema>();

  constructor(private repo: SchemaRepository) {}

  async initialize(): Promise<void> {
    for (const seed of getBuiltinSchemaSeeds()) {
      await this.repo.upsertIfMissing(seed);
    }
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const schemas = await this.repo.list();
    this.cache.clear();
    for (const schema of schemas) {
      this.cache.set(schema.id, schema);
    }
  }

  has(id: string): boolean {
    return this.cache.has(id);
  }

  getEntry(id: DocType): RegistryEntry {
    const schema = this.cache.get(id);
    if (!schema) {
      throw new Error(`Unknown schema: ${id}`);
    }
    return {
      schema: schema.jsonSchema,
      prompt: schema.prompt,
      validators: BUILTIN_VALIDATORS[id] ?? [],
      fieldDefinitions: schema.fieldDefinitions,
    };
  }

  getSchema(id: string): ExtractionSchema | undefined {
    return this.cache.get(id);
  }

  listTypes(): SchemaTypeInfo[] {
    return Array.from(this.cache.values()).map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      isBuiltin: s.isBuiltin,
    }));
  }

  listSchemas(): ExtractionSchema[] {
    return Array.from(this.cache.values()).sort((a, b) => {
      if (a.isBuiltin !== b.isBuiltin) return a.isBuiltin ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  async register(schema: ExtractionSchema): Promise<ExtractionSchema> {
    if (schema.isBuiltin) {
      throw new Error("Cannot register built-in schema via API");
    }
    const saved = await this.repo.save(schema);
    this.cache.set(saved.id, saved);
    return saved;
  }

  async unregister(id: string): Promise<void> {
    const existing = this.cache.get(id);
    if (!existing) {
      throw new Error(`Schema not found: ${id}`);
    }
    if (existing.isBuiltin) {
      throw new Error("Cannot delete built-in schema");
    }
    const deleted = await this.repo.delete(id);
    if (!deleted) {
      throw new Error(`Failed to delete schema: ${id}`);
    }
    this.cache.delete(id);
  }
}

/** @deprecated Use SchemaRegistry.getEntry via injected registry */
export function getRegistryEntry(docType: DocType): RegistryEntry {
  throw new Error(
    "Static getRegistryEntry is deprecated. Use SchemaRegistry.getEntry instead."
  );
}

/** @deprecated Use SchemaRegistry */
export const REGISTRY: Record<string, RegistryEntry> = {};
