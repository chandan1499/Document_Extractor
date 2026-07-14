import { Router, Request, Response, RequestHandler } from "express";
import { Multer } from "multer";
import { LLMProvider, DocType, Guideline, CorrectionInput } from "../types.js";
import { DocumentRepository } from "../types.js";
import { CorrectionRepository } from "../types.js";
import { extractDocument } from "../pipeline/index.js";
import { extractTextFromFile } from "../utils/fileExtractor.js";
import { logger } from "../config/logger.js";

type FileRequest = Request & { file?: Express.Multer.File };

export function createRoutes(
  docRepo: DocumentRepository,
  correctionRepo: CorrectionRepository,
  llmProvider: LLMProvider,
  upload?: Multer
): Router {
  const router = Router();

  /**
   * POST /api/extract
   * Extract a document from text
   */
  router.post("/api/extract", async (req: Request, res: Response) => {
    try {
      const { text, docType } = req.body;

      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Missing or invalid text field" });
      }

      // Optionally pass document type hint to filter relevant guidelines
      let guidelines: Guideline[] = [];
      if (docType) {
        guidelines = await correctionRepo.listGuidelines(
          docType as DocType
        );
      }

      // Pass guideline loader for auto-loading after classification
      const guidelineLoader = async (detectedDocType: string) =>
        correctionRepo.listGuidelines(detectedDocType as DocType);

      const doc = await extractDocument(
        text,
        llmProvider,
        guidelines,
        guidelineLoader
      );

      res.json(doc);
    } catch (error) {
      logger.error(error, "Extract request failed");
      res.status(500).json({
        error: "Failed to extract document",
        details: error instanceof Error ? error.message : "Unknown error",
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
          if (!req.file) {
            return res.status(400).json({ error: "No file provided" });
          }

          const { docType } = req.body;

          // Extract text from file based on type
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

          // Optionally pass document type hint to filter relevant guidelines
          let guidelines: Guideline[] = [];
          if (docType) {
            guidelines = await correctionRepo.listGuidelines(
              docType as DocType
            );
          }

          // Pass guideline loader for auto-loading after classification
          const guidelineLoader = async (detectedDocType: string) =>
            correctionRepo.listGuidelines(detectedDocType as DocType);

          const doc = await extractDocument(
            text,
            llmProvider,
            guidelines,
            guidelineLoader
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
      const { type, originalText, extractedData, validationErrors, appliedChanges } =
        req.body;

      if (!type || !extractedData) {
        return res.status(400).json({
          error: "Missing required fields: type, extractedData",
        });
      }

      const doc = {
        id: "",
        type: type as DocType,
        originalText,
        extractedData,
        appliedChanges,
        validationErrors: validationErrors || [],
        validationWarnings: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const saved = await docRepo.save(doc);
      res.status(201).json(saved);
    } catch (error) {
      logger.error(error, "Save document request failed");
      res.status(500).json({ error: "Failed to save document" });
    }
  });

  /**
   * GET /api/documents
   * List all saved documents with optional filters
   */
  router.get("/api/documents", async (req: Request, res: Response) => {
    try {
      const filters = req.query;
      const docs = await docRepo.search(filters);
      res.json(docs);
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
      const doc = await docRepo.findById(req.params.id);
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
        const { corrections, learningNotes } = req.body as {
          corrections?: CorrectionInput[];
          learningNotes?: string;
        };

        if (!Array.isArray(corrections) || corrections.length === 0) {
          return res
            .status(400)
            .json({ error: "corrections must be a non-empty array" });
        }

        const doc = await docRepo.findById(req.params.id);
        if (!doc) {
          return res.status(404).json({ error: "Document not found" });
        }

        const savedCorrections = [];
        for (const item of corrections) {
          const correction = await correctionRepo.saveCorrection({
            id: "",
            docType: doc.type,
            field: item.field,
            originalValue: item.originalValue,
            correctedValue: item.correctedValue,
            contextSnippet: doc.originalText.slice(0, 200),
            userExplanation: learningNotes?.trim() || undefined,
            createdAt: new Date().toISOString(),
          });
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
            const guideline = await correctionRepo.saveGuideline({
              id: "",
              docType: doc.type,
              rule,
              sourceCorrectionIds: sourceIds,
              createdAt: new Date().toISOString(),
            });
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
        const { field, originalValue, correctedValue, userExplanation } =
          req.body;

        const doc = await docRepo.findById(req.params.id);
        if (!doc) {
          return res.status(404).json({ error: "Document not found" });
        }

        // Save the correction
        const correction = await correctionRepo.saveCorrection({
          id: "",
          docType: doc.type,
          field,
          originalValue,
          correctedValue,
          contextSnippet: doc.originalText.slice(0, 200),
          userExplanation,
          createdAt: new Date().toISOString(),
        });

        // If user provided an explanation, create a guideline
        if (userExplanation) {
          await correctionRepo.saveGuideline({
            id: "",
            docType: doc.type,
            rule: userExplanation,
            sourceCorrectionIds: [correction.id],
            createdAt: new Date().toISOString(),
          });
        }

        // Update the document with the correction
        doc.extractedData[field] = correctedValue;
        await docRepo.save(doc);

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
      const docType = req.query.docType as DocType | undefined;
      const guidelines = await correctionRepo.listGuidelines(docType);
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
      const docType = req.query.docType as DocType | undefined;
      const corrections = await correctionRepo.listCorrections(docType);
      res.json(corrections);
    } catch (error) {
      logger.error(error, "Get corrections request failed");
      res.status(500).json({ error: "Failed to fetch corrections" });
    }
  });

  /**
   * GET /api/health
   * Health check
   */
  router.get("/api/health", (req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  return router;
}
