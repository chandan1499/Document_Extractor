import { Router, Request, Response } from "express";
import {
  ExtractionSchema,
  FieldDefinition,
  LLMProvider,
} from "../types.js";
import { SchemaRegistry } from "../registry/index.js";
import {
  buildSchemaFromFields,
  slugifySchemaId,
} from "../schemas/dynamic.js";
import { logger } from "../config/logger.js";

export function createSchemaRoutes(
  schemaRegistry: SchemaRegistry,
  llmProvider: LLMProvider
): Router {
  const router = Router();

  router.get("/api/schemas", (_req: Request, res: Response) => {
    try {
      const schemas = schemaRegistry.listSchemas().map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        isBuiltin: s.isBuiltin,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }));
      res.json(schemas);
    } catch (error) {
      logger.error(error, "List schemas failed");
      res.status(500).json({ error: "Failed to list schemas" });
    }
  });

  router.get("/api/schemas/:id", (req: Request, res: Response) => {
    try {
      const schema = schemaRegistry.getSchema(req.params.id);
      if (!schema) {
        return res.status(404).json({ error: "Schema not found" });
      }
      res.json(schema);
    } catch (error) {
      logger.error(error, "Get schema failed");
      res.status(500).json({ error: "Failed to fetch schema" });
    }
  });

  router.post("/api/schemas", async (req: Request, res: Response) => {
    try {
      const {
        id,
        name,
        description,
        fieldDefinitions,
        prompt: customPrompt,
      } = req.body as {
        id?: string;
        name?: string;
        description?: string;
        fieldDefinitions?: FieldDefinition[];
        prompt?: string;
      };

      if (!name || typeof name !== "string") {
        return res.status(400).json({ error: "name is required" });
      }
      if (!Array.isArray(fieldDefinitions) || fieldDefinitions.length === 0) {
        return res
          .status(400)
          .json({ error: "fieldDefinitions must be a non-empty array" });
      }

      const schemaId = (id && String(id).trim()) || slugifySchemaId(name);
      if (!schemaId) {
        return res.status(400).json({ error: "Invalid schema id" });
      }

      const existing = schemaRegistry.getSchema(schemaId);
      if (existing?.isBuiltin) {
        return res.status(409).json({ error: "Cannot modify built-in schema" });
      }

      const built = buildSchemaFromFields(fieldDefinitions);
      const now = new Date().toISOString();

      const schema: ExtractionSchema = {
        id: schemaId,
        name: name.trim(),
        description: (description ?? "").trim(),
        jsonSchema: built.jsonSchema,
        prompt: customPrompt?.trim() || built.prompt,
        fieldDefinitions,
        isBuiltin: false,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      const saved = await schemaRegistry.register(schema);
      res.status(existing ? 200 : 201).json(saved);
    } catch (error) {
      logger.error(error, "Save schema failed");
      res.status(500).json({
        error: "Failed to save schema",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.delete("/api/schemas/:id", async (req: Request, res: Response) => {
    try {
      const existing = schemaRegistry.getSchema(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Schema not found" });
      }
      if (existing.isBuiltin) {
        return res.status(409).json({ error: "Cannot delete built-in schema" });
      }

      await schemaRegistry.unregister(req.params.id);
      res.status(204).send();
    } catch (error) {
      logger.error(error, "Delete schema failed");
      res.status(500).json({ error: "Failed to delete schema" });
    }
  });

  router.post("/api/schemas/propose", async (req: Request, res: Response) => {
    try {
      const { sampleText, name, description } = req.body as {
        sampleText?: string;
        name?: string;
        description?: string;
      };

      if (!sampleText || typeof sampleText !== "string") {
        return res.status(400).json({ error: "sampleText is required" });
      }

      const fieldDefinitions = await llmProvider.proposeSchema(sampleText, {
        name,
        description,
      });

      const built = buildSchemaFromFields(fieldDefinitions);
      const schemaName = name?.trim() || "Custom Document";
      const schemaId = slugifySchemaId(schemaName);

      res.json({
        id: schemaId,
        name: schemaName,
        description: (description ?? "").trim(),
        jsonSchema: built.jsonSchema,
        prompt: built.prompt,
        fieldDefinitions,
      });
    } catch (error) {
      logger.error(error, "Propose schema failed");
      res.status(500).json({
        error: "Failed to propose schema",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  return router;
}
