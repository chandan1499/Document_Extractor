import fs from "fs/promises";
import path from "path";
import pg from "pg";
import { ExtractionSchema, SchemaRepository } from "../types.js";

interface SchemaRow {
  id: string;
  name: string;
  description: string;
  json_schema: Record<string, unknown>;
  prompt: string;
  field_definitions: ExtractionSchema["fieldDefinitions"];
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

function rowToSchema(row: SchemaRow): ExtractionSchema {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    jsonSchema: row.json_schema,
    prompt: row.prompt,
    fieldDefinitions: row.field_definitions,
    isBuiltin: row.is_builtin,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresSchemaRepository implements SchemaRepository {
  constructor(private pool: pg.Pool) {}

  async list(): Promise<ExtractionSchema[]> {
    const result = await this.pool.query<SchemaRow>(
      "SELECT * FROM extraction_schemas ORDER BY is_builtin DESC, name ASC"
    );
    return result.rows.map(rowToSchema);
  }

  async findById(id: string): Promise<ExtractionSchema | null> {
    const result = await this.pool.query<SchemaRow>(
      "SELECT * FROM extraction_schemas WHERE id = $1",
      [id]
    );
    if (result.rows.length === 0) return null;
    return rowToSchema(result.rows[0]);
  }

  async save(schema: ExtractionSchema): Promise<ExtractionSchema> {
    schema.updatedAt = new Date().toISOString();
    if (!schema.createdAt) {
      schema.createdAt = schema.updatedAt;
    }

    await this.pool.query(
      `INSERT INTO extraction_schemas (
        id, name, description, json_schema, prompt, field_definitions,
        is_builtin, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        json_schema = EXCLUDED.json_schema,
        prompt = EXCLUDED.prompt,
        field_definitions = EXCLUDED.field_definitions,
        updated_at = EXCLUDED.updated_at`,
      [
        schema.id,
        schema.name,
        schema.description,
        JSON.stringify(schema.jsonSchema),
        schema.prompt,
        schema.fieldDefinitions
          ? JSON.stringify(schema.fieldDefinitions)
          : null,
        schema.isBuiltin,
        schema.createdAt,
        schema.updatedAt,
      ]
    );

    return schema;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(
      "DELETE FROM extraction_schemas WHERE id = $1 AND is_builtin = false",
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async upsertIfMissing(schema: ExtractionSchema): Promise<void> {
    const existing = await this.findById(schema.id);
    if (!existing) {
      await this.save(schema);
    }
  }
}

export class JsonSchemaRepository implements SchemaRepository {
  private schemasFile: string;

  constructor(dataDir: string = "./data") {
    this.schemasFile = path.join(dataDir, "extraction_schemas.json");
  }

  private async ensureFile(): Promise<void> {
    try {
      await fs.access(this.schemasFile);
    } catch {
      await fs.mkdir(path.dirname(this.schemasFile), { recursive: true });
      await fs.writeFile(
        this.schemasFile,
        JSON.stringify({ schemas: [] }, null, 2)
      );
    }
  }

  private async readData(): Promise<{ schemas: ExtractionSchema[] }> {
    await this.ensureFile();
    const content = await fs.readFile(this.schemasFile, "utf-8");
    return JSON.parse(content);
  }

  private async writeData(data: {
    schemas: ExtractionSchema[];
  }): Promise<void> {
    await fs.writeFile(this.schemasFile, JSON.stringify(data, null, 2));
  }

  async list(): Promise<ExtractionSchema[]> {
    const data = await this.readData();
    return data.schemas.sort((a, b) => {
      if (a.isBuiltin !== b.isBuiltin) return a.isBuiltin ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  async findById(id: string): Promise<ExtractionSchema | null> {
    const data = await this.readData();
    return data.schemas.find((s) => s.id === id) ?? null;
  }

  async save(schema: ExtractionSchema): Promise<ExtractionSchema> {
    const data = await this.readData();
    const idx = data.schemas.findIndex((s) => s.id === schema.id);
    schema.updatedAt = new Date().toISOString();
    if (idx >= 0) {
      if (data.schemas[idx].isBuiltin && !schema.isBuiltin) {
        throw new Error("Cannot overwrite built-in schema");
      }
      if (!schema.createdAt) schema.createdAt = data.schemas[idx].createdAt;
      data.schemas[idx] = schema;
    } else {
      schema.createdAt = schema.createdAt || schema.updatedAt;
      data.schemas.push(schema);
    }
    await this.writeData(data);
    return schema;
  }

  async delete(id: string): Promise<boolean> {
    const data = await this.readData();
    const target = data.schemas.find((s) => s.id === id);
    if (!target || target.isBuiltin) return false;
    data.schemas = data.schemas.filter((s) => s.id !== id);
    await this.writeData(data);
    return true;
  }

  async upsertIfMissing(schema: ExtractionSchema): Promise<void> {
    const existing = await this.findById(schema.id);
    if (!existing) {
      await this.save(schema);
    }
  }
}
