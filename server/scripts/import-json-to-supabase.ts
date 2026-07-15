import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import { getPool, runMigrations, closePool } from "../src/db/pool.js";
import { PostgresDocumentRepository } from "../src/repository/PostgresDocumentRepository.js";
import { PostgresCorrectionRepository } from "../src/repository/PostgresCorrectionRepository.js";
import type { ExtractedDocument, Correction, Guideline } from "../src/types.js";

dotenv.config();

interface DocumentsFile {
  documents: ExtractedDocument[];
}

interface CorrectionsFile {
  corrections: Correction[];
  guidelines: Guideline[];
}

async function main() {
  const dataDir = process.env.DATA_DIR || "./data";
  const documentsPath = path.join(dataDir, "documents.json");
  const correctionsPath = path.join(dataDir, "corrections.json");

  await runMigrations();
  const pool = getPool();
  const docRepo = new PostgresDocumentRepository(pool);
  const corrRepo = new PostgresCorrectionRepository(pool);

  try {
    const docsContent = await fs.readFile(documentsPath, "utf-8");
    const docsData = JSON.parse(docsContent) as DocumentsFile;
    for (const doc of docsData.documents) {
      await docRepo.save(doc);
    }
    console.log(`Imported ${docsData.documents.length} documents`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.log("No documents.json found, skipping documents import");
    } else {
      throw err;
    }
  }

  try {
    const corrContent = await fs.readFile(correctionsPath, "utf-8");
    const corrData = JSON.parse(corrContent) as CorrectionsFile;
    for (const correction of corrData.corrections) {
      await corrRepo.saveCorrection(correction);
    }
    for (const guideline of corrData.guidelines) {
      await corrRepo.saveGuideline(guideline);
    }
    console.log(
      `Imported ${corrData.corrections.length} corrections and ${corrData.guidelines.length} guidelines`
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.log("No corrections.json found, skipping corrections import");
    } else {
      throw err;
    }
  }

  await closePool();
  console.log("Import complete");
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
