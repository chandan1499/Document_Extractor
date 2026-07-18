import { Router, Request, Response, RequestHandler } from "express";
import { Multer } from "multer";
import { LLMProvider, DocType, Guideline, CorrectionInput } from "../types.js";
import { DocumentRepository } from "../types.js";
import { CorrectionRepository } from "../types.js";
import { extractDocument } from "../pipeline/index.js";
import { extractTextFromFile } from "../utils/fileExtractor.js";
import { SchemaRegistry } from "../registry/index.js";
import { createSchemaRoutes } from "./schemas.js";
import { logger } from "../config/logger.js";

type FileRequest = Request & { file?: Express.Multer.File };

function getUserId(req: Request): string {
  return req.user!.id;
}

export function createRoutes(
  docRepo: DocumentRepository,
  correctionRepo: CorrectionRepository,
  llmProvider: LLMProvider,
  schemaRegistry: SchemaRegistry,
  upload?: Multer
): Router {
  const router = Router();

  router.use(createSchemaRoutes(schemaRegistry, llmProvider));

  /**
   * POST /api/extract
   * Extract a document from text
   */
  router.post("/api/extract", async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { text, docType, schemaId } = req.body;
      const resolvedSchemaId = schemaId || docType;

      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Missing or invalid text field" });
      }

      if (
        resolvedSchemaId &&
        !(await schemaRegistry.has(resolvedSchemaId, userId))
      ) {
        return res.status(403).json({ error: "Schema not accessible" });
      }

      let guidelines: Guideline[] = [];
      if (resolvedSchemaId) {
        guidelines = await correctionRepo.listGuidelines(
          resolvedSchemaId as DocType,
          userId
        );
      }

      const guidelineLoader = async (detectedDocType: string) =>
        correctionRepo.listGuidelines(detectedDocType as DocType, userId);

      const doc = await extractDocument(
        text,
        llmProvider,
        schemaRegistry,
        userId,
        guidelines,
        guidelineLoader,
        resolvedSchemaId ? { schemaId: resolvedSchemaId } : undefined
      );

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
  });

  /**
   * POST /api/extract-file
   * Upload and extract a file (TXT, PDF, CSV, or Image with OCR)
   */
  if (upload) {
    router.post(
      "/api/extract-file",
      upload.single("file") as unknown as RequestHandler,
      async (req: FileRequest, res: Response) => {
        try {
          const userId = getUserId(req);

          if (!req.file) {
            return res.status(400).json({ error: "No file provided" });
          }

          const { docType, schemaId } = req.body;
          const resolvedSchemaId = schemaId || docType;

          if (
            resolvedSchemaId &&
            !(await schemaRegistry.has(resolvedSchemaId, userId))
          ) {
            return res.status(403).json({ error: "Schema not accessible" });
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

          let guidelines: Guideline[] = [];
          if (resolvedSchemaId) {
            guidelines = await correctionRepo.listGuidelines(
              resolvedSchemaId as DocType,
              userId
            );
          }

          const guidelineLoader = async (detectedDocType: string) =>
            correctionRepo.listGuidelines(detectedDocType as DocType, userId);

          const doc = await extractDocument(
            text,
            llmProvider,
            schemaRegistry,
            userId,
            guidelines,
            guidelineLoader,
            resolvedSchemaId ? { schemaId: resolvedSchemaId } : undefined
          );

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
   * POST /api/documents
   * Save an extracted document
   */
  router.post("/api/documents", async (req: Request, res: Response) => {
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
  });

  /**
   * GET /api/documents
   * List saved documents with optional filters and pagination
   */
  router.get("/api/documents", async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const filters = req.query;
      const result = await docRepo.search(filters, userId);
      res.json(result);
    } catch (error) {
      logger.error(error, "List documents request failed");
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  /**
   * GET /api/documents/:id
   * Get a specific document
   */
  router.get("/api/documents/:id", async (req: Request, res: Response) => {
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
  });

  /**
   * POST /api/documents/:id/correct-batch
   * Submit multiple corrections with one shared learning note; LLM extracts rules.
   */
  router.post(
    "/api/documents/:id/correct-batch",
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

  /**
   * POST /api/documents/:id/correct
   * Submit a correction for a field
   */
  router.post(
    "/api/documents/:id/correct",
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

  /**
   * GET /api/guidelines
   * List learned guidelines
   */
  router.get("/api/guidelines", async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const docType = req.query.docType as DocType | undefined;
      const guidelines = await correctionRepo.listGuidelines(docType, userId);
      res.json(guidelines);
    } catch (error) {
      logger.error(error, "Get guidelines request failed");
      res.status(500).json({ error: "Failed to fetch guidelines" });
    }
  });

  /**
   * GET /api/corrections
   * List stored corrections
   */
  router.get("/api/corrections", async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const docType = req.query.docType as DocType | undefined;
      const corrections = await correctionRepo.listCorrections(docType, userId);
      res.json(corrections);
    } catch (error) {
      logger.error(error, "Get corrections request failed");
      res.status(500).json({ error: "Failed to fetch corrections" });
    }
  });

  return router;
}
