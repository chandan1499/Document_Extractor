import pino from "pino";
import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "4000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  groqApiKey: process.env.GROQ_API_KEY || "",
  llmProvider: process.env.LLM_PROVIDER || "groq",
  extractModel: process.env.EXTRACT_MODEL || "openai/gpt-oss-120b",
  classifyModel: process.env.CLASSIFY_MODEL || "llama-3.1-8b-instant",
  dataDir: process.env.DATA_DIR || "./data",
  logLevel: process.env.LOG_LEVEL || "info",
};

export const logger = pino({
  level: config.logLevel,
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      ignore: "pid,hostname",
    },
  },
});

if (!config.groqApiKey && config.llmProvider === "groq") {
  logger.warn("GROQ_API_KEY not set. LLM extraction will fail.");
}
