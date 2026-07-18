import { useState } from "react";
import { FieldDefinition, FieldType } from "../types/index";
import {
  deleteSchema,
  getSchema,
  proposeSchema,
  saveSchema,
} from "../services/api";
import { useSchemas } from "../context/SchemasContext";
import "../styles/SchemaManager.css";

type Tab = "fields" | "propose";

const FIELD_TYPES: FieldType[] = [
  "string",
  "number",
  "boolean",
  "date",
  "email",
  "array",
  "object",
];

function emptyField(): FieldDefinition {
  return { key: "", type: "string", required: true };
}

export default function SchemaManager() {
  const { schemas, loading, refreshSchemas } = useSchemas();
  const [tab, setTab] = useState<Tab>("fields");
  const [saving, setSaving] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string>("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [fields, setFields] = useState<FieldDefinition[]>([emptyField()]);
  const [isBuiltin, setIsBuiltin] = useState(false);

  const [sampleText, setSampleText] = useState("");
  const [proposeName, setProposeName] = useState("");
  const [proposeDescription, setProposeDescription] = useState("");

  const resetDraft = () => {
    setSelectedId("");
    setName("");
    setDescription("");
    setPrompt("");
    setFields([emptyField()]);
    setIsBuiltin(false);
    setError(null);
    setSuccess(null);
  };

  const loadSchema = async (id: string) => {
    if (!id) {
      resetDraft();
      return;
    }
    try {
      const schema = await getSchema(id);
      setSelectedId(schema.id);
      setName(schema.name);
      setDescription(schema.description);
      setPrompt(schema.prompt);
      setFields(
        schema.fieldDefinitions?.length
          ? schema.fieldDefinitions
          : [emptyField()]
      );
      setIsBuiltin(schema.isBuiltin);
      setTab("fields");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schema");
    }
  };

  const updateField = (index: number, patch: Partial<FieldDefinition>) => {
    setFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...patch } : f))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const cleaned = fields.filter((f) => f.key.trim());
      if (!name.trim()) throw new Error("Schema name is required");
      if (cleaned.length === 0) throw new Error("Add at least one field");

      await saveSchema({
        id: selectedId || undefined,
        name: name.trim(),
        description: description.trim(),
        fieldDefinitions: cleaned,
        prompt: prompt.trim() || undefined,
      });
      setSuccess("Schema saved");
      await refreshSchemas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save schema");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId || isBuiltin) return;
    if (!confirm(`Delete schema "${name}"?`)) return;
    try {
      await deleteSchema(selectedId);
      setSuccess("Schema deleted");
      resetDraft();
      await refreshSchemas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete schema");
    }
  };

  const handlePropose = async () => {
    if (!sampleText.trim()) {
      setError("Paste sample document text first");
      return;
    }
    setProposing(true);
    setError(null);
    setSuccess(null);
    try {
      const draft = await proposeSchema({
        sampleText,
        name: proposeName.trim() || undefined,
        description: proposeDescription.trim() || undefined,
      });
      setSelectedId(draft.id);
      setName(draft.name);
      setDescription(draft.description);
      setPrompt(draft.prompt);
      setFields(draft.fieldDefinitions);
      setIsBuiltin(false);
      setTab("fields");
      setSuccess("Schema proposed — review fields and save");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to propose schema");
    } finally {
      setProposing(false);
    }
  };

  return (
    <div className="schema-manager">
      <h2>Extraction Schemas</h2>
      <p className="schema-hint">
        Define custom document types or propose a schema from a sample document.
      </p>

      <div className="schema-layout">
        <aside className="schema-list-panel">
          <button className="btn btn-secondary" onClick={resetDraft}>
            + New Schema
          </button>
          {loading ? (
            <p>Loading...</p>
          ) : (
            <ul className="schema-list">
              {schemas.map((s) => (
                <li key={s.id}>
                  <button
                    className={`schema-list-item ${selectedId === s.id ? "active" : ""}`}
                    onClick={() => loadSchema(s.id)}
                  >
                    <strong>{s.name}</strong>
                    <span>{s.isBuiltin ? "Built-in" : s.id}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="schema-editor-panel">
          <div className="schema-tabs">
            <button
              className={`schema-tab ${tab === "fields" ? "active" : ""}`}
              onClick={() => setTab("fields")}
            >
              Fields
            </button>
            <button
              className={`schema-tab ${tab === "propose" ? "active" : ""}`}
              onClick={() => setTab("propose")}
            >
              Propose from Sample
            </button>
          </div>

          {tab === "fields" && (
            <div className="schema-fields-tab">
              <div className="schema-meta">
                <label>
                  Name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isBuiltin}
                    placeholder="Purchase Order"
                  />
                </label>
                <label>
                  Description
                  <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={isBuiltin}
                    placeholder="Used by auto-detect to distinguish types"
                  />
                </label>
                <label>
                  Extraction prompt (optional override)
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={isBuiltin}
                    rows={4}
                    placeholder="Auto-generated from fields if left blank"
                  />
                </label>
              </div>

              <div className="field-builder">
                <h3>Fields</h3>
                {fields.map((field, index) => (
                  <div key={index} className="field-row">
                    <input
                      placeholder="key"
                      value={field.key}
                      onChange={(e) =>
                        updateField(index, { key: e.target.value })
                      }
                      disabled={isBuiltin}
                    />
                    <input
                      placeholder="label"
                      value={field.label ?? ""}
                      onChange={(e) =>
                        updateField(index, { label: e.target.value })
                      }
                      disabled={isBuiltin}
                    />
                    <select
                      value={field.type}
                      onChange={(e) =>
                        updateField(index, {
                          type: e.target.value as FieldType,
                        })
                      }
                      disabled={isBuiltin}
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <label className="field-required">
                      <input
                        type="checkbox"
                        checked={field.required !== false}
                        onChange={(e) =>
                          updateField(index, { required: e.target.checked })
                        }
                        disabled={isBuiltin}
                      />
                      Required
                    </label>
                    {!isBuiltin && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() =>
                          setFields((prev) =>
                            prev.filter((_, i) => i !== index)
                          )
                        }
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                {!isBuiltin && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => setFields((prev) => [...prev, emptyField()])}
                  >
                    + Add Field
                  </button>
                )}
              </div>

              {!isBuiltin && (
                <div className="schema-actions">
                  <button
                    className="btn btn-primary"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Save Schema"}
                  </button>
                  {selectedId && (
                    <button className="btn btn-danger" onClick={handleDelete}>
                      Delete
                    </button>
                  )}
                </div>
              )}
              {isBuiltin && (
                <p className="builtin-note">
                  Built-in schemas are read-only. Create a new schema for custom
                  types.
                </p>
              )}
            </div>
          )}

          {tab === "propose" && (
            <div className="schema-propose-tab">
              <label>
                Schema name (optional)
                <input
                  value={proposeName}
                  onChange={(e) => setProposeName(e.target.value)}
                  placeholder="Purchase Order"
                />
              </label>
              <label>
                Description (optional)
                <input
                  value={proposeDescription}
                  onChange={(e) => setProposeDescription(e.target.value)}
                  placeholder="Vendor PO with line items"
                />
              </label>
              <label>
                Sample document
                <textarea
                  value={sampleText}
                  onChange={(e) => setSampleText(e.target.value)}
                  rows={12}
                  placeholder="Paste a sample document here..."
                />
              </label>
              <button
                className="btn btn-primary"
                onClick={handlePropose}
                disabled={proposing}
              >
                {proposing ? "Proposing..." : "Propose Schema"}
              </button>
            </div>
          )}

          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}
        </section>
      </div>
    </div>
  );
}
