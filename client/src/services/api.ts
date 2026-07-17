import {
  ExtractedDocument,
  ExtractionSchema,
  ExtractionSchemaSummary,
  FieldDefinition,
  Guideline,
  PaginatedResult,
  ProposedSchemaDraft,
} from "../types/index";

const API_BASE = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "");

export async function extractDocument(text: string, schemaId?: string) {
  const response = await fetch(`${API_BASE}/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, schemaId }),
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
  schemaId?: string
) {
  const formData = new FormData();
  formData.append("file", file);
  if (schemaId) {
    formData.append("schemaId", schemaId);
  }

  const response = await fetch(`${API_BASE}/extract-file`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    try {
      const error = await response.json();
      throw new Error(
        error.details || error.error || "Failed to extract document from file"
      );
    } catch {
      throw new Error(
        `Server error (${response.status}): ${response.statusText}`
      );
    }
  }

  return (await response.json()) as ExtractedDocument;
}

export async function saveDocument(doc: ExtractedDocument) {
  const response = await fetch(`${API_BASE}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

  const response = await fetch(`${API_BASE}/documents?${params.toString()}`);

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
  const response = await fetch(`${API_BASE}/documents/${id}`);

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
  const response = await fetch(`${API_BASE}/documents/${docId}/correct-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ corrections, learningNotes }),
  });

  if (!response.ok) {
    throw new Error("Failed to submit corrections");
  }

  return await response.json();
}

export async function submitCorrection(
  docId: string,
  field: string,
  originalValue: unknown,
  correctedValue: unknown,
  userExplanation?: string
) {
  const response = await fetch(`${API_BASE}/documents/${docId}/correct`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

  const response = await fetch(`${API_BASE}/guidelines?${params.toString()}`);

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

  const response = await fetch(`${API_BASE}/corrections?${params.toString()}`);

  if (!response.ok) {
    throw new Error("Failed to fetch corrections");
  }

  return await response.json();
}

export async function listSchemas(): Promise<ExtractionSchemaSummary[]> {
  const response = await fetch(`${API_BASE}/schemas`);
  if (!response.ok) {
    throw new Error("Failed to fetch schemas");
  }
  return (await response.json()) as ExtractionSchemaSummary[];
}

export async function getSchema(id: string): Promise<ExtractionSchema> {
  const response = await fetch(`${API_BASE}/schemas/${id}`);
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
  const response = await fetch(`${API_BASE}/schemas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  const response = await fetch(`${API_BASE}/schemas/${id}`, {
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
  const response = await fetch(`${API_BASE}/schemas/propose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
