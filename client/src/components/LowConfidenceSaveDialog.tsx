import { RiskyField } from "../utils/riskyFields";
import { humanizeLabel } from "../utils/labels";
import type { MouseEvent } from "react";
import "../styles/LowConfidenceSaveDialog.css";

interface LowConfidenceSaveDialogProps {
  isOpen: boolean;
  fields: RiskyField[];
  saving?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onSelectField?: (fieldPath: string) => void;
}

export default function LowConfidenceSaveDialog({
  isOpen,
  fields,
  saving = false,
  onCancel,
  onConfirm,
  onSelectField,
}: LowConfidenceSaveDialogProps) {
  if (!isOpen) return null;

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !saving) {
      onCancel();
    }
  };

  return (
    <div className="save-confirm-backdrop" onClick={handleBackdropClick}>
      <div
        className="save-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-confirm-title"
      >
        <div className="save-confirm-header">
          <h2 id="save-confirm-title">Review before saving</h2>
          <p>
            {fields.length} field{fields.length === 1 ? "" : "s"} may need a
            second look. Please re-check these before saving this document.
          </p>
        </div>

        <div className="save-confirm-body">
          <ul className="save-confirm-field-list">
            {fields.map((item) => {
              const label = humanizeLabel(item.field);
              const content = (
                <>
                  <div className="save-confirm-field-row">
                    <span className="save-confirm-field-name">{label}</span>
                    {item.confidence != null && (
                      <span className="save-confirm-field-confidence">
                        {(item.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  {item.reason && (
                    <p className="save-confirm-field-reason">{item.reason}</p>
                  )}
                </>
              );

              if (onSelectField) {
                return (
                  <li key={item.field}>
                    <button
                      type="button"
                      className="save-confirm-field-item"
                      onClick={() => onSelectField(item.field)}
                      disabled={saving}
                    >
                      {content}
                    </button>
                  </li>
                );
              }

              return (
                <li key={item.field} className="save-confirm-field-item">
                  {content}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="save-confirm-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={saving}
          >
            Go back and review
          </button>
          <button
            type="button"
            className="btn btn-primary btn-save-anyway"
            onClick={onConfirm}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save anyway"}
          </button>
        </div>
      </div>
    </div>
  );
}
