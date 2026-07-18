import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { ExtractedDocument } from "../types/index";
import { extractDocument, extractDocumentFromFile } from "../services/api";
import { useSchemas } from "../context/SchemasContext";
import "../styles/UploadArea.css";

interface UploadAreaProps {
  onDocumentExtracted: (doc: ExtractedDocument) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
}

export default function UploadArea({
  onDocumentExtracted,
  loading,
  setLoading,
}: UploadAreaProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [schemaId, setSchemaId] = useState("");
  const { schemas } = useSchemas();

  const onDrop = async (acceptedFiles: File[]) => {
    setError(null);
    setLoading(true);

    try {
      for (const file of acceptedFiles) {
        await handleFileExtract(file);
        return; // Process only the first file
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to read file"
      );
    } finally {
      setLoading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/plain": [".txt"],
      "application/pdf": [".pdf"],
      "text/csv": [".csv"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/gif": [".gif"],
      "image/webp": [".webp"],
    },
  });

  const handlePasteExtract = async () => {
    if (!text.trim()) {
      setError("Please enter some text");
      return;
    }

    await handleExtract(text);
  };

  const handleExtract = async (inputText: string) => {
    setLoading(true);
    setError(null);

    try {
      const doc = await extractDocument(
        inputText,
        schemaId || undefined
      );
      onDocumentExtracted(doc);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setLoading(false);
    }
  };

  const handleFileExtract = async (file: File) => {
    setLoading(true);
    setError(null);

    try {
      const doc = await extractDocumentFromFile(
        file,
        schemaId || undefined
      );
      onDocumentExtracted(doc);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`upload-area ${loading ? "loading-active" : ""}`}>
      <h2>Extract Data from Documents</h2>

      <div className="schema-select-row">
        <label htmlFor="schema-select">Document type</label>
        <select
          id="schema-select"
          value={schemaId}
          onChange={(e) => setSchemaId(e.target.value)}
          disabled={loading}
          className="schema-select"
        >
          <option value="">Auto-detect type</option>
          {schemas.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="upload-container">
        <div className="upload-panel text-panel">
          <h3>Text</h3>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your document text here..."
            className="paste-input"
            disabled={loading}
          />
          <button
            onClick={handlePasteExtract}
            className="btn btn-primary"
            disabled={loading || !text.trim()}
          >
            {loading ? "Processing..." : "Extract Data"}
          </button>
        </div>

        <div className="upload-panel advanced-panel">
          <h3>Advanced</h3>
          <p className="panel-hint">
            Upload or drag &amp; drop files (PDF, CSV, Images)
          </p>
          <div
            {...getRootProps()}
            className={`dropzone ${isDragActive ? "active" : ""} ${loading ? "disabled" : ""}`}
          >
            <input {...getInputProps()} disabled={loading} />
            {isDragActive ? (
              <p>Drop your files here...</p>
            ) : (
              <>
                <p>📁 Drag and drop files here</p>
                <p className="small">
                  or click to select (TXT, PDF, CSV, JPG, PNG, GIF, WebP)
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading && (
        <>
          <div className="loading-overlay"></div>
          <div className="loading-modal">
            <div className="spinner"></div>
            <p>Processing your document...</p>
          </div>
        </>
      )}
    </div>
  );
}
