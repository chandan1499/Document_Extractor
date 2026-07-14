# Document Extraction App

A production-quality web application that converts unstructured or semi-structured documents into structured, searchable data using AI (LLM).

## Live Demo

- **App:** https://document-extractor-01.netlify.app/
- **API:** https://document-extractor-mc4d.onrender.com/api/
- **GitHub:** https://github.com/chandan1499/Document_Extractor

> **Note:** The Render free tier sleeps after inactivity — the first request may take 30–60 seconds to wake up.

## Problem Interpretation

Finance and operations teams receive invoices, resumes, and meeting notes as email text, PDFs, and spreadsheets. Manually re-keying that data into systems is slow and error-prone. This app targets that workflow: paste or upload a document, review structured fields, save queryable records, and teach the system from corrections so future extractions improve.

The core challenge is scale — organizations deal with a sea of unstructured documents where manual extraction doesn't hold up. LLMs can intelligently extract structured data, but output needs validation, human review, and a feedback loop to stay accurate over time.

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
- Save extracted documents with persistent storage
- Search and filter saved documents by type and fields
- JSON and CSV export
- Human-in-the-loop learning: corrections are stored and future extractions receive guidance from learned rules
- Responsive, intuitive UI with drag & drop support
- Modal view for viewing complete extracted document details
- Centered loading overlay during extraction
- Scrollable error/warning section at bottom of extracted fields

### Intentionally Excluded (& Why)
- **DOCX/RTF Support** — JSON store + text-only parsing keeps the scope focused on core extraction logic. Extending to format-specific libraries is a one-liner in the pipeline.
- **OCR for scanned documents** — Groq vision models are included as a stretch feature, but primary path is text-based.
- **Analytics/Dashboard** — Beyond MVP scope; future improvement.
- **Automatic duplicate detection** — Would require embedding models and similarity search; deferred to a second phase.
- **Edit/delete learned guidelines** — The Learning tab is view-only; corrections become guidelines automatically, but rules cannot be edited or removed in the UI.

## Architecture

### High-Level Flow
```
Ingest → Preprocess → Classify → Extract → Validate → Review → Save
                                                ↑
                                        (Load learned guidelines)
```

### Directory Structure
```
/server
  /src
    /providers         LLMProvider interface + GroqProvider implementation
    /schemas           Zod schemas for Invoice, Resume, Meeting Notes
    /registry          DocType → {schema, prompt, validators} mapping
    /pipeline          Extraction pipeline stages (ingest, preprocess, classify, etc.)
    /validation        Structural (Zod) + semantic validators
    /repository        DocumentRepository + JsonFileRepository
    /routes            Express API endpoints
    /config            Logger, env config
    /utils             File extraction utilities (PDF, CSV, OCR, TXT)
  /__tests__           Tests (Vitest)
  
/client
  /src
    /components        React components (Upload, Review, DocumentList, GuidelinesPanel, DocumentModal)
    /services          API client
    /types             TypeScript types
    /styles            Component-level CSS
  /public              Static assets
  index.html
  vite.config.ts
```

### Key Modules

#### LLMProvider (Single Responsibility: AI abstraction)
```typescript
interface LLMProvider {
  classify(text: string): Promise<DocType>;
  extract<T>(text: string, schema: JsonSchema, prompt: string, guidelines?: Guideline[]): Promise<T>;
}
```
- Implemented by `GroqProvider` (OpenAI-compatible API)
- Easy to swap providers: just env vars change
- Groq's **strict structured outputs** guarantee schema-valid JSON (no retries needed)

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
1. **Structural** (Zod): required fields, correct types, date/number formats
2. **Semantic** (custom validators): invoice total = sum of line items, date ranges plausible, etc.
- Both return typed `ValidationIssue[]`, never throw
- Separated for clarity and testability

#### DocumentRepository (Swappable storage)
```typescript
interface DocumentRepository {
  save(doc: ExtractedDocument): Promise<ExtractedDocument>;
  findById(id: string): Promise<ExtractedDocument | null>;
  list(): Promise<ExtractedDocument[]>;
  search(filters: DocumentFilters): Promise<ExtractedDocument[]>;
}
```
- Implemented by `JsonFileRepository` (JSON file on disk)
- Later: `SqliteRepository`, `PostgresRepository` — no app changes needed
- Search over demo dataset is in-JS filtering

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
- ✅ Structured data extraction to JSON (Groq, strict schemas)
- ✅ Validation with errors & warnings
- ✅ Human review & edit before save
- ✅ Save to persistent JSON file store
- ✅ Search/filter by type, free-text `q`, nested fields, and comparison operators
- ✅ Export JSON & CSV
- ✅ Human-in-the-loop learning from corrections
- ✅ Learning tab for guidelines and correction history
- ✅ View complete document details in modal

### UX
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
- **Database**: JSON file (swappable via `DocumentRepository` interface)
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
- **Data**: JSON file on persistent disk (Render Disk)

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
2. **Review** — Check extracted fields; fix any wrong values (e.g. vendor name).
3. **Learn** — Add an explanation when correcting: *"Vendor is always ACME Cloud, not ACME Cloud Billing"*.
4. **Save** — Store the document.
5. **Query** — Open **Documents**, search with `vendor.name` = `ACME` or `total.gt` = `50000`.
6. **Learning tab** — See the guideline and correction history from step 3.

