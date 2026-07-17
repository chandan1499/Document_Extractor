import multer from "multer";
import { config, logger } from "./config/logger.js";
import { createApp } from "./app.js";
import { GroqProvider } from "./providers/GroqProvider.js";
import { PostgresDocumentRepository } from "./repository/PostgresDocumentRepository.js";
import { PostgresCorrectionRepository } from "./repository/PostgresCorrectionRepository.js";
import { PostgresSchemaRepository } from "./repository/SchemaRepository.js";
import { SchemaRegistry } from "./registry/index.js";
import { getPool, runMigrations } from "./db/pool.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

async function main() {
  if (!config.databaseUrl) {
    logger.error(
      "DATABASE_URL is required. Create a Supabase project, run db/schema.sql, and set DATABASE_URL."
    );
    process.exit(1);
  }

  await runMigrations();
  const pool = getPool();

  const llmProvider = new GroqProvider(
    config.groqApiKey,
    config.extractModel,
    config.classifyModel
  );
  const docRepository = new PostgresDocumentRepository(pool);
  const correctionStore = new PostgresCorrectionRepository(pool);
  const schemaRepository = new PostgresSchemaRepository(pool);
  const schemaRegistry = new SchemaRegistry(schemaRepository);
  await schemaRegistry.initialize();

  const app = createApp({
    docRepo: docRepository,
    correctionRepo: correctionStore,
    llm: llmProvider,
    schemaRegistry,
    upload,
  });

  app.listen(config.port, () => {
    logger.info(`Server running on http://localhost:${config.port}`);
    logger.info(`Environment: ${config.nodeEnv}`);
    logger.info(`LLM Provider: ${config.llmProvider}`);
    logger.info("Storage: Supabase Postgres");
  });
}

main().catch((err) => {
  logger.error(err, "Failed to start server");
  process.exit(1);
});
