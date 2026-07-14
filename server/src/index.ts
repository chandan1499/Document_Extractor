import multer from "multer";
import { config, logger } from "./config/logger.js";
import { createApp } from "./app.js";
import { GroqProvider } from "./providers/GroqProvider.js";
import { JsonFileRepository } from "./repository/JsonFileRepository.js";
import { JsonCorrectionStore } from "./repository/JsonCorrectionStore.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const llmProvider = new GroqProvider(
  config.groqApiKey,
  config.extractModel,
  config.classifyModel
);
const docRepository = new JsonFileRepository(config.dataDir);
const correctionStore = new JsonCorrectionStore(config.dataDir);

const app = createApp({
  docRepo: docRepository,
  correctionRepo: correctionStore,
  llm: llmProvider,
  upload,
});

app.listen(config.port, () => {
  logger.info(`Server running on http://localhost:${config.port}`);
  logger.info(`Environment: ${config.nodeEnv}`);
  logger.info(`LLM Provider: ${config.llmProvider}`);
  logger.info(`Data directory: ${config.dataDir}`);
});