## Setup

### Prerequisites
- Node.js 18+ (see `client/.nvmrc` for Node 20)
- Groq API key (free from [console.groq.com](https://console.groq.com))

### Installation

1. **Clone & install** (from repo root)
   ```bash
   git clone https://github.com/chandan1499/Document_Extractor.git
   cd Document_Extractor
   yarn install
   ```

2. **Configure environment**
   ```bash
   cp server/.env.example server/.env
   # Edit server/.env — set GROQ_API_KEY and model names
   # Check https://console.groq.com/keys for available models
   ```

3. **Run locally**
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

4. **Run tests**
   ```bash
   cd server && npm test
   ```

### Docker / Production
Not included in this MVP, but ready to containerize. Suggested:
- `server/Dockerfile` with Node.js base + npm install + `npm run build`
- `client/Dockerfile` with Node.js build stage + serve the `dist/` folder

## Future Improvements

### Recently Completed
- ✅ Netlify frontend + Render backend deployment
- ✅ Learning tab (view guidelines and correction history)
- ✅ Field-level query UI (`vendor.name`, `total.gt`, free-text `q`)
- ✅ Nested field editing in review panel (line items, vendor blocks)
- ✅ Single-call LLM extraction with `appliedChanges` envelope
- ✅ API integration tests (22 tests, mocked LLM)
- ✅ CSV / PDF / image OCR extraction
- ✅ Modal view, loading overlay, scrollable validation panel

### Short Term (Next Sprint)
- [ ] DOCX support (python-docx or similar library on the server)
- [ ] Per-field confidence scores (ask the LLM to emit `confidence` field)
- [ ] Edit/delete learned guidelines in the UI
- [ ] Sample documents in `/samples/` for one-click demo
- [ ] Improved error messages and debugging information

### Medium Term
- [ ] Swap JSON → SQLite / PostgreSQL (one `Repository` implementation change)
- [ ] Embedding-based similarity for learned guideline retrieval (more relevant context)
- [ ] Batch processing (bulk upload multiple documents)
- [ ] Analytics dashboard (extraction success rate, most common corrections)
- [ ] User accounts / multi-tenancy (separate data per org)
- [ ] Webhook integration (notify downstream systems when documents are ready)

### Long Term
- [ ] Support for image uploads (direct vision → extraction)
- [ ] Multi-LLM routing (classify by cost/speed/quality, route accordingly)
- [ ] Advanced validation: cross-document deduplication, temporal consistency
- [ ] Integration with external databases (look up vendor IDs, tax rates, etc.)

## Testing

### Test Coverage
- Invoice / resume / meeting notes validators
- Pipeline: preprocess newline handling, validate()
- API: extract (mocked LLM), save, field-level search
- Repository search: nested paths (`vendor.name`), comparison ops (`total.gt`), and free-text `q`

### Not yet covered
- GroqProvider live calls
- File upload / OCR / PDF extraction
- Full correction→guideline distillation edge cases

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

Set this environment variable in the Netlify dashboard:

```
VITE_API_URL=https://document-extractor-mc4d.onrender.com/api
```

The client reads `VITE_API_URL` (falls back to `/api` for local dev with the Vite proxy).

### Backend (Render)

- **Root directory:** `server`
- **Build command:** `npm install && npm run build`
- **Start command:** `npm start`
- **Env vars:** `GROQ_API_KEY`, `PORT`, `EXTRACT_MODEL`, `CLASSIFY_MODEL`, `DATA_DIR=./data`

Enable a persistent disk on Render so `./data/` survives redeploys. On ephemeral filesystems, saved documents and learned guidelines are lost on restart.

## Known Limitations

1. **Storage**: JSON files don't scale to millions of documents. For production, use Postgres/MongoDB with proper indexing.
2. **Concurrency**: No locking on the JSON file — concurrent writes could corrupt it. Not an issue for a solo demo; add Postgres + transactions for multi-user.
3. **Groq model availability**: Model names vary by subscription tier. Always check https://console.groq.com/keys for available models and update `.env` accordingly.
4. **OCR timeout**: Image OCR has a 30-second timeout. Very large or complex images may timeout.
5. **Groq rate limits**: Free tier caps at 30 RPM (one request every 2 seconds). Fine for a demo, upgrade for production.
6. **No OAuth**: Anyone with the URL can upload. Add auth (Clerk, Auth0) for production.
7. **PDF handling**: `pdf-parse` works for text-based PDFs only. Scanned PDFs (image-only) require OCR via image extraction.
8. **CSV handling**: Converts CSV to formatted text; complex nested structures may not extract optimally.
9. **Render cold starts**: Free-tier backend sleeps after inactivity; first request may take 30–60 seconds.
10. **Search is JSON-file backed**: Nested paths (`vendor.name`) and comparisons (`total.gt`) work in-memory over the JSON store, but this is not indexed SQL — fine for demos, not large-scale query workloads.

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
