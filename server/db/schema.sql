CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL,
  original_text TEXT NOT NULL,
  extracted_data JSONB NOT NULL DEFAULT '{}',
  applied_changes JSONB,
  validation_errors JSONB NOT NULL DEFAULT '[]',
  validation_warnings JSONB NOT NULL DEFAULT '[]',
  confidence DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents (type);
CREATE INDEX IF NOT EXISTS idx_documents_extracted_data ON documents USING GIN (extracted_data);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS field_metadata JSONB;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS extraction_text TEXT;

CREATE TABLE IF NOT EXISTS corrections (
  id UUID PRIMARY KEY,
  doc_type TEXT NOT NULL,
  field TEXT NOT NULL,
  original_value JSONB,
  corrected_value JSONB,
  context_snippet TEXT,
  scope_key TEXT,
  user_explanation TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_corrections_doc_type ON corrections (doc_type);

CREATE TABLE IF NOT EXISTS guidelines (
  id UUID PRIMARY KEY,
  doc_type TEXT NOT NULL,
  scope_key TEXT,
  rule TEXT NOT NULL,
  source_correction_ids JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_guidelines_dedup
  ON guidelines (doc_type, COALESCE(scope_key, ''), lower(rule));

CREATE INDEX IF NOT EXISTS idx_guidelines_doc_type ON guidelines (doc_type);

CREATE TABLE IF NOT EXISTS extraction_schemas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  json_schema JSONB NOT NULL,
  prompt TEXT NOT NULL,
  field_definitions JSONB,
  is_builtin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE extraction_schemas ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE corrections ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE guidelines ADD COLUMN IF NOT EXISTS user_id UUID;

CREATE INDEX IF NOT EXISTS idx_extraction_schemas_user_id ON extraction_schemas (user_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents (user_id);
CREATE INDEX IF NOT EXISTS idx_corrections_user_id ON corrections (user_id);
CREATE INDEX IF NOT EXISTS idx_guidelines_user_id ON guidelines (user_id);

CREATE TABLE IF NOT EXISTS guest_extract_usage (
  guest_id TEXT PRIMARY KEY,
  extract_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
