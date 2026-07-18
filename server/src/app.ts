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
import { optionalAuth, injectTestUser } from "./middleware/auth.js";
import {
  GuestQuotaStore,
  MemoryGuestQuotaStore,
} from "./middleware/guestQuota.js";

export interface AppDeps {
  docRepo: DocumentRepository;
  correctionRepo: CorrectionRepository;
  llm: LLMProvider;
  schemaRegistry: SchemaRegistry;
  upload?: Multer;
  guestQuotaStore?: GuestQuotaStore;
  /** When set, skips JWT verification and injects this user (tests only). */
  testUserId?: string;
}

export function createApp(deps: AppDeps): Express {
  const app = express();

  app.use(
    cors({
      exposedHeaders: ["Authorization"],
    })
  );
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  if (deps.testUserId) {
    app.use(injectTestUser(deps.testUserId));
  } else {
    app.use(optionalAuth);
  }

  const guestQuotaStore =
    deps.guestQuotaStore ?? new MemoryGuestQuotaStore();

  app.use(
    createRoutes(
      deps.docRepo,
      deps.correctionRepo,
      deps.llm,
      deps.schemaRegistry,
      deps.upload,
      guestQuotaStore
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
