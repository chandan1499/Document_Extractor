import { ExtractedDocument, Guideline } from "../types/index";

const API_BASE = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "");

export async function extractDocument(text: string, docType?: string) {
  const response = await fetch(`${API_BASE}/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, docType }),
  });

  if (!response.ok) {
    throw new Error("Failed to extract document");
  }

  return (await response.json()) as ExtractedDocument;
}

export async function extractDocumentFromFile(
  file: File,
  docType?: string
) {
  const formData = new FormData();
  formData.append("file", file);
  if (docType) {
    formData.append("docType", docType);
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
    } catch (parseError) {
      throw new Error(
        `Server error (${response.status}): ${response.statusText}`
      );
    }
  }

  try {
    return (await response.json()) as ExtractedDocument;
  } catch (parseError) {
    throw new Error("Invalid response from server");
  }
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

export async function listDocuments(filters?: Record<string, unknown>) {
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

  return (await response.json()) as ExtractedDocument[];
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
