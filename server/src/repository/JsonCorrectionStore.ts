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

  async saveCorrection(
    correction: Correction,
    userId: string
  ): Promise<Correction> {
    const data = await this.readData();

    correction.id = uuidv4();
    correction.createdAt = new Date().toISOString();
    correction.userId = userId;
    data.corrections.push(correction);

    await this.writeData(data);
    return correction;
  }

  async listCorrections(
    docType: DocType | undefined,
    userId: string
  ): Promise<Correction[]> {
    const data = await this.readData();
    let results = data.corrections.filter((c) => c.userId === userId);

    if (docType) {
      results = results.filter((c) => c.docType === docType);
    }

    return results;
  }

  async saveGuideline(
    guideline: Guideline,
    userId: string
  ): Promise<Guideline> {
    const data = await this.readData();
    guideline.userId = userId;

    const existingIdx = data.guidelines.findIndex(
      (g) =>
        g.userId === userId &&
        g.docType === guideline.docType &&
        g.scopeKey === guideline.scopeKey &&
        g.rule.toLowerCase() === guideline.rule.toLowerCase()
    );

    if (existingIdx >= 0) {
      data.guidelines[existingIdx].sourceCorrectionIds = Array.from(
        new Set([
          ...data.guidelines[existingIdx].sourceCorrectionIds,
          ...guideline.sourceCorrectionIds,
        ])
      );
      return data.guidelines[existingIdx];
    }

    guideline.id = uuidv4();
    guideline.createdAt = new Date().toISOString();
    data.guidelines.push(guideline);

    await this.writeData(data);
    return guideline;
  }

  async listGuidelines(
    docType: DocType | undefined,
    userId: string,
    scopeKey?: string
  ): Promise<Guideline[]> {
    const data = await this.readData();

    let results = data.guidelines.filter((g) => g.userId === userId);

    if (docType) {
      results = results.filter((g) => g.docType === docType);
    }

    if (scopeKey !== undefined) {
      results = results.filter((g) => !g.scopeKey || g.scopeKey === scopeKey);
    }

    return results.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
}
