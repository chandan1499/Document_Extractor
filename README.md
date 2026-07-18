# Document Extraction App

Interview assignment: upload or paste documents (invoice, resume, meeting notes), extract structured JSON with an LLM, review fields with confidence scores, save, search, and improve extractions from user corrections.

**Live demo:** [App](https://document-extractor-01.netlify.app/) · [API](https://document-extractor-mc4d.onrender.com/api/) · [GitHub](https://github.com/chandan1499/Document_Extractor)

> Render free tier sleeps when idle — first API call may take 30–60s.

## What it does

- Upload TXT, PDF, CSV, or images (OCR) — or paste text
- Classify document type and extract structured fields (Groq + Zod validation)
- Review UI: per-field confidence, source highlighting, low-confidence save confirmation
- Save, search, filter, and export documents (JSON / CSV)
- Learn from corrections — stored guidelines improve later extractions
- Custom extraction schemas (signed-in users)
- Guest mode: 3 free extractions, data in `localStorage`; sign in to sync to Postgres

## Tech stack

| Layer | Stack |
|-------|--------|
| Frontend | React 18, Vite, TypeScript, React Router |
| Backend | Node.js, Express, TypeScript |
| LLM | Groq (OpenAI-compatible SDK, strict JSON schema) |
| Database | Supabase Postgres |
| Auth | Supabase Auth (JWT) |
| Deploy | Netlify (client), Render (server) |

Monorepo: `client/` (Vite app) + `server/` (Express API).

## Architecture

```
Upload → preprocess → classify → extract → validate → review → save
                                      ↑
                              learned guidelines
```

Pipeline modules live under `server/src/` (`pipeline`, `providers`, `schemas`, `registry`, `validation`, `repository`, `routes`). The client switches between `localStorage` (guest) and API (authenticated) via `StorageContext`.

## Local setup

**Prerequisites:** Node.js 18+, [Groq API key](https://console.groq.com), [Supabase project](https://supabase.com)

```bash
git clone https://github.com/chandan1499/Document_Extractor.git
cd Document_Extractor
yarn install
```

1. Run `server/db/schema.sql` in the Supabase SQL Editor (enable Email auth).
2. Copy env files from `.env.example`:
   ```bash
   cp .env.example server/.env
   # Also set client/.env (or root) with VITE_* vars — see .env.example
   ```
3. Fill in `server/.env`: `DATABASE_URL`, `GROQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, model names.
4. Start dev servers:
   ```bash
   yarn dev
   ```
   - Client: http://localhost:5173  
   - Server: http://localhost:4000  

For schema updates on an existing DB: `cd server && npm run db:migrate`

## Routes & auth

| Route | Purpose |
|-------|---------|
| `/` | Upload & extract |
| `/documents` | Saved documents |
| `/schemas` | Custom schemas (login required) |
| `/login`, `/signup` | Auth |

**Guest:** upload, extract (3 total), review, and list documents locally. **Signed in:** unlimited extractions, Postgres storage, custom schemas. Guest data merges on login via `POST /api/sync-local`.

Public API (no JWT): extract, propose schema, learning-rules. Everything else requires auth.

## Tests

```bash
cd server && npm test
```

Server tests use a mocked LLM (Vitest + Supertest).

## Deployment

- **Client:** Netlify — build `client/`, SPA redirect in `netlify.toml`. Set `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- **Server:** Render — see `render.yaml`. Set `DATABASE_URL`, `GROQ_API_KEY`, `SUPABASE_*`, `GUEST_EXTRACT_LIMIT`, model env vars.

## License

MIT
