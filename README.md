# Document Extraction App

A production-quality web application that converts unstructured or semi-structured documents into structured, searchable data using AI (LLM).

## Live Demo

- **App:** https://document-extractor-01.netlify.app/
- **API:** https://document-extractor-mc4d.onrender.com/api/
- **GitHub:** https://github.com/chandan1499/Document_Extractor

> **Note:** The Render free tier sleeps after inactivity — the first request may take 30–60 seconds to wake up.

## Problem Interpretation

Finance and operations teams receive invoices, resumes, and meeting notes as email text, PDFs, and spreadsheets. Manually re-keying that data into systems is slow and error-prone. This app targets that workflow: paste or upload a document, review structured fields, save queryable records, and teach the system from corrections so future extractions improve.

The core challenge is scale — organizations deal with a sea of unstructured documents where manual extraction doesn't hold up. LLMs can intelligently extract structured data, but output needs validation, **transparent confidence per field**, human review, and a feedback loop to stay accurate over time.

## Scope & Assumptions

### In Scope
- Upload and paste text documents (TXT format)
- Support for PDF text extraction (`pdf-parse`)
- Support for CSV file parsing with formatted text conversion
- Support for image file extraction with OCR (`tesseract.js`)
- Automatic document type detection (Invoice, Resume, Meeting Notes)
- Intelligent data extraction into structured JSON via LLM
- Two-tier validation: structural (required fields, data types) and semantic (business logic)
- Human review & editing before saving
- **Field trust layer**: per-field confidence, source quotes, and alternative candidates for ambiguous extractions
- **Save confirmation** when low-confidence or validation-flagged fields remain unreviewed
- Save extracted documents with persistent storage (Supabase Postgres)
- Search and filter saved documents by type and fields
- JSON and CSV export
- Human-in-the-loop learning: corrections are stored and future extractions receive guidance from learned rules
- Responsive, intuitive UI with drag & drop support
- Modal view for viewing complete extracted document details
- Centered loading overlay during extraction
- Scrollable error/warning section at bottom of extracted fields
- **User accounts** via Supabase Auth (email/password sign-in, sign-out)
- **Private data per user** — custom schemas, documents, corrections, and guidelines are scoped to the logged-in account

### Intentionally Excluded (& Why)
- **DOCX/RTF Support** — JSON store + text-only parsing keeps the scope focused on core extraction logic. Extending to format-specific libraries is a one-liner in the pipeline.
- **OCR for scanned documents** — Groq vision models are included as a stretch feature, but primary path is text-based.
- **Analytics/Dashboard** — Beyond MVP scope; future improvement.
- **Automatic duplicate detection** — Would require embedding models and similarity search; deferred to a second phase.
- **Edit/delete learned guidelines** — The Learning tab is view-only; corrections become guidelines automatically, but rules cannot be edited or removed in the UI.

## Architecture

### High-Level Flow
```
Ingest → Preprocess → Classify → Extract (+ fieldMeta envelope) → Validate → Align fieldMeta → Review → Save
                                                                        ↑
                                                                (Load learned guidelines)
```

Extraction returns structured `data` plus per-field **`fieldMeta`** (confidence, source quote, alternatives). Validation issues are merged into field confidence before review. The review UI highlights source text and blocks save behind a confirmation dialog when risky fields remain unreviewed.

### Directory Structure
```
/server
  /src
    /providers         LLMProvider interface + GroqProvider implementation
    /schemas           Zod schemas for Invoice, Resume, Meeting Notes
    /registry          DocType → {schema, prompt, validators} mapping
    /pipeline          Extraction pipeline stages (ingest, preprocess, classify, etc.)
    /validation        Structural (Zod) + semantic validators
    /repository        DocumentRepository + PostgresDocumentRepository (+ JsonFileRepository for tests)
    /routes            Express API endpoints
    /config            Logger, env config
    /utils             File extraction, span location, fieldMeta alignment, validation merge
  /db                  schema.sql (documents, corrections, guidelines, extraction_schemas)
  /__tests__           Tests (Vitest)
  
/client
  /src
    /components        Upload, Review, DocumentList, SchemaManager, DocumentModal, LowConfidenceSaveDialog
    /services          API client
    /types             TypeScript types
    /utils             Labels, risky-field collection for save confirmation
    /styles            Component-level CSS
  /public              Static assets
  index.html
  vite.config.ts
```

