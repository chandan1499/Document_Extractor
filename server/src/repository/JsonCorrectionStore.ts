import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import {
  CorrectionRepository,
  Correction,
  Guideline,
  DocType,
} from "../types.js";

interface CorrectionData {
  corrections: Correction[];
  guidelines: Guideline[];
}

export class JsonCorrectionStore implements CorrectionRepository {
  private dataDir: string;
  private correctionsFile: string;

  constructor(dataDir: string = "./data") {
    this.dataDir = dataDir;
    this.correctionsFile = path.join(dataDir, "corrections.json");
  }

  private async ensureFile(): Promise<void> {
    try {
      await fs.access(this.correctionsFile);
    } catch {
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.writeFile(
        this.correctionsFile,
        JSON.stringify({ corrections: [], guidelines: [] }, null, 2)
      );
    }
  }

  private async readData(): Promise<CorrectionData> {
    await this.ensureFile();
    const content = await fs.readFile(this.correctionsFile, "utf-8");
    return JSON.parse(content);
  }

  private async writeData(data: CorrectionData): Promise<void> {
    await fs.writeFile(this.correctionsFile, JSON.stringify(data, null, 2));
  }

  async saveCorrection(correction: Correction): Promise<Correction> {
    const data = await this.readData();

    correction.id = uuidv4();
    correction.createdAt = new Date().toISOString();
    data.corrections.push(correction);

    await this.writeData(data);
    return correction;
  }

  async listCorrections(docType?: DocType): Promise<Correction[]> {
    const data = await this.readData();

    if (docType) {
      return data.corrections.filter((c) => c.docType === docType);
    }

    return data.corrections;
  }

  async saveGuideline(guideline: Guideline): Promise<Guideline> {
    const data = await this.readData();

    // Check for duplicates or similar rules
    const existingIdx = data.guidelines.findIndex(
      (g) =>
        g.docType === guideline.docType &&
        g.scopeKey === guideline.scopeKey &&
        g.rule.toLowerCase() === guideline.rule.toLowerCase()
    );

    if (existingIdx >= 0) {
      // Update existing guideline's source corrections
      data.guidelines[existingIdx].sourceCorrectionIds = Array.from(
        new Set([
          ...data.guidelines[existingIdx].sourceCorrectionIds,
          ...guideline.sourceCorrectionIds,
        ])
      );
    } else {
      guideline.id = uuidv4();
      guideline.createdAt = new Date().toISOString();
      data.guidelines.push(guideline);
    }

    await this.writeData(data);
    return guideline;
  }

  async listGuidelines(
    docType?: DocType,
    scopeKey?: string
  ): Promise<Guideline[]> {
    const data = await this.readData();

    let results = data.guidelines;

    if (docType) {
      results = results.filter((g) => g.docType === docType);
    }

    if (scopeKey !== undefined) {
      // Include both the scope-specific rules and the global rules
      results = results.filter((g) => !g.scopeKey || g.scopeKey === scopeKey);
    }

    // Return most recent first
    return results.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
}
