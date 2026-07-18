import { Router, Request, Response, RequestHandler } from "express";
import { Multer } from "multer";
import {
  LLMProvider,
  DocType,
  Guideline,
  CorrectionInput,
} from "../types.js";
import { DocumentRepository } from "../types.js";
import { CorrectionRepository } from "../types.js";
import { extractDocument } from "../pipeline/index.js";
import { extractTextFromFile } from "../utils/fileExtractor.js";
import { SchemaRegistry } from "../registry/index.js";
import { createSchemaRoutes } from "./schemas.js";
import { createSyncRoutes } from "./sync.js";
import { logger } from "../config/logger.js";
import { requireAuthenticated } from "../middleware/auth.js";
import {
  createGuestQuotaMiddleware,
  GuestQuotaStore,
  recordGuestExtract,
} from "../middleware/guestQuota.js";
import {
  ExtractRequestBody,
  resolveExtractContext,
} from "../utils/extractContext.js";

type FileRequest = Request & { file?: Express.Multer.File };

function getUserId(req: Request): string {
  return req.user!.id;
}

export function createRoutes(
  docRepo: DocumentRepository,
  correctionRepo: CorrectionRepository,
  llmProvider: LLMProvider,
  schemaRegistry: SchemaRegistry,
  upload?: Multer,
  guestQuotaStore?: GuestQuotaStore
): Router {
  const router = Router();
  const guestQuotaCheck = guestQuotaStore
    ? createGuestQuotaMiddleware(guestQuotaStore)
    : null;

  router.use(createSchemaRoutes(schemaRegistry, llmProvider));
  router.use(createSyncRoutes(docRepo, correctionRepo, schemaRegistry));

  /**
   * POST /api/extract
   * Extract a document from text
   */
  router.post(
    "/api/extract",
    ...(guestQuotaCheck ? [guestQuotaCheck] : []),
    async (req: Request, res: Response) => {
      try {
        const body = req.body as ExtractRequestBody;
        const { text } = body;

        if (!text || typeof text !== "string") {
          return res.status(400).json({ error: "Missing or invalid text field" });
        }

        const ctx = await resolveExtractContext(
          req,
          body,
          schemaRegistry,
          correctionRepo
        );
        if ("error" in ctx) {
          return res.status(ctx.status).json({ error: ctx.error });
        }

        const doc = await extractDocument(
          text,
          llmProvider,
          schemaRegistry,
          ctx.userId,
          ctx.guidelines,
          ctx.guidelineLoader,
          {
            schemaId: ctx.resolvedSchemaId,
            schemaOverride: ctx.schemaOverride,
          }
        );

        if (guestQuotaStore) {
          await recordGuestExtract(guestQuotaStore, req);
        }

        res.json(doc);
      } catch (error) {
        logger.error(error, "Extract request failed");
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = message.startsWith("Unknown schema:") ? 403 : 500;
        res.status(status).json({
          error: "Failed to extract document",
          details: message,
        });
      }
    }
  );

  /**
   * POST /api/extract-file
   * Upload and extract a file (TXT, PDF, CSV, or Image with OCR)
   */
  if (upload) {
    router.post(
      "/api/extract-file",
      ...(guestQuotaCheck ? [guestQuotaCheck] : []),
      upload.single("file") as unknown as RequestHandler,
      async (req: FileRequest, res: Response) => {
        try {
          if (!req.file) {
            return res.status(400).json({ error: "No file provided" });
          }

          const body: ExtractRequestBody = {
            schemaId: req.body.schemaId,
            docType: req.body.docType,
          };

          if (typeof req.body.guidelines === "string" && req.body.guidelines.trim()) {
            try {
              body.guidelines = JSON.parse(req.body.guidelines);
            } catch {
              return res.status(400).json({ error: "Invalid guidelines JSON" });
            }
          }

          if (
            typeof req.body.schemaPayload === "string" &&
            req.body.schemaPayload.trim()
          ) {
            try {
              body.schemaPayload = JSON.parse(req.body.schemaPayload);
            } catch {
              return res.status(400).json({ error: "Invalid schemaPayload JSON" });
            }
          }

          const ctx = await resolveExtractContext(
            req,
            body,
            schemaRegistry,
            correctionRepo
          );
          if ("error" in ctx) {
            return res.status(ctx.status).json({ error: ctx.error });
          }

          const text = await extractTextFromFile(
            req.file.buffer,
            req.file.mimetype,
            req.file.originalname
          );

          if (!text.trim()) {
            return res.status(400).json({
              error: "File is empty or could not be parsed",
            });
          }

          const doc = await extractDocument(
            text,
            llmProvider,
            schemaRegistry,
            ctx.userId,
            ctx.guidelines,
            ctx.guidelineLoader,
            {
              schemaId: ctx.resolvedSchemaId,
              schemaOverride: ctx.schemaOverride,
            }
          );

          if (guestQuotaStore) {
            await recordGuestExtract(guestQuotaStore, req);
          }

          res.json(doc);
        } catch (error) {
          logger.error(error, "File extract request failed");
          return res.status(400).json({
            error: "Failed to extract document",
            details: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    );
  }

  /**
   * POST /api/learning-rules
   * Extract learning rules from corrections without persisting (guest mode)
   */
  router.post("/api/learning-rules", async (req: Request, res: Response) => {
    try {
      const { docType, corrections, learningNotes } = req.body as {
        docType?: DocType;
        corrections?: CorrectionInput[];
        learningNotes?: string;
      };

      if (!docType) {
        return res.status(400).json({ error: "docType is required" });
      }
      if (!Array.isArray(corrections) || corrections.length === 0) {
        return res
          .status(400)
          .json({ error: "corrections must be a non-empty array" });
      }

      const notes = learningNotes?.trim();
      const guidelines: Guideline[] = [];
      if (notes) {
        const rules = await llmProvider.extractLearningRules(
          docType,
          corrections,
          notes
        );
        const now = new Date().toISOString();
        for (const rule of rules) {
          guidelines.push({
            id: "",
            docType,
            rule,
            sourceCorrectionIds: [],
            createdAt: now,
          });
        }
      }

      res.json({ guidelines });
    } catch (error) {
      logger.error(error, "Learning rules request failed");
      res.status(500).json({ error: "Failed to extract learning rules" });
    }
  });

  /**
   * POST /api/documents
   * Save an extracted document
   */
  router.post(
    "/api/documents",
    requireAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const userId = getUserId(req);
        const {
          type,
          originalText,
          extractedData,
          validationErrors,
          appliedChanges,
          fieldMeta,
          extractionText,
          confidence,
        } = req.body;

        if (!type || !extractedData) {
          return res.status(400).json({
            error: "Missing required fields: type, extractedData",
          });
        }

        const doc = {
          id: "",
          type: type as DocType,
          originalText,
          extractionText,
          extractedData,
          appliedChanges,
          fieldMeta,
          validationErrors: validationErrors || [],
          validationWarnings: [],
          confidence,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const saved = await docRepo.save(doc, userId);
        res.status(201).json(saved);
      } catch (error) {
        logger.error(error, "Save document request failed");
        res.status(500).json({ error: "Failed to save document" });
      }
    }
  );

  router.get(
    "/api/documents",
    requireAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const userId = getUserId(req);
        const filters = req.query;
        const result = await docRepo.search(filters, userId);
        res.json(result);
      } catch (error) {
        logger.error(error, "List documents request failed");
        res.status(500).json({ error: "Failed to fetch documents" });
      }
    }
  );

  router.get(
    "/api/documents/:id",
    requireAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const userId = getUserId(req);
        const doc = await docRepo.findById(req.params.id, userId);
        if (!doc) {
          return res.status(404).json({ error: "Document not found" });
        }
        res.json(doc);
      } catch (error) {
        logger.error(error, "Get document request failed");
        res.status(500).json({ error: "Failed to fetch document" });
      }
    }
  );

  router.post(
    "/api/documents/:id/correct-batch",
    requireAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const userId = getUserId(req);
        const { corrections, learningNotes } = req.body as {
          corrections?: CorrectionInput[];
          learningNotes?: string;
        };

        if (!Array.isArray(corrections) || corrections.length === 0) {
          return res
            .status(400)
            .json({ error: "corrections must be a non-empty array" });
        }

        const doc = await docRepo.findById(req.params.id, userId);
        if (!doc) {
          return res.status(404).json({ error: "Document not found" });
        }

        const savedCorrections = [];
        for (const item of corrections) {
          const correction = await correctionRepo.saveCorrection(
            {
              id: "",
              docType: doc.type,
              field: item.field,
              originalValue: item.originalValue,
              correctedValue: item.correctedValue,
              contextSnippet: doc.originalText.slice(0, 200),
              userExplanation: learningNotes?.trim() || undefined,
              createdAt: new Date().toISOString(),
            },
            userId
          );
          savedCorrections.push(correction);
        }

        const guidelines = [];
        const notes = learningNotes?.trim();
        if (notes) {
          const rules = await llmProvider.extractLearningRules(
            doc.type,
            corrections,
            notes
          );
          const sourceIds = savedCorrections.map((c) => c.id);
          for (const rule of rules) {
            const guideline = await correctionRepo.saveGuideline(
              {
                id: "",
                docType: doc.type,
                rule,
                sourceCorrectionIds: sourceIds,
                createdAt: new Date().toISOString(),
              },
              userId
            );
            guidelines.push(guideline);
          }
        }

        res.status(201).json({
          corrections: savedCorrections,
          guidelines,
          message:
            guidelines.length > 0
              ? `Saved ${savedCorrections.length} correction(s) and ${guidelines.length} learned rule(s)`
              : `Saved ${savedCorrections.length} correction(s)`,
        });
      } catch (error) {
        logger.error(error, "Batch correction request failed");
        res.status(500).json({ error: "Failed to save corrections" });
      }
    }
  );

  router.post(
    "/api/documents/:id/correct",
    requireAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const userId = getUserId(req);
        const { field, originalValue, correctedValue, userExplanation } =
          req.body;

        const doc = await docRepo.findById(req.params.id, userId);
        if (!doc) {
          return res.status(404).json({ error: "Document not found" });
        }

        const correction = await correctionRepo.saveCorrection(
          {
            id: "",
            docType: doc.type,
            field,
            originalValue,
            correctedValue,
            contextSnippet: doc.originalText.slice(0, 200),
            userExplanation,
            createdAt: new Date().toISOString(),
          },
          userId
        );

        if (userExplanation) {
          await correctionRepo.saveGuideline(
            {
              id: "",
              docType: doc.type,
              rule: userExplanation,
              sourceCorrectionIds: [correction.id],
              createdAt: new Date().toISOString(),
            },
            userId
          );
        }

        doc.extractedData[field] = correctedValue;
        await docRepo.save(doc, userId);

        res.status(201).json({
          correction,
          message: "Correction saved and guideline created",
        });
      } catch (error) {
        logger.error(error, "Correction request failed");
        res.status(500).json({ error: "Failed to save correction" });
      }
    }
  );

  router.get(
    "/api/guidelines",
    requireAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const userId = getUserId(req);
        const docType = req.query.docType as DocType | undefined;
        const guidelines = await correctionRepo.listGuidelines(docType, userId);
        res.json(guidelines);
      } catch (error) {
        logger.error(error, "Get guidelines request failed");
        res.status(500).json({ error: "Failed to fetch guidelines" });
      }
    }
  );

  router.get(
    "/api/corrections",
    requireAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const userId = getUserId(req);
        const docType = req.query.docType as DocType | undefined;
        const corrections = await correctionRepo.listCorrections(
          docType,
          userId
        );
        res.json(corrections);
      } catch (error) {
        logger.error(error, "Get corrections request failed");
        res.status(500).json({ error: "Failed to fetch corrections" });
      }
    }
  );

  return router;
}
