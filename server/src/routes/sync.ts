import { Router, Request, Response } from "express";
import {
  Correction,
  CorrectionRepository,
  DocType,
  DocumentRepository,
  ExtractionSchema,
  Guideline,
} from "../types.js";
import { SchemaRegistry } from "../registry/index.js";
import { requireAuthenticated } from "../middleware/auth.js";
import { logger } from "../config/logger.js";

interface SyncLocalBody {
  documents?: Array<Record<string, unknown>>;
  schemas?: ExtractionSchema[];
  corrections?: Correction[];
  guidelines?: Guideline[];
}

function getUserId(req: Request): string {
  return req.user!.id;
}

export function createSyncRoutes(
  docRepo: DocumentRepository,
  correctionRepo: CorrectionRepository,
  schemaRegistry: SchemaRegistry
): Router {
  const router = Router();

  router.post(
    "/api/sync-local",
    requireAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const userId = getUserId(req);
        const body = req.body as SyncLocalBody;
        const schemas = Array.isArray(body.schemas) ? body.schemas : [];
        const documents = Array.isArray(body.documents) ? body.documents : [];
        const corrections = Array.isArray(body.corrections)
          ? body.corrections
          : [];
        const guidelines = Array.isArray(body.guidelines) ? body.guidelines : [];

        let schemasSynced = 0;
        for (const schema of schemas) {
          if (schema.isBuiltin) continue;
          await schemaRegistry.register(schema, userId);
          schemasSynced += 1;
        }

        let documentsSynced = 0;
        for (const raw of documents) {
          const doc = {
            id: typeof raw.id === "string" ? raw.id : "",
            type: raw.type as DocType,
            originalText: String(raw.originalText ?? ""),
            extractionText:
              typeof raw.extractionText === "string"
                ? raw.extractionText
                : undefined,
            extractedData:
              (raw.extractedData as Record<string, unknown>) ?? {},
            appliedChanges: raw.appliedChanges as
              | import("../types.js").AppliedChange[]
              | undefined,
            fieldMeta: raw.fieldMeta as
              | import("../types.js").FieldMeta[]
              | undefined,
            validationErrors:
              (raw.validationErrors as import("../types.js").ValidationIssue[]) ??
              [],
            validationWarnings:
              (raw.validationWarnings as import("../types.js").ValidationIssue[]) ??
              [],
            confidence:
              typeof raw.confidence === "number" ? raw.confidence : undefined,
            createdAt:
              typeof raw.createdAt === "string"
                ? raw.createdAt
                : new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await docRepo.save(doc, userId);
          documentsSynced += 1;
        }

        let correctionsSynced = 0;
        for (const correction of corrections) {
          await correctionRepo.saveCorrection(
            {
              ...correction,
              id: correction.id || "",
              createdAt: correction.createdAt || new Date().toISOString(),
            },
            userId
          );
          correctionsSynced += 1;
        }

        let guidelinesSynced = 0;
        for (const guideline of guidelines) {
          await correctionRepo.saveGuideline(
            {
              ...guideline,
              id: guideline.id || "",
              createdAt: guideline.createdAt || new Date().toISOString(),
            },
            userId
          );
          guidelinesSynced += 1;
        }

        res.json({
          schemasSynced,
          documentsSynced,
          correctionsSynced,
          guidelinesSynced,
        });
      } catch (error) {
        logger.error(error, "Sync local data failed");
        res.status(500).json({ error: "Failed to sync local data" });
      }
    }
  );

  return router;
}