### Key Modules

#### LLMProvider (Single Responsibility: AI abstraction)
```typescript
interface LLMProvider {
  classify(text: string, types: SchemaTypeInfo[]): Promise<DocType>;
  extract<T>(
    text: string,
    schema: JsonSchema,
    prompt: string,
    guidelines?: Guideline[]
  ): Promise<ExtractResult<T>>;  // { data, fieldMeta?, appliedChanges? }
  extractLearningRules(...): Promise<string[]>;
  proposeSchema(...): Promise<FieldDefinition[]>;
}
```
- Implemented by `GroqProvider` (OpenAI-compatible API)
- Every extraction uses a **fieldMeta envelope**: `{ data, fieldMeta }` (+ `appliedChanges` when guidelines apply)
- Groq **strict structured outputs** guarantee schema-valid JSON
- Prompt instructs per-leaf confidence, source quotes, alternatives, and format-based low confidence (URLs, email, phone, etc.)

#### Schema Registry (Single source of truth)
One Zod schema per document type:
- Types the TypeScript code
- Generates JSON Schema sent to Groq
- Powers structural validation (Zod)
- Adding a doc type = one entry

#### File Extractor (Unified file handling)
```typescript
async function extractTextFromFile(
  buffer: Buffer,
  mimetype: string,
  filename: string
): Promise<string>
```
- **PDF**: `pdf-parse` for text extraction
- **CSV**: Formatted as readable text with headers/rows
- **Images**: `tesseract.js` for OCR (30-second timeout)
- **TXT**: Direct UTF-8 conversion
- Graceful error handling with specific error messages

#### Two-Tier Validation
1. **Structural** (Zod): required fields, correct types, date/number/email formats
2. **Semantic** (custom validators): invoice total = sum of line items, resume email format, experience date order, etc.
- Both return typed `ValidationIssue[]`, never throw
- **`adjustFieldMetaFromValidation`**: merges validation errors/warnings into per-field `fieldMeta` (caps confidence at 0.5 for errors, 0.65 for warnings)
- Separated for clarity and testability

#### Field Trust Layer (confidence + source grounding)
Each extraction attaches **`fieldMeta`** — one entry per leaf field:

| Property | Purpose |
|----------|---------|
| `field` | Dotted path (e.g. `vendor.name`, `experience.0.company`) |
| `confidence` | 0–1; LLM-reported, adjusted by validation |
| `sourceText` | Verbatim quote from the document |
| `reason` | Why confidence is low (ambiguous values, bad format, validation message) |
| `alternatives` | Other candidates seen (e.g. two invoices in one PDF) with their source quotes |
| `start` / `end` | Character offsets in `extractionText` for UI highlighting |

Post-processing utilities:
- **`alignFieldMeta`**: strips erroneous `data.` path prefix from LLM output; fills metadata for every extracted leaf
- **`locateSpans`**: maps source quotes to character offsets (exact + whitespace-normalized fuzzy match)
- Overall document **`confidence`** = average of leaf field confidences

Persisted on `documents` as `field_metadata` (JSONB) and `extraction_text` (TEXT).

#### DocumentRepository (Swappable storage)
```typescript
interface DocumentRepository {
  save(doc: ExtractedDocument): Promise<ExtractedDocument>;
  findById(id: string): Promise<ExtractedDocument | null>;
  list(): Promise<ExtractedDocument[]>;
  search(filters: DocumentFilters): Promise<PaginatedResult<ExtractedDocument>>;
}
```
- Implemented by `PostgresDocumentRepository` (Supabase Postgres)
- `JsonFileRepository` retained for unit tests only
- Paginated search: `page` (default 1), `limit` (default 20, max 100)
- Dynamic nested field filters (`vendor.name`, `total.gt`) applied in-memory when used

