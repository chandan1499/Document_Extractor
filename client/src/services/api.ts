import {
  ExtractedDocument,
  ExtractionSchema,
  ExtractionSchemaSummary,
  FieldDefinition,
  Guideline,
  PaginatedResult,
  ProposedSchemaDraft,
} from "../types/index";
import { LocalDataBundle } from "../storage/types";

const API_BASE = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "");

interface AuthHandlers {
  getAccessToken: () => Promise<string | null>;
  onUnauthorized: () => Promise<void>;
  isAuthenticated: () => boolean;
}

let authHandlers: AuthHandlers | null = null;

export function setAuthHandlers(handlers: AuthHandlers) {
  authHandlers = handlers;
}

export interface ExtractRequestOptions {
  schemaId?: string;
  guestId?: string;
  guidelines?: Guideline[];
  schemaPayload?: ExtractionSchema;
}

async function authFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers);

  if (authHandlers) {
    const token = await authHandlers.getAccessToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (
    response.status === 401 &&
    authHandlers?.isAuthenticated() &&
    authHandlers.onUnauthorized
  ) {
    await authHandlers.onUnauthorized();
  }

  return response;
}

export async function extractDocument(
  text: string,
  options: ExtractRequestOptions = {}
) {
  const response = await authFetch("/extract", {
    method: "POST",
    headers: options.guestId
      ? { "X-Guest-Id": options.guestId }
      : undefined,
    body: JSON.stringify({
      text,
      schemaId: options.schemaId,
      guidelines: options.guidelines,
      schemaPayload: options.schemaPayload,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      (err as { details?: string; error?: string }).details ||
        (err as { error?: string }).error ||
        "Failed to extract document"
    );
  }

  return (await response.json()) as ExtractedDocument;
}

export async function extractDocumentFromFile(
  file: File,
  options: ExtractRequestOptions = {}
) {
  const formData = new FormData();
  formData.append("file", file);
  if (options.schemaId) {
    formData.append("schemaId", options.schemaId);
  }
  if (options.guidelines?.length) {
    formData.append("guidelines", JSON.stringify(options.guidelines));
  }
  if (options.schemaPayload) {
    formData.append("schemaPayload", JSON.stringify(options.schemaPayload));
  }

  const response = await authFetch("/extract-file", {
    method: "POST",
    headers: options.guestId
      ? { "X-Guest-Id": options.guestId }
      : undefined,
    body: formData,
  });

  if (!response.ok) {
    try {
      const error = await response.json();
      throw new Error(
        error.details || error.error || "Failed to extract document from file"
      );
    } catch (err) {
      if (err instanceof Error && err.message !== "Failed to extract document from file") {
        throw err;
      }
      throw new Error(
        `Server error (${response.status}): ${response.statusText}`
      );
    }
  }

  return (await response.json()) as ExtractedDocument;
}

export async function saveDocument(doc: ExtractedDocument) {
  const response = await authFetch("/documents", {
    method: "POST",
    body: JSON.stringify(doc),
  });

  if (!response.ok) {
    throw new Error("Failed to save document");
  }

  return (await response.json()) as ExtractedDocument;
}

export async function listDocuments(
  filters?: Record<string, unknown>
): Promise<PaginatedResult<ExtractedDocument>> {
  const params = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined) {
        params.append(key, String(value));
      }
    });
  }

  const response = await authFetch(`/documents?${params.toString()}`);

  if (!response.ok) {
    throw new Error("Failed to fetch documents");
  }

  return (await response.json()) as PaginatedResult<ExtractedDocument>;
}

export async function listAllDocuments(
  filters?: Record<string, unknown>
): Promise<ExtractedDocument[]> {
  const all: ExtractedDocument[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const result = await listDocuments({ ...filters, page, limit: 100 });
    all.push(...result.items);
    totalPages = result.totalPages;
    page += 1;
  }

  return all;
}

export async function getDocument(id: string) {
  const response = await authFetch(`/documents/${id}`);

  if (!response.ok) {
    throw new Error("Failed to fetch document");
  }

  return (await response.json()) as ExtractedDocument;
}

export async function submitCorrectionsBatch(
  docId: string,
  corrections: Array<{
    field: string;
    originalValue: unknown;
    correctedValue: unknown;
  }>,
  learningNotes?: string
) {
  const response = await authFetch(`/documents/${docId}/correct-batch`, {
    method: "POST",
    body: JSON.stringify({ corrections, learningNotes }),
  });

  if (!response.ok) {
    throw new Error("Failed to submit corrections");
  }

  return await response.json();
}

export async function extractLearningRules(
  docType: string,
  corrections: Array<{
    field: string;
    originalValue: unknown;
    correctedValue: unknown;
  }>,
  learningNotes?: string
) {
  const response = await authFetch("/learning-rules", {
    method: "POST",
    body: JSON.stringify({ docType, corrections, learningNotes }),
  });

  if (!response.ok) {
    throw new Error("Failed to extract learning rules");
  }

  return (await response.json()) as { guidelines: Guideline[] };
}

export async function submitCorrection(
  docId: string,
  field: string,
  originalValue: unknown,
  correctedValue: unknown,
  userExplanation?: string
) {
  const response = await authFetch(`/documents/${docId}/correct`, {
    method: "POST",
    body: JSON.stringify({
      field,
      originalValue,
      correctedValue,
      userExplanation,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to submit correction");
  }

  return await response.json();
}

export async function listGuidelines(docType?: string) {
  const params = new URLSearchParams();
  if (docType) {
    params.append("docType", docType);
  }

  const response = await authFetch(`/guidelines?${params.toString()}`);

  if (!response.ok) {
    throw new Error("Failed to fetch guidelines");
  }

  return (await response.json()) as Guideline[];
}

export async function listCorrections(docType?: string) {
  const params = new URLSearchParams();
  if (docType) {
    params.append("docType", docType);
  }

  const response = await authFetch(`/corrections?${params.toString()}`);

  if (!response.ok) {
    throw new Error("Failed to fetch corrections");
  }

  return await response.json();
}

export async function listSchemas(): Promise<ExtractionSchemaSummary[]> {
  const response = await authFetch("/schemas");
  if (!response.ok) {
    throw new Error("Failed to fetch schemas");
  }
  return (await response.json()) as ExtractionSchemaSummary[];
}

export async function getSchema(id: string): Promise<ExtractionSchema> {
  const response = await authFetch(`/schemas/${id}`);
  if (!response.ok) {
    throw new Error("Failed to fetch schema");
  }
  return (await response.json()) as ExtractionSchema;
}

export async function saveSchema(payload: {
  id?: string;
  name: string;
  description?: string;
  fieldDefinitions: FieldDefinition[];
  prompt?: string;
}): Promise<ExtractionSchema> {
  const response = await authFetch("/schemas", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error || "Failed to save schema"
    );
  }
  return (await response.json()) as ExtractionSchema;
}

export async function deleteSchema(id: string): Promise<void> {
  const response = await authFetch(`/schemas/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error || "Failed to delete schema"
    );
  }
}

export async function proposeSchema(payload: {
  sampleText: string;
  name?: string;
  description?: string;
}): Promise<ProposedSchemaDraft> {
  const response = await authFetch("/schemas/propose", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      (err as { details?: string; error?: string }).details ||
        (err as { error?: string }).error ||
        "Failed to propose schema"
    );
  }
  return (await response.json()) as ProposedSchemaDraft;
}

export async function syncLocal(bundle: LocalDataBundle) {
  const response = await authFetch("/sync-local", {
    method: "POST",
    body: JSON.stringify(bundle),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error || "Failed to sync local data"
    );
  }
  return await response.json();
}
