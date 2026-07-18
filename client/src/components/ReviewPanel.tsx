import { useMemo, useState } from "react";
import { ExtractedDocument, FieldMeta } from "../types/index";
import { useStorage } from "../storage/StorageContext";
import { humanizeLabel } from "../utils/labels";
import {
  collectRiskyFields,
  LOW_CONFIDENCE_THRESHOLD,
} from "../utils/riskyFields";
import LowConfidenceSaveDialog from "./LowConfidenceSaveDialog";
import "../styles/ReviewPanel.css";

interface ReviewPanelProps {
  document: ExtractedDocument;
  onSaved: () => void;
  onCancel: () => void;
}

interface FieldEdit {
  original: unknown;
  corrected: unknown;
}

interface TextSpan {
  start: number;
  end: number;
  kind: "chosen" | "alternative";
}

function buildHighlightSpans(meta: FieldMeta): TextSpan[] {
  const spans: TextSpan[] = [];
  if (meta.start != null && meta.end != null && meta.end > meta.start) {
    spans.push({ start: meta.start, end: meta.end, kind: "chosen" });
  }
  for (const alt of meta.alternatives ?? []) {
    if (alt.start != null && alt.end != null && alt.end > alt.start) {
      spans.push({ start: alt.start, end: alt.end, kind: "alternative" });
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

function HighlightedText({
  text,
  meta,
}: {
  text: string;
  meta: FieldMeta | undefined;
}) {
  if (!meta) return <>{text}</>;

  const spans = buildHighlightSpans(meta);
  if (spans.length === 0) return <>{text}</>;

  const parts: JSX.Element[] = [];
  let cursor = 0;

  spans.forEach((span, i) => {
    if (span.start > cursor) {
      parts.push(<span key={`t-${i}`}>{text.slice(cursor, span.start)}</span>);
    }
    parts.push(
      <mark
        key={`m-${i}`}
        className={
          span.kind === "chosen" ? "source-chosen" : "source-alternative"
        }
      >
        {text.slice(span.start, span.end)}
      </mark>,
    );
    cursor = span.end;
  });

  if (cursor < text.length) {
    parts.push(<span key="tail">{text.slice(cursor)}</span>);
  }

  return <>{parts}</>;
}

function confidenceBadgeClass(confidence: number): string {
  if (confidence < LOW_CONFIDENCE_THRESHOLD) return "low";
  if (confidence >= 0.9) return "high";
  return "medium";
}

function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    if (Array.isArray(acc)) {
      const idx = Number(key);
      return Number.isInteger(idx) ? acc[idx] : undefined;
    }
    if (typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/** Set a value at a dotted path (e.g. vendor.name or lineItems.0.total). */
function setByPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const keys = path.split(".");
  const next: Record<string, unknown> = JSON.parse(JSON.stringify(obj));

  if (path.includes(".") && path in next) {
    delete next[path];
  }

  if (keys.length === 1) {
    next[path] = value;
    return next;
  }

  let cursor: unknown = next;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const nextKey = keys[i + 1];
    const nextIsIndex = /^\d+$/.test(nextKey);

    if (Array.isArray(cursor)) {
      const idx = Number(key);
      const existing = cursor[idx];
      if (!existing || typeof existing !== "object") {
        cursor[idx] = nextIsIndex ? [] : {};
      } else {
        cursor[idx] = Array.isArray(existing)
          ? [...existing]
          : { ...(existing as Record<string, unknown>) };
      }
      cursor = cursor[idx];
    } else {
      const record = cursor as Record<string, unknown>;
      const existing = record[key];
      if (!existing || typeof existing !== "object") {
        record[key] = nextIsIndex ? [] : {};
      } else if (Array.isArray(existing)) {
        record[key] = [...existing];
      } else {
        record[key] = { ...(existing as Record<string, unknown>) };
      }
      cursor = record[key];
    }
  }

  const last = keys[keys.length - 1];
  if (Array.isArray(cursor)) {
    cursor[Number(last)] = value;
  } else {
    (cursor as Record<string, unknown>)[last] = value;
  }
  return next;
}

function fieldDomId(fieldPath: string): string {
  return `field-${fieldPath.replace(/\./g, "-")}`;
}

export default function ReviewPanel({
  document,
  onSaved,
  onCancel,
}: ReviewPanelProps) {
  const { storage } = useStorage();
  const [editedData, setEditedData] = useState(() => {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(document.extractedData)) {
      if (!key.includes(".")) cleaned[key] = value;
    }
    return cleaned;
  });
  const [corrections, setCorrections] = useState<Map<string, FieldEdit>>(
    new Map(),
  );
  const [learningNotes, setLearningNotes] = useState("");
  const [appliedChanges, setAppliedChanges] = useState(
    document.appliedChanges || [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [selectedFieldPath, setSelectedFieldPath] = useState<string | null>(
    null,
  );

  const editedFieldPaths = useMemo(
    () => new Set(corrections.keys()),
    [corrections],
  );
  const riskyFields = useMemo(
    () =>
      collectRiskyFields({
        fieldMeta: document.fieldMeta,
        validationErrors: document.validationErrors,
        validationWarnings: document.validationWarnings,
        editedFieldPaths,
      }),
    [
      document.fieldMeta,
      document.validationErrors,
      document.validationWarnings,
      editedFieldPaths,
    ],
  );

  const fieldMetaMap = useMemo(() => {
    const map = new Map<string, FieldMeta>();
    for (const meta of document.fieldMeta ?? []) {
      const key = meta.field.replace(/^data\./, "");
      const existing = map.get(key);
      if (!existing || meta.confidence < existing.confidence) {
        map.set(key, { ...meta, field: key });
      }
    }
    return map;
  }, [document.fieldMeta]);
  const anchorText = document.extractionText ?? document.originalText;

  const valuesEqual = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);

  const handleFieldChange = (fieldPath: string, value: unknown) => {
    const original = getByPath(document.extractedData, fieldPath);
    setCorrections((prev) => {
      const next = new Map(prev);
      if (JSON.stringify(value) !== JSON.stringify(original)) {
        next.set(fieldPath, {
          original,
          corrected: value,
        });
      } else {
        next.delete(fieldPath);
      }
      return next;
    });
    setEditedData((prev) => setByPath(prev, fieldPath, value));
  };

  const handleAcceptFields = (fields: string[]) => {
    const fieldSet = new Set(fields);
    const targets = appliedChanges.filter((c) => fieldSet.has(c.field));
    if (targets.length === 0) return;

    setAppliedChanges(
      appliedChanges.map((c) =>
        fieldSet.has(c.field) ? { ...c, accepted: true } : c,
      ),
    );
    setEditedData((prev) => {
      let next = prev;
      for (const change of targets) {
        next = setByPath(next, change.field, change.correctedValue);
      }
      return next;
    });
    setCorrections((prev) => {
      const next = new Map(prev);
      for (const field of fields) next.delete(field);
      return next;
    });
  };

  const handleRejectFields = (fields: string[]) => {
    const fieldSet = new Set(fields);
    const targets = appliedChanges.filter((c) => fieldSet.has(c.field));
    if (targets.length === 0) return;

    setAppliedChanges(
      appliedChanges.map((c) =>
        fieldSet.has(c.field) ? { ...c, accepted: false } : c,
      ),
    );
    setEditedData((prev) => {
      let next = prev;
      for (const change of targets) {
        next = setByPath(next, change.field, change.originalValue);
      }
      return next;
    });
    setCorrections((prev) => {
      const next = new Map(prev);
      for (const field of fields) next.delete(field);
      return next;
    });
  };

  const handleAcceptRule = (rule: string) => {
    handleAcceptFields(
      appliedChanges.filter((c) => c.rule === rule).map((c) => c.field),
    );
  };

  const handleRejectRule = (rule: string) => {
    handleRejectFields(
      appliedChanges.filter((c) => c.rule === rule).map((c) => c.field),
    );
  };

  const handleSaveClick = () => {
    if (riskyFields.length > 0) {
      setShowSaveConfirm(true);
      return;
    }
    void performSave();
  };

  const performSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const docToSave = {
        ...document,
        extractedData: editedData,
        appliedChanges: appliedChanges.length > 0 ? appliedChanges : undefined,
        fieldMeta: document.fieldMeta,
        extractionText: document.extractionText,
        confidence: document.confidence,
      };

      const saved = await storage.saveDocument(docToSave);

      if (corrections.size > 0) {
        await storage.submitCorrectionsBatch(
          saved.id,
          saved.type,
          saved.originalText,
          [...corrections.entries()].map(([field, correction]) => ({
            field,
            originalValue: correction.original,
            correctedValue: correction.corrected,
          })),
          learningNotes.trim() || undefined,
        );
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleSelectRiskyField = (fieldPath: string) => {
    setSelectedFieldPath(fieldPath);
    setShowSaveConfirm(false);
    requestAnimationFrame(() => {
      window.document
        .getElementById(fieldDomId(fieldPath))
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const renderCandidateSwitcher = (fieldPath: string) => {
    const meta = fieldMetaMap.get(fieldPath);
    if (
      !meta ||
      meta.confidence >= LOW_CONFIDENCE_THRESHOLD ||
      !meta.alternatives?.length
    ) {
      return null;
    }

    const currentValue = getByPath(editedData, fieldPath);
    const candidates = [
      { label: "Chosen", value: currentValue },
      ...meta.alternatives.map((alt, i) => ({
        label: `Alt ${i + 1}`,
        value: alt.value,
      })),
    ];

    return (
      <div className="candidate-switcher">
        <span className="candidate-switcher-label">
          {candidates.length} candidates —{" "}
          {meta.reason || "multiple values found in document"}
        </span>
        <div className="candidate-buttons">
          {candidates.map((c, i) => (
            <button
              key={i}
              type="button"
              className={`btn-small candidate-btn ${
                valuesEqual(currentValue, c.value) ? "active" : ""
              }`}
              onClick={() => {
                handleFieldChange(fieldPath, c.value);
                setSelectedFieldPath(fieldPath);
              }}
            >
              {typeof c.value === "object"
                ? JSON.stringify(c.value)
                : String(c.value)}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderFieldLabel = (fieldPath: string) => {
    const meta = fieldMetaMap.get(fieldPath);
    const validationMessage = getFieldValidationMessage(fieldPath);
    const leaf = fieldPath.split(".").pop() ?? fieldPath;
    const displayConfidence =
      meta?.confidence ??
      (validationMessage ? LOW_CONFIDENCE_THRESHOLD - 0.01 : undefined) ??
      (document.fieldMeta?.length ? 0.85 : undefined);

    return (
      <div
        className="field-label-row"
        onClick={() => setSelectedFieldPath(fieldPath)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSelectedFieldPath(fieldPath);
          }
        }}
        role="button"
        tabIndex={0}
      >
        <label>{humanizeLabel(leaf)}</label>
        {displayConfidence != null && (
          <span
            className={`confidence-badge ${confidenceBadgeClass(displayConfidence)}`}
            title={
              meta?.reason ||
              validationMessage ||
              `Confidence: ${(displayConfidence * 100).toFixed(0)}%`
            }
          >
            {(displayConfidence * 100).toFixed(0)}%
          </span>
        )}
      </div>
    );
  };

  const fieldGroupClass = (fieldPath: string, extra = "") => {
    const meta = fieldMetaMap.get(fieldPath);
    const hasValidationIssue =
      document.validationErrors.some((i) => i.field === fieldPath) ||
      document.validationWarnings.some((i) => i.field === fieldPath);
    const classes = ["field-group", extra].filter(Boolean);
    if (
      (meta && meta.confidence < LOW_CONFIDENCE_THRESHOLD) ||
      hasValidationIssue
    ) {
      classes.push("low-confidence");
    }
    if (selectedFieldPath === fieldPath) {
      classes.push("selected-field");
    }
    return classes.join(" ");
  };

  const getFieldValidationMessage = (fieldPath: string): string | undefined => {
    const issue =
      document.validationErrors.find((i) => i.field === fieldPath) ??
      document.validationWarnings.find((i) => i.field === fieldPath);
    return issue?.message;
  };

  const renderScalar = (fieldPath: string, value: unknown): JSX.Element => {
    const leaf = fieldPath.split(".").pop()?.toLowerCase() || "";
    const isNotesField = leaf === "notes" || leaf === "description" || leaf === "summary";
    const className = `field-input ${corrections.has(fieldPath) ? "edited" : ""}`;

    if (value === null || value === undefined) {
      return isNotesField ? (
        <textarea
          value=""
          onChange={(e) => handleFieldChange(fieldPath, e.target.value)}
          className={className}
          placeholder="(empty)"
          rows={3}
        />
      ) : (
        <input
          type="text"
          value=""
          onChange={(e) => handleFieldChange(fieldPath, e.target.value)}
          className={className}
          placeholder="(empty)"
        />
      );
    }

    if (typeof value === "number") {
      return (
        <input
          type="number"
          value={value}
          onChange={(e) =>
            handleFieldChange(
              fieldPath,
              e.target.value === "" ? 0 : Number(e.target.value),
            )
          }
          className={className}
        />
      );
    }

    if (isNotesField) {
      return (
        <textarea
          value={String(value)}
          onChange={(e) => handleFieldChange(fieldPath, e.target.value)}
          className={className}
          rows={3}
        />
      );
    }

    return (
      <input
        type="text"
        value={String(value)}
        onChange={(e) => handleFieldChange(fieldPath, e.target.value)}
        className={className}
      />
    );
  };

  const renderField = (fieldPath: string, value: unknown): JSX.Element => {
    if (Array.isArray(value)) {
      return (
        <div className="nested-array">
          {value.length === 0 && (
            <p className="nested-empty">(empty list)</p>
          )}
          {value.map((item, idx) => (
            <div key={idx} className="nested-item">
              <div className="nested-item-header">Item {idx + 1}</div>
              {item !== null && typeof item === "object" && !Array.isArray(item)
                ? Object.entries(item as Record<string, unknown>).map(
                    ([k, v]) => (
                      <div
                        key={k}
                        id={fieldDomId(`${fieldPath}.${idx}.${k}`)}
                        className={fieldGroupClass(`${fieldPath}.${idx}.${k}`, "nested")}
                      >
                        {renderFieldLabel(`${fieldPath}.${idx}.${k}`)}
                        {renderField(`${fieldPath}.${idx}.${k}`, v)}
                        {renderCandidateSwitcher(`${fieldPath}.${idx}.${k}`)}
                      </div>
                    ),
                  )
                : renderField(`${fieldPath}.${idx}`, item)}
            </div>
          ))}
        </div>
      );
    }

    if (value !== null && typeof value === "object") {
      return (
        <div className="nested-object">
          {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
            <div
              key={k}
              id={fieldDomId(`${fieldPath}.${k}`)}
              className={fieldGroupClass(`${fieldPath}.${k}`, "nested")}
            >
              {renderFieldLabel(`${fieldPath}.${k}`)}
              {renderField(`${fieldPath}.${k}`, v)}
              {renderCandidateSwitcher(`${fieldPath}.${k}`)}
            </div>
          ))}
        </div>
      );
    }

    return (
      <>
        {renderScalar(fieldPath, value)}
        {renderCandidateSwitcher(fieldPath)}
      </>
    );
  };

  const hasErrors = document.validationErrors.length > 0;
  const hasWarnings = document.validationWarnings.length > 0;
  const hasCorrections = corrections.size > 0;

  return (
    <div className="review-panel">
      <h2>Review Extracted Data</h2>

      <div className="review-container">
        <div className="panel original-text">
          <h3>
            Original Document
            <span className="char-count">
              {" "}
              ({anchorText.length.toLocaleString()} chars)
            </span>
          </h3>
          <div className="text-content">
            <HighlightedText
              text={anchorText}
              meta={
                selectedFieldPath
                  ? fieldMetaMap.get(selectedFieldPath)
                  : undefined
              }
            />
          </div>
        </div>

        <div className="panel extracted-data">
          <h3>Extracted Fields</h3>

          <div className="fields-section">
            {Object.entries(editedData)
              .filter(([field]) => !field.includes("."))
              .map(([field, value]) => (
                <div
                  key={field}
                  id={fieldDomId(field)}
                  className={fieldGroupClass(field)}
                >
                  {renderFieldLabel(field)}
                  {renderField(field, value)}
                </div>
              ))}

            {hasCorrections && (
              <div className="learning-notes-section">
                <label htmlFor="learning-notes">
                  Learning notes for {corrections.size} correction
                  {corrections.size === 1 ? "" : "s"} (optional)
                </label>
                <p className="learning-notes-hint">
                  Describe why the extraction was wrong. You can include multiple
                  rules in one note — the system will extract and remember each
                  rule separately.
                </p>
                <textarea
                  id="learning-notes"
                  placeholder={`e.g.\n• Vendor is always ZOMATO LIMITED, not ZMT LIMITED\n• Total must include GST\n• Invoice date format is DD/MM/YYYY`}
                  value={learningNotes}
                  onChange={(e) => setLearningNotes(e.target.value)}
                  className="explanation-input learning-notes-input"
                  rows={4}
                />
              </div>
            )}

            {appliedChanges && appliedChanges.length > 0 && (
              <div className="applied-changes-section">
                <h4>📋 Applied Guideline Changes - Review & Accept</h4>
                {(() => {
                  const groups = new Map<
                    string,
                    typeof appliedChanges
                  >();
                  for (const change of appliedChanges) {
                    const list = groups.get(change.rule) || [];
                    list.push(change);
                    groups.set(change.rule, list);
                  }

                  return [...groups.entries()].map(([rule, changes]) => {
                    const states = changes.map((change) => {
                      const currentValue = getByPath(
                        editedData,
                        change.field,
                      );
                      const showingOriginal = valuesEqual(
                        currentValue,
                        change.originalValue,
                      );
                      const showingCorrected = valuesEqual(
                        currentValue,
                        change.correctedValue,
                      );
                      return { change, showingOriginal, showingCorrected };
                    });

                    const allAccepted = states.every(
                      (s) => s.change.accepted && s.showingCorrected,
                    );
                    const allReverted = states.every((s) => s.showingOriginal);

                    let statusLabel = "⏳ Pending";
                    if (allAccepted) statusLabel = "✓ Accepted";
                    else if (allReverted) statusLabel = "↩ Reverted";
                    else if (
                      states.some((s) => s.showingOriginal) &&
                      states.some((s) => s.showingCorrected)
                    ) {
                      statusLabel = "Mixed";
                    }

                    const acceptLabel =
                      changes.length > 1
                        ? `✓ Accept all (${changes.length})`
                        : "✓ Accept";
                    const revertLabel =
                      changes.length > 1
                        ? `✗ Revert all (${changes.length})`
                        : "✗ Revert";

                    return (
                      <div key={rule} className="change-rule-group">
                        <div className="change-header">
                          <strong className="rule-group-title">
                            {changes.length > 1
                              ? `${changes.length} fields changed by this rule`
                              : humanizeLabel(changes[0].field)}
                          </strong>
                          <span className="change-status">{statusLabel}</span>
                        </div>

                        <div className="change-rule">
                          <small>Rule: {rule}</small>
                        </div>

                        <div className="rule-field-changes">
                          {states.map(
                            ({
                              change,
                              showingOriginal,
                              showingCorrected,
                            }) => (
                              <div
                                key={change.field}
                                className="change-item nested-change"
                              >
                                <div className="change-header">
                                  <strong>
                                    {humanizeLabel(change.field)}
                                  </strong>
                                  <span className="change-status subtle">
                                    {change.accepted && showingCorrected
                                      ? "✓"
                                      : showingOriginal
                                        ? "↩"
                                        : "⏳"}
                                  </span>
                                </div>
                                <div className="change-detail">
                                  <div className="original">
                                    <span className="label">Original:</span>
                                    <code>
                                      {JSON.stringify(change.originalValue)}
                                    </code>
                                  </div>
                                  <div className="arrow">→</div>
                                  <div className="corrected">
                                    <span className="label">Corrected:</span>
                                    <code>
                                      {JSON.stringify(change.correctedValue)}
                                    </code>
                                  </div>
                                </div>
                              </div>
                            ),
                          )}
                        </div>

                        <div className="change-actions rule-actions">
                          <button
                            className="btn-small btn-accept"
                            onClick={() => handleAcceptRule(rule)}
                            disabled={allAccepted}
                          >
                            {acceptLabel}
                          </button>
                          <button
                            className="btn-small btn-reject"
                            onClick={() => handleRejectRule(rule)}
                            disabled={allReverted}
                          >
                            {revertLabel}
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            {(hasErrors || hasWarnings) && (
              <div className="validation-panel-bottom">
                {hasErrors && (
                  <div className="validation-section errors">
                    <h4>❌ Errors ({document.validationErrors.length})</h4>
                    {document.validationErrors.map((issue, i) => (
                      <div key={i} className="issue">
                        <strong>{humanizeLabel(issue.field)}:</strong>{" "}
                        {issue.message}
                      </div>
                    ))}
                  </div>
                )}

                {hasWarnings && (
                  <div className="validation-section warnings">
                    <h4>⚠️ Warnings ({document.validationWarnings.length})</h4>
                    {document.validationWarnings.map((issue, i) => (
                      <div key={i} className="issue">
                        <strong>{humanizeLabel(issue.field)}:</strong>{" "}
                        {issue.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="review-actions">
        <button
          onClick={onCancel}
          className="btn btn-secondary"
          disabled={saving}
        >
          Cancel
        </button>
        <button
          onClick={handleSaveClick}
          className="btn btn-primary"
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Document"}
        </button>
      </div>

      <LowConfidenceSaveDialog
        isOpen={showSaveConfirm}
        fields={riskyFields}
        saving={saving}
        onCancel={() => setShowSaveConfirm(false)}
        onConfirm={() => {
          setShowSaveConfirm(false);
          void performSave();
        }}
        onSelectField={handleSelectRiskyField}
      />

      {hasCorrections && (
        <div className="info-message">
          💡 {corrections.size} correction(s) will be submitted.
          {learningNotes.trim()
            ? " Your learning notes will be parsed into rules for future extractions."
            : " Add learning notes above to teach the system from your fixes."}
        </div>
      )}
    </div>
  );
}
