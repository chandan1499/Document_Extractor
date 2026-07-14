import React from "react";
import { ExtractedDocument } from "../types/index";
import { humanizeLabel } from "../utils/labels";
import "../styles/DocumentModal.css";

interface DocumentModalProps {
  document: ExtractedDocument | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function DocumentModal({
  document,
  isOpen,
  onClose,
}: DocumentModalProps) {
  if (!isOpen || !document) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-content">
        <div className="modal-header">
          <h2>{document.type.toUpperCase()}</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {/* Document ID and Metadata */}
          <section className="modal-section">
            <h3>Document Information</h3>
            <div className="info-grid">
              <div className="info-item">
                <label>ID</label>
                <code>{document.id}</code>
              </div>
              <div className="info-item">
                <label>Type</label>
                <span>{document.type}</span>
              </div>
              <div className="info-item">
                <label>Created</label>
                <span>{new Date(document.createdAt).toLocaleString()}</span>
              </div>
              <div className="info-item">
                <label>Updated</label>
                <span>{new Date(document.updatedAt).toLocaleString()}</span>
              </div>
              {document.confidence !== undefined && (
                <div className="info-item">
                  <label>Confidence</label>
                  <span>{(document.confidence * 100).toFixed(2)}%</span>
                </div>
              )}
            </div>
          </section>

          {/* Extracted Data */}
          <section className="modal-section">
            <h3>Extracted Data</h3>
            <div className="extracted-data">
              {Object.entries(document.extractedData).length === 0 ? (
                <p className="empty-data">No data extracted</p>
              ) : (
                Object.entries(document.extractedData).map(([key, value]) => (
                  <div key={key} className="data-item">
                    <label>{humanizeLabel(key)}</label>
                    <div className="data-value">
                      {typeof value === "object" ? (
                        <pre>{JSON.stringify(value, null, 2)}</pre>
                      ) : (
                        <span>{String(value)}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Original Text */}
          <section className="modal-section">
            <h3>Original Text</h3>
            <div className="original-text">
              <p>{document.originalText}</p>
            </div>
          </section>
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
