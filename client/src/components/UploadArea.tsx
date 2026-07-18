import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { ExtractedDocument } from "../types/index";
import { useSchemas } from "../context/SchemasContext";
import { useStorage } from "../storage/StorageContext";
import { useAuth } from "../context/AuthContext";
import { getGuestQuota } from "../storage/guestQuota";
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
  const { extractDocument, extractDocumentFromFile } = useStorage();
  const { session } = useAuth();
  const [guestQuota, setGuestQuota] = useState(getGuestQuota);

  useEffect(() => {
    if (!session) {
      setGuestQuota(getGuestQuota());
    }
  }, [session]);

  const extractDisabled =
    loading || (!session && !guestQuota.canExtract);

  const onDrop = async (acceptedFiles: File[]) => {
    if (extractDisabled) return;
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
    if (extractDisabled) return;
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
      if (!session) {
        setGuestQuota(getGuestQuota());
      }
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
      if (!session) {
        setGuestQuota(getGuestQuota());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`upload-area ${loading ? "loading-active" : ""}`}>
      <h2>Extract Data from Documents</h2>

      {!session && (
        <p className="guest-quota-banner">
          {guestQuota.canExtract ? (
            <>
              Local mode — {guestQuota.remaining} of {guestQuota.limit} free
              extractions remaining.{" "}
              <Link to="/login">Sign in</Link> for unlimited access.
            </>
          ) : (
            <>
              You&apos;ve used all {guestQuota.limit} free extractions.{" "}
              <Link to="/login">Sign in</Link> for unlimited access.
            </>
          )}
        </p>
      )}

      <div className="schema-select-row">
        <label htmlFor="schema-select">Document type</label>
        <select
          id="schema-select"
          value={schemaId}
          onChange={(e) => setSchemaId(e.target.value)}
          disabled={extractDisabled}
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
            disabled={extractDisabled}
          />
          <button
            onClick={handlePasteExtract}
            className="btn btn-primary"
            disabled={extractDisabled || !text.trim()}
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
            className={`dropzone ${isDragActive ? "active" : ""} ${extractDisabled ? "disabled" : ""}`}
          >
            <input {...getInputProps()} disabled={extractDisabled} />
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
