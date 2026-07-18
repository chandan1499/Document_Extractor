import {
  ExtractedDocument,
  ExtractionSchema,
  Guideline,
} from "../types/index";
import {
  canGuestExtract,
  getGuestId,
  getGuestQuota,
  GuestQuotaInfo,
  recordGuestExtract,
  syncGuestExtractCount,
} from "./guestQuota";
import { isBuiltinSchemaId } from "./builtinSchemas";
import { localStorageBackend } from "./localStorageBackend";
import { apiBackend } from "./apiBackend";
import * as api from "../services/api";

export interface ExtractOptions {
  schemaId?: string;
  isAuthenticated: boolean;
}

async function resolveGuestExtractPayload(schemaId?: string): Promise<{
  schemaPayload?: ExtractionSchema;
  guidelines: Guideline[];
}> {
  const guidelines = await localStorageBackend.listGuidelines(schemaId);
  if (!schemaId || isBuiltinSchemaId(schemaId)) {
    return { guidelines };
  }
  const schema = await localStorageBackend.getSchema(schemaId);
  if (!schema) {
    throw new Error("Schema not accessible");
  }
  return { schemaPayload: schema, guidelines };
}

export async function extractDocumentForUser(
  text: string,
  options: ExtractOptions
): Promise<ExtractedDocument> {
  if (!options.isAuthenticated) {
    if (!canGuestExtract()) {
      throw new Error("Guest extract limit reached. Sign in for unlimited access.");
    }
    const guestPayload = await resolveGuestExtractPayload(options.schemaId);
    const doc = await api.extractDocument(text, {
      schemaId: options.schemaId,
      guestId: getGuestId(),
      guidelines: guestPayload.guidelines,
      schemaPayload: guestPayload.schemaPayload,
    });
    recordGuestExtract();
    return doc;
  }

  return api.extractDocument(text, { schemaId: options.schemaId });
}

export async function extractDocumentFromFileForUser(
  file: File,
  options: ExtractOptions
): Promise<ExtractedDocument> {
  if (!options.isAuthenticated) {
    if (!canGuestExtract()) {
      throw new Error("Guest extract limit reached. Sign in for unlimited access.");
    }
    const guestPayload = await resolveGuestExtractPayload(options.schemaId);
    const doc = await api.extractDocumentFromFile(file, {
      schemaId: options.schemaId,
      guestId: getGuestId(),
      guidelines: guestPayload.guidelines,
      schemaPayload: guestPayload.schemaPayload,
    });
    recordGuestExtract();
    return doc;
  }

  return api.extractDocumentFromFile(file, { schemaId: options.schemaId });
}

export function getStorageBackend(isAuthenticated: boolean) {
  return isAuthenticated ? apiBackend : localStorageBackend;
}

export function readGuestQuota(): GuestQuotaInfo {
  return getGuestQuota();
}

export { syncGuestExtractCount };
