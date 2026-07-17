import express, { Express } from "express";
import cors from "cors";
import { Multer } from "multer";
import { createRoutes } from "./routes/index.js";
import {
  DocumentRepository,
  CorrectionRepository,
  LLMProvider,
} from "./types.js";
import { SchemaRegistry } from "./registry/index.js";
import { logger } from "./config/logger.js";
import { config } from "./config/logger.js";

export interface AppDeps {
  docRepo: DocumentRepository;
  correctionRepo: CorrectionRepository;
  llm: LLMProvider;
  schemaRegistry: SchemaRegistry;
  upload?: Multer;
}

export function createApp(deps: AppDeps): Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));

  app.use(
    createRoutes(
      deps.docRepo,
      deps.correctionRepo,
      deps.llm,
      deps.schemaRegistry,
      deps.upload
    )
  );

  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: Function) => {
      logger.error(err, "Unhandled error");
      res.status(500).json({
        error: "Internal server error",
        message: config.nodeEnv === "development" ? err.message : undefined,
      });
    }
  );

  return app;
}