#### Correction Store (Human-in-the-loop learning)
```typescript
interface CorrectionRepository {
  saveCorrection(correction: Correction): Promise<Correction>;
  listCorrections(docType?: DocType): Promise<Correction[]>;
  saveGuideline(guideline: Guideline): Promise<Guideline>;
  listGuidelines(docType?: DocType, scopeKey?: string): Promise<Guideline[]>;
}
```
- Stores raw corrections (what changed, what to, why)
- Distills corrections into reusable guidelines
- Guidelines injected into the extraction prompt at runtime
- Scope-aware: vendor-specific rules only apply to that vendor

## Features Implemented

### Core
- ✅ Upload TXT files, paste raw text
- ✅ PDF text extraction (pdf-parse)
- ✅ CSV file parsing with formatted text conversion
- ✅ Image extraction with OCR (tesseract.js for JPG, PNG, GIF, WebP)
- ✅ Automatic document type detection
- ✅ Custom extraction schemas (SchemaManager UI + API)
- ✅ Structured data extraction to JSON (Groq, strict schemas)
- ✅ **Per-field confidence + source grounding** (`fieldMeta` with alternatives for ambiguous documents)
- ✅ Validation with errors & warnings merged into field confidence
- ✅ Human review & edit before save
- ✅ Save to Supabase Postgres (survives Render redeploys and sleep cycles)
- ✅ Paginated document list (`GET /api/documents?page=1&limit=20`)
- ✅ Search/filter by type, free-text `q`, nested fields, and comparison operators
- ✅ Export JSON & CSV
- ✅ Human-in-the-loop learning from corrections
- ✅ Learning tab for guidelines and correction history
- ✅ View complete document details in modal

### Review & Trust UX
- ✅ **Confidence badges** on every field (green / yellow / red by threshold 0.7)
- ✅ **Low-confidence field highlighting** (orange border + reason tooltip)
- ✅ **Click-to-source**: select a field to highlight its quote (and alternatives) in the cleaned extraction text
- ✅ **Candidate switcher** for fields with multiple plausible values (e.g. two invoices in one PDF)
- ✅ **Save confirmation dialog** when unreviewed risky fields remain (confidence &lt; 0.7 or validation issues; skips fields you already edited)
- ✅ Click a risky field in the dialog to jump to it in the review panel
- ✅ Drag & drop upload (advanced feature, collapsible)
- ✅ Text paste input (primary interface)
- ✅ Centered loading overlay during extraction
- ✅ Modal view for saved documents with complete data
- ✅ Scrollable error/warning section at bottom of review panel
- ✅ Empty states
- ✅ Error handling & user feedback with detailed messages
- ✅ Responsive design (desktop + mobile)
- ✅ Fixed height layout with inner scrollable sections

### Architecture
- ✅ Clean module boundaries (LLM, validation, storage swappable)
- ✅ Strong TypeScript typing
- ✅ Reusable components
- ✅ LLM abstraction layer
- ✅ Well-defined schemas (Zod)
- ✅ Logging (Pino)
- ✅ Env-based configuration

## Tech Stack

### Backend
- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **LLM**: Groq (OpenAI-compatible API)
- **Validation**: Zod
- **File Processing**: 
  - `pdf-parse` — PDF text extraction
  - `csv-parse` — CSV parsing
  - `tesseract.js` — Image OCR (optical character recognition)
  - `multer` — File upload handling
- **Database**: Supabase (PostgreSQL) via `pg` driver
- **Logging**: Pino
- **Testing**: Vitest + Supertest

### Frontend
- **Framework**: React 18
- **Build**: Vite
- **Language**: TypeScript
- **File handling**: react-dropzone
- **Export**: PapaParse (CSV)
- **Styling**: CSS (no framework)
- **State**: Zustand (not used yet; ready for future features)

