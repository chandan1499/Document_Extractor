import { useState, useEffect, useRef } from "react";
import { ExtractedDocument } from "../types/index";
import { listDocuments } from "../services/api";
import DocumentModal from "./DocumentModal";
import Papa from "papaparse";
import { humanizeLabel } from "../utils/labels";
import "../styles/DocumentList.css";

type CompareOp = "gt" | "gte" | "lt" | "lte" | "eq" | "";

export default function DocumentList() {
  const [documents, setDocuments] = useState<ExtractedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | "">("");
  const [fieldPath, setFieldPath] = useState("");
  const [fieldOp, setFieldOp] = useState<CompareOp>("");
  const [fieldValue, setFieldValue] = useState("");
  const [selectedDocument, setSelectedDocument] =
    useState<ExtractedDocument | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQ(filter), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [filter]);

  useEffect(() => {
    loadDocuments();
  }, [typeFilter, debouncedQ, fieldPath, fieldOp, fieldValue]);

  const loadDocuments = async () => {
    setLoading(true);
    setError(null);

    try {
      const filters: Record<string, unknown> = {};
      if (typeFilter) filters.type = typeFilter;
      if (debouncedQ.trim()) filters.q = debouncedQ.trim();

      const path = fieldPath.trim();
      const value = fieldValue.trim();
      if (path && value) {
        const key = fieldOp ? `${path}.${fieldOp}` : path;
        filters[key] = value;
      }

      const docs = await listDocuments(filters);
      setDocuments(docs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentClick = (doc: ExtractedDocument) => {
    setSelectedDocument(doc);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedDocument(null);
  };

  const handleExportJSON = () => {
    const json = JSON.stringify(documents, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    downloadFile(blob, "documents.json");
  };

  const handleExportCSV = () => {
    if (documents.length === 0) return;

    const flatDocs = documents.map((doc) => ({
      ID: doc.id,
      Type: doc.type,
      "Created At": doc.createdAt,
      ...flattenObj(doc.extractedData),
    }));

    const csv = Papa.unparse(flatDocs);
    const blob = new Blob([csv], { type: "text/csv" });
    downloadFile(blob, "documents.csv");
  };

  const downloadFile = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const flattenObj = (
    obj: Record<string, unknown>,
    prefix = "",
  ): Record<string, unknown> => {
    const flattened: Record<string, unknown> = {};

    Object.entries(obj).forEach(([key, value]) => {
      const newKey = prefix ? `${prefix}.${key}` : key;
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        Object.assign(
          flattened,
          flattenObj(value as Record<string, unknown>, newKey),
        );
      } else if (Array.isArray(value)) {
        flattened[newKey] = JSON.stringify(value);
      } else {
        flattened[newKey] = value;
      }
    });

    return flattened;
  };

  if (loading && documents.length === 0) {
    return <div className="document-list loading">Loading documents...</div>;
  }

  if (
    documents.length === 0 &&
    !typeFilter &&
    !debouncedQ &&
    !fieldPath &&
    !fieldValue &&
    !loading
  ) {
    return (
      <div className="document-list empty">
        <h2>No documents yet</h2>
        <p>Upload a document to get started!</p>
      </div>
    );
  }

  return (
    <div className="document-list">
      <h2>Saved Documents</h2>

      <div className="list-controls">
        <input
          type="text"
          placeholder="Search text (q)..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="search-input"
        />

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="type-filter"
        >
          <option value="">All Types</option>
          <option value="invoice">Invoice</option>
          <option value="resume">Resume</option>
          <option value="meeting_notes">Meeting Notes</option>
        </select>

        <button onClick={handleExportJSON} className="btn btn-secondary">
          Export JSON
        </button>
        <button onClick={handleExportCSV} className="btn btn-secondary">
          Export CSV
        </button>
      </div>

      <div className="field-query-controls">
        <input
          type="text"
          placeholder="Field path (e.g. vendor.name or total)"
          value={fieldPath}
          onChange={(e) => setFieldPath(e.target.value)}
          className="field-path-input"
        />
        <select
          value={fieldOp}
          onChange={(e) => setFieldOp(e.target.value as CompareOp)}
          className="field-op-select"
        >
          <option value="">contains</option>
          <option value="eq">=</option>
          <option value="gt">&gt;</option>
          <option value="gte">≥</option>
          <option value="lt">&lt;</option>
          <option value="lte">≤</option>
        </select>
        <input
          type="text"
          placeholder="Value (e.g. ACME or 50000)"
          value={fieldValue}
          onChange={(e) => setFieldValue(e.target.value)}
          className="field-value-input"
        />
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="documents-grid">
        {documents.length === 0 ? (
          <p className="no-results">No documents match your search</p>
        ) : (
          documents.map((doc) => (
            <div
              key={doc.id}
              className="document-card"
              onClick={() => handleDocumentClick(doc)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  handleDocumentClick(doc);
                }
              }}
            >
              <div className="card-header">
                <h3>{doc.type.toUpperCase()}</h3>
                <span className="doc-id">{doc.id.slice(0, 8)}...</span>
              </div>

              <div className="card-content">
                {Object.entries(doc.extractedData)
                  .slice(0, 3)
                  .map(([key, value]) => (
                    <div key={key} className="field-preview">
                      <strong>{humanizeLabel(key)}:</strong>{" "}
                      <span>
                        {typeof value === "object"
                          ? JSON.stringify(value).slice(0, 50)
                          : String(value).slice(0, 50)}
                      </span>
                    </div>
                  ))}
              </div>

              <div className="card-footer">
                <small>{new Date(doc.createdAt).toLocaleDateString()}</small>
              </div>
            </div>
          ))
        )}
      </div>

      <DocumentModal
        document={selectedDocument}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </div>
  );
}
