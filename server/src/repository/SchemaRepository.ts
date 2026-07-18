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
  user_id: string | null;
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
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresSchemaRepository implements SchemaRepository {
  constructor(private pool: pg.Pool) {}

  async list(userId: string): Promise<ExtractionSchema[]> {
    const result = await this.pool.query<SchemaRow>(
      `SELECT * FROM extraction_schemas
       WHERE is_builtin = true OR user_id = $1
       ORDER BY is_builtin DESC, name ASC`,
      [userId]
    );
    return result.rows.map(rowToSchema);
  }

  async findById(id: string, userId: string): Promise<ExtractionSchema | null> {
    const result = await this.pool.query<SchemaRow>(
      `SELECT * FROM extraction_schemas
       WHERE id = $1 AND (is_builtin = true OR user_id = $2)`,
      [id, userId]
    );
    if (result.rows.length === 0) return null;
    return rowToSchema(result.rows[0]);
  }

  async save(schema: ExtractionSchema, userId: string): Promise<ExtractionSchema> {
    if (schema.isBuiltin) {
      throw new Error("Cannot save built-in schema via user API");
    }

    const existing = await this.pool.query<SchemaRow>(
      "SELECT * FROM extraction_schemas WHERE id = $1",
      [schema.id]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      if (row.is_builtin) {
        throw new Error("Cannot modify built-in schema");
      }
      if (row.user_id !== userId) {
        throw new Error("Schema not accessible");
      }
    }

    schema.updatedAt = new Date().toISOString();
    if (!schema.createdAt) {
      schema.createdAt = schema.updatedAt;
    }
    schema.userId = userId;

    await this.pool.query(
      `INSERT INTO extraction_schemas (
        id, name, description, json_schema, prompt, field_definitions,
        is_builtin, user_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
        false,
        userId,
        schema.createdAt,
        schema.updatedAt,
      ]
    );

    return schema;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM extraction_schemas
       WHERE id = $1 AND user_id = $2 AND is_builtin = false`,
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async upsertIfMissing(schema: ExtractionSchema): Promise<void> {
    const existing = await this.pool.query<SchemaRow>(
      "SELECT * FROM extraction_schemas WHERE id = $1",
      [schema.id]
    );
    if (existing.rows.length === 0) {
      schema.updatedAt = new Date().toISOString();
      if (!schema.createdAt) {
        schema.createdAt = schema.updatedAt;
      }

      await this.pool.query(
        `INSERT INTO extraction_schemas (
          id, name, description, json_schema, prompt, field_definitions,
          is_builtin, user_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
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
          schema.userId ?? null,
          schema.createdAt,
          schema.updatedAt,
        ]
      );
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

  async list(userId: string): Promise<ExtractionSchema[]> {
    const data = await this.readData();
    return data.schemas
      .filter((s) => s.isBuiltin || s.userId === userId)
      .sort((a, b) => {
        if (a.isBuiltin !== b.isBuiltin) return a.isBuiltin ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  async findById(id: string, userId: string): Promise<ExtractionSchema | null> {
    const data = await this.readData();
    const schema = data.schemas.find((s) => s.id === id);
    if (!schema) return null;
    if (schema.isBuiltin || schema.userId === userId) return schema;
    return null;
  }

  async save(schema: ExtractionSchema, userId: string): Promise<ExtractionSchema> {
    const data = await this.readData();
    const idx = data.schemas.findIndex((s) => s.id === schema.id);
    schema.updatedAt = new Date().toISOString();
    schema.userId = userId;

    if (idx >= 0) {
      if (data.schemas[idx].isBuiltin) {
        throw new Error("Cannot overwrite built-in schema");
      }
      if (data.schemas[idx].userId !== userId) {
        throw new Error("Schema not accessible");
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

  async delete(id: string, userId: string): Promise<boolean> {
    const data = await this.readData();
    const target = data.schemas.find((s) => s.id === id);
    if (!target || target.isBuiltin || target.userId !== userId) return false;
    data.schemas = data.schemas.filter((s) => s.id !== id);
    await this.writeData(data);
    return true;
  }

  async upsertIfMissing(schema: ExtractionSchema): Promise<void> {
    const data = await this.readData();
    const existing = data.schemas.find((s) => s.id === schema.id);
    if (!existing) {
      schema.updatedAt = new Date().toISOString();
      if (!schema.createdAt) schema.createdAt = schema.updatedAt;
      data.schemas.push(schema);
      await this.writeData(data);
    }
  }
}
