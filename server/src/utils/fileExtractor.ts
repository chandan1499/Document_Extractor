import pdfParse from "pdf-parse";
import { parse as csvParse } from "csv-parse/sync";
import Tesseract from "tesseract.js";
import { logger } from "../config/logger.js";

export async function extractTextFromFile(
  buffer: Buffer,
  mimetype: string,
  filename: string
): Promise<string> {
  try {
    // PDF extraction
    if (mimetype === "application/pdf") {
      return await extractFromPDF(buffer);
    }

    // CSV extraction
    if (
      mimetype === "text/csv" ||
      filename.endsWith(".csv")
    ) {
      return await extractFromCSV(buffer);
    }

    // Image extraction (OCR)
    if (mimetype.startsWith("image/")) {
      return await extractFromImage(buffer);
    }

    // Plain text
    if (
      mimetype === "text/plain" ||
      filename.endsWith(".txt")
    ) {
      return buffer.toString("utf-8");
    }

    throw new Error(
      `Unsupported file type: ${mimetype}. Supported types: PDF, CSV, Images (JPG, PNG, GIF, WebP), TXT`
    );
  } catch (error) {
    logger.error(error, "File extraction error");
    throw error;
  }
}

async function extractFromPDF(buffer: Buffer): Promise<string> {
  try {
    if (!buffer || buffer.length === 0) {
      throw new Error("PDF buffer is empty");
    }

    const pdfData = await pdfParse(buffer);

    if (!pdfData || !pdfData.text) {
      throw new Error("PDF has no extractable text");
    }

    return pdfData.text.trim();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`PDF parsing failed: ${errorMsg}`);
  }
}

async function extractFromCSV(buffer: Buffer): Promise<string> {
  try {
    if (!buffer || buffer.length === 0) {
      throw new Error("CSV buffer is empty");
    }

    const csvText = buffer.toString("utf-8");

    if (!csvText.trim()) {
      throw new Error("CSV file is empty");
    }

    const records = csvParse(csvText, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
    });

    // Convert CSV records to a readable text format
    let text = "";

    if (Array.isArray(records) && records.length > 0) {
      // Add header
      const headers = Object.keys(records[0]);
      text += headers.join(" | ") + "\n";
      text += "-".repeat(Math.min(headers.join(" | ").length, 100)) + "\n";

      // Add rows
      for (const record of records) {
        text += Object.values(record).join(" | ") + "\n";
      }
    }

    return text.trim() || csvText.trim();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`CSV parsing failed: ${errorMsg}`);
  }
}

async function extractFromImage(buffer: Buffer): Promise<string> {
  try {
    if (!buffer || buffer.length === 0) {
      throw new Error("Image buffer is empty");
    }

    logger.info("Starting OCR for image");

    // Set timeout for OCR (30 seconds)
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("OCR processing timeout (30s exceeded)")),
        30000
      )
    );

    const ocrPromise = Tesseract.recognize(buffer, "eng", {
      logger: (m) => {
        if (m.status === "recognizing text") {
          logger.info(`OCR progress: ${Math.round(m.progress * 100)}%`);
        }
      },
    });

    const result = await Promise.race([ocrPromise, timeoutPromise]);

    const text = result?.data?.text?.trim();

    if (!text) {
      logger.warn("No text extracted from image");
      return ""; // Return empty string instead of throwing, LLM will handle it
    }

    return text;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Image OCR failed: ${errorMsg}`);
  }
}
