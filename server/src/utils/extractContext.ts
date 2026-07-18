import { Request } from "express";
import {
  CorrectionRepository,
  DocType,
  ExtractionSchema,
  Guideline,
} from "../types.js";
import { SchemaRegistry } from "../registry/index.js";

export interface ExtractRequestBody {
  text?: string;
  docType?: string;
  schemaId?: string;
  guidelines?: Guideline[];
  schemaPayload?: ExtractionSchema;
}

export interface ResolvedExtractContext {
  userId: string;
  resolvedSchemaId?: string;
  guidelines: Guideline[];
  schemaOverride?: ExtractionSchema;
  guidelineLoader?: (docType: string) => Promise<Guideline[]>;
}

export async function resolveExtractContext(
  req: Request,
  body: ExtractRequestBody,
  schemaRegistry: SchemaRegistry,
  correctionRepo: CorrectionRepository
): Promise<ResolvedExtractContext | { status: number; error: string }> {
  const resolvedSchemaId = body.schemaId || body.docType;

  if (req.user?.id) {
    const userId = req.user.id;

    if (
      resolvedSchemaId &&
      !(await schemaRegistry.has(resolvedSchemaId, userId))
    ) {
      return { status: 403, error: "Schema not accessible" };
    }

    let guidelines: Guideline[] = [];
    if (resolvedSchemaId) {
      guidelines = await correctionRepo.listGuidelines(
        resolvedSchemaId as DocType,
        userId
      );
    }

    const guidelineLoader = async (detectedDocType: string) =>
      correctionRepo.listGuidelines(detectedDocType as DocType, userId);

    return {
      userId,
      resolvedSchemaId,
      guidelines,
      guidelineLoader,
    };
  }

  let schemaOverride: ExtractionSchema | undefined;
  if (resolvedSchemaId) {
    if (schemaRegistry.isBuiltin(resolvedSchemaId)) {
      schemaOverride = undefined;
    } else if (body.schemaPayload?.id === resolvedSchemaId) {
      schemaOverride = body.schemaPayload;
    } else {
      return { status: 403, error: "Schema not accessible" };
    }
  }

  const guidelines = Array.isArray(body.guidelines) ? body.guidelines : [];

  return {
    userId: "",
    resolvedSchemaId,
    guidelines,
    schemaOverride,
    guidelineLoader: async () => [],
  };
}