### Deployment
- **Frontend**: Netlify (static Vite build)
- **Backend**: Render (Express API)
- **Data**: Supabase Postgres (free tier)

## AI Model Selection

### Why Groq?
1. **Free tier**: No credit card, 14,400 requests/day on small models — plenty for a demo
2. **OpenAI-compatible**: Drop-in with the OpenAI SDK
3. **Structured outputs**: `strict: true` guarantees schema-valid JSON, eliminates retry logic
4. **Fast**: 300–1000 tokens/sec (UX advantage for user-facing extractions)
5. **Vision available**: Models like `llama-4-scout` support images (OCR stretch feature)

### Model Choices
Configure models in `server/.env`:
```
EXTRACT_MODEL=<model-name>      # For data extraction
CLASSIFY_MODEL=<model-name>     # For document type classification
```

**Available Groq Models** (check your account access at https://console.groq.com/keys):
- `mixtral-8x7b-32768` — Balanced performance (archived, may not be available)
- `llama2-70b-4096` — High quality reasoning
- `gemma-2-9b-it` — Fast, instruction-tuned
- `llama-3.1-70b-versatile` — Latest, good for extraction
- `llama-3.1-8b-instant` — Fast classification

**Note**: Model availability varies by subscription tier. Check your Groq console to see available models, then update `.env` accordingly.

Alternatives (future):
- OpenAI (GPT-4) — better reasoning, higher cost
- Anthropic (Claude) — excellent reasoning, cost
- Local (Llama 2 via Ollama) — privacy, no API costs

## Quick Demo

Try the live app at https://document-extractor-01.netlify.app/ or run locally:

1. **Upload** — Paste sample invoice text (or use Advanced → upload a PDF/CSV/image).
2. **Review** — Check extracted fields; confidence badges flag uncertain values. Click a field to see its source highlighted in the document text. Use the candidate switcher when multiple values were found (e.g. two invoices in one file).
3. **Learn** — Add an explanation when correcting: *"Vendor is always ACME Cloud, not ACME Cloud Billing"*.
4. **Save** — If low-confidence or validation-flagged fields remain (and you haven't edited them), a confirmation dialog lists them before saving. Choose **Go back and review** or **Save anyway**.
5. **Query** — Open **Documents**, search with `vendor.name` = `ACME` or `total.gt` = `50000`.
6. **Learning tab** — See the guideline and correction history from step 3.

## Setup

### Prerequisites
- Node.js 18+ (see `client/.nvmrc` for Node 20)
- Groq API key (free from [console.groq.com](https://console.groq.com))
- Supabase project (free from [supabase.com](https://supabase.com))

### Installation

1. **Clone & install** (from repo root)
   ```bash
   git clone https://github.com/chandan1499/Document_Extractor.git
   cd Document_Extractor
   yarn install
   ```

2. **Set up Supabase**
   1. Create a free Supabase project
   2. Open **SQL Editor** and run `server/db/schema.sql`
   3. Enable **Authentication → Email** (and optional OAuth providers)
   4. Copy **Project Settings → API**: Project URL, anon key, and JWT secret
   5. Copy the **Connection string → URI** (use the **Transaction pooler** on port 6543)

   **Existing databases:** run migrations after pulling new changes:
   ```bash
   cd server && npm run db:migrate
   ```
   Or re-run the `ALTER TABLE` statements at the bottom of `server/db/schema.sql`.

3. **Configure environment**
   ```bash
   cp .env.example server/.env
   # Edit server/.env — set DATABASE_URL, GROQ_API_KEY, SUPABASE_URL, SUPABASE_JWT_SECRET
   # Check https://console.groq.com/keys for available models
   ```

   For the client, set in `.env` at repo root or `client/.env`:
   ```
   VITE_SUPABASE_URL=https://[project].supabase.co
   VITE_SUPABASE_ANON_KEY=your_anon_key
   VITE_API_URL=http://localhost:4000/api
   ```

4. **Run locally**
   ```bash
   yarn dev
   ```

   - Frontend: http://localhost:5173 (Vite proxies `/api` → http://localhost:4000)
   - Backend: http://localhost:4000

   Or run separately:
   ```bash
   cd server && npm run dev   # Terminal 1
   cd client && npm run dev   # Terminal 2
   ```

5. **Run tests**
   ```bash
   cd server && npm test
   ```

### Docker / Production
Not included in this MVP, but ready to containerize. Suggested:
- `server/Dockerfile` with Node.js base + npm install + `npm run build`
- `client/Dockerfile` with Node.js build stage + serve the `dist/` folder

## Future Improvements

### Recently Completed
- ✅ **Field trust layer**: per-field `fieldMeta` (confidence, sourceText, alternatives, reason) on every extraction
- ✅ **Source highlighting** in review panel anchored to cleaned `extractionText`
- ✅ **Validation → confidence merge** (`adjustFieldMetaFromValidation`) for all doc types
- ✅ **Low-confidence save confirmation dialog** before persisting unreviewed risky fields
- ✅ **LLM prompt rules** for format failures (incomplete URLs, invalid email, ambiguous multi-document values)
- ✅ Custom extraction schemas (SchemaManager UI + propose/save API)
- ✅ Supabase Postgres persistence (`field_metadata`, `extraction_text` columns)
- ✅ Paginated `GET /api/documents` with `page` and `limit` query params
- ✅ Netlify frontend + Render backend deployment
- ✅ Learning tab (view guidelines and correction history)
- ✅ Field-level query UI (`vendor.name`, `total.gt`, free-text `q`)
- ✅ Nested field editing in review panel (line items, vendor blocks)
- ✅ Single-call LLM extraction with `appliedChanges` + `fieldMeta` envelope
- ✅ API integration tests (mocked LLM; 60+ server tests)
- ✅ CSV / PDF / image OCR extraction
- ✅ Modal view, loading overlay, scrollable validation panel

### Short Term (Next Sprint)
- [ ] Code-side format validators (URL/phone) as backup when LLM ignores prompt rules
- [ ] DOCX support (python-docx or similar library on the server)
- [ ] Edit/delete learned guidelines in the UI
- [ ] Sample documents in `/samples/` for one-click demo
- [ ] Confidence badges in document list / read-only modal
- [ ] Split multi-document uploads into separate records

### Medium Term
- [ ] Embedding-based similarity for learned guideline retrieval (more relevant context)
- [ ] Batch processing (bulk upload multiple documents)
- [ ] Analytics dashboard (extraction success rate, most common corrections)
- [x] User accounts / multi-tenancy (Supabase Auth; private data per user)
- [ ] Webhook integration (notify downstream systems when documents are ready)

### Long Term
- [ ] Support for image uploads (direct vision → extraction)
- [ ] Multi-LLM routing (classify by cost/speed/quality, route accordingly)
- [ ] Advanced validation: cross-document deduplication, temporal consistency
- [ ] Integration with external databases (look up vendor IDs, tax rates, etc.)

## Testing

### Test Coverage
- Invoice / resume / meeting notes validators
- Pipeline: preprocess, validate(), fieldMeta alignment, validation merge
- `locateSpans`, `alignFieldMeta`, `adjustFieldMetaFromValidation`
- API: extract (mocked LLM), save with `fieldMeta`, field-level search
- Repository search: nested paths (`vendor.name`), comparison ops (`total.gt`), and free-text `q`

### Not yet covered
- GroqProvider live calls
- File upload / OCR / PDF extraction
- Full correction→guideline distillation edge cases
- Frontend `collectRiskyFields` / save dialog unit tests

### Run Tests
```bash
cd server
npm test
npm run test:watch  # watch mode
```

Tests use mocked LLM responses to be deterministic and free.

## Deployment

### Frontend (Netlify)

Configured via `netlify.toml` at the repo root:

```toml
[build]
  base = "client"
  command = "npm run build"
  publish = "dist"
```

Set these environment variables in the Netlify dashboard:

```
VITE_API_URL=https://document-extractor-mc4d.onrender.com/api
VITE_SUPABASE_URL=https://[project].supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

The client reads `VITE_API_URL` (falls back to `/api` for local dev with the Vite proxy).

### Backend (Render)

Configured via [`render.yaml`](render.yaml) or manually:

- **Root directory:** `server`
- **Build command:** `npm install && npm run build`
- **Start command:** `npm start`
- **Env vars:** `DATABASE_URL`, `GROQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `PORT`, `EXTRACT_MODEL`, `CLASSIFY_MODEL`

**Supabase setup:**
1. Create a free Supabase project
2. Run `server/db/schema.sql` in the Supabase SQL Editor
3. Copy the pooler connection string → Render `DATABASE_URL`
4. Redeploy

Migrations also run automatically on server boot. To migrate existing JSON data:

```bash
cd server && npm run db:import-json
```

### API: List documents (paginated)

```
GET /api/documents?page=1&limit=20&type=invoice&q=acme&vendor.name=ACME&total.gt=50000
```

Response fields on each document include `fieldMeta`, `extractionText`, and overall `confidence` when available.

Response:
```json
{
  "items": [ /* ExtractedDocument[] */ ],
  "total": 142,
  "page": 1,
  "limit": 20,
  "totalPages": 8
}
```

| Param | Default | Max | Description |
|-------|---------|-----|-------------|
| `page` | 1 | — | 1-based page index |
| `limit` | 20 | 100 | Results per page |
| `type` | — | — | Filter by document type |
| `q` | — | — | Free-text search |
| `vendor.name`, `total.gt`, etc. | — | — | Nested field filters |

## Known Limitations

1. **LLM-dependent format checks**: Incomplete URLs (e.g. bare usernames without `https://`) rely on LLM `fieldMeta` confidence unless caught by Zod/semantic validators (email is enforced; generic strings like phone/links are not).
2. **Stale fieldMeta after edit**: User corrections update `extractedData` but do not recompute `fieldMeta`; save dialog excludes edited fields to avoid false positives.
3. **Dynamic field filters**: Nested paths (`vendor.name`) and comparisons (`total.gt`) are applied in-memory when used — not indexed SQL. Fine for demo scale.
4. **Groq model availability**: Model names vary by subscription tier. Always check https://console.groq.com/keys for available models and update `.env` accordingly.
5. **OCR timeout**: Image OCR has a 30-second timeout. Very large or complex images may timeout.
6. **Groq rate limits**: Free tier caps at 30 RPM (one request every 2 seconds). Fine for a demo, upgrade for production.
7. **Auth required**: All API routes except `/api/health` require a valid Supabase JWT. Pre-auth demo data (`user_id IS NULL`) is not visible to new accounts.
8. **PDF handling**: `pdf-parse` works for text-based PDFs only. Scanned PDFs (image-only) require OCR via image extraction.
9. **CSV handling**: Converts CSV to formatted text; complex nested structures may not extract optimally.
10. **Render cold starts**: Free-tier backend sleeps after inactivity; first request may take 30–60 seconds.
11. **Multi-document PDFs**: Single upload produces one record; ambiguous fields show alternatives but do not auto-split into separate documents.

## README Maintenance
This README should be updated as features change. Key sections to keep current:
- Features implemented (add checkmarks as you build)
- Tech stack (if you swap libraries)
- Deployment URLs (add them at the end when live)
- Future improvements (move completed items to "Features" above)

## Contributing

This is a personal portfolio project. Contributions/PRs welcome but this is primarily for interview evaluation.

## License

MIT

---

## Deployment URLs

- **Frontend:** https://document-extractor-01.netlify.app/
- **Backend API:** https://document-extractor-mc4d.onrender.com/api/
- **GitHub:** https://github.com/chandan1499/Document_Extractor
