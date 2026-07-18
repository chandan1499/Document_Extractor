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
  private builtinCache = new Map<string, ExtractionSchema>();

  constructor(private repo: SchemaRepository) {}

  async initialize(): Promise<void> {
    for (const seed of getBuiltinSchemaSeeds()) {
      await this.repo.upsertIfMissing(seed);
    }
    await this.refreshBuiltins();
  }

  private async refreshBuiltins(): Promise<void> {
    this.builtinCache.clear();
    for (const seed of getBuiltinSchemaSeeds()) {
      this.builtinCache.set(seed.id, seed);
    }
  }

  async has(id: string, userId: string): Promise<boolean> {
    if (this.builtinCache.has(id)) return true;
    const schema = await this.repo.findById(id, userId);
    return schema !== null && !schema.isBuiltin;
  }

  async getEntry(id: DocType, userId: string): Promise<RegistryEntry> {
    const schema = await this.getSchema(id, userId);
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

  async getSchema(
    id: string,
    userId: string
  ): Promise<ExtractionSchema | undefined> {
    const builtin = this.builtinCache.get(id);
    if (builtin) return builtin;
    const schema = await this.repo.findById(id, userId);
    return schema ?? undefined;
  }

  async listTypes(userId: string): Promise<SchemaTypeInfo[]> {
    const schemas = await this.listSchemas(userId);
    return schemas.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      isBuiltin: s.isBuiltin,
    }));
  }

  async listSchemas(userId: string): Promise<ExtractionSchema[]> {
    const custom = await this.repo.list(userId);
    const byId = new Map<string, ExtractionSchema>();

    for (const builtin of this.builtinCache.values()) {
      byId.set(builtin.id, builtin);
    }
    for (const schema of custom) {
      if (!schema.isBuiltin) {
        byId.set(schema.id, schema);
      }
    }

    return Array.from(byId.values()).sort((a, b) => {
      if (a.isBuiltin !== b.isBuiltin) return a.isBuiltin ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  async register(
    schema: ExtractionSchema,
    userId: string
  ): Promise<ExtractionSchema> {
    if (schema.isBuiltin) {
      throw new Error("Cannot register built-in schema via API");
    }
    return this.repo.save(schema, userId);
  }

  async unregister(id: string, userId: string): Promise<void> {
    const existing = await this.repo.findById(id, userId);
    if (!existing) {
      throw new Error(`Schema not found: ${id}`);
    }
    if (existing.isBuiltin) {
      throw new Error("Cannot delete built-in schema");
    }
    const deleted = await this.repo.delete(id, userId);
    if (!deleted) {
      throw new Error(`Failed to delete schema: ${id}`);
    }
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
