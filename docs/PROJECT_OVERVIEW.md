# ResumeAI — Project Overview

Ask natural-language questions about a resume and get answers grounded **only** in that
resume's text. Upload a PDF (or paste text), the system indexes it into a vector store, and
every question is answered from the passages that actually match the question — not from the
model's own knowledge.

Built for screening: "how many years of React?", "what did they do at Acme?", "do they have
AWS experience?" — answered from the document, with a clear "not stated in the resume" when
the document doesn't say.

---

## 1. What's included

| Capability | Where it lives |
|---|---|
| PDF upload → text extraction (5 MB cap, text-layer PDFs) | `server/src/services/pdfText.ts` |
| Paste-resume-as-text path | `POST /api/resume/index` |
| Semantic chunking of resume text | `server/src/services/resumeEmbeddings.ts` |
| Embedding + vector upsert to Pinecone | `server/src/services/pineconeVectors.ts` |
| Retrieval-augmented Q&A over one resume | `server/src/services/resumeQA.ts` |
| Per-browser resume library (no login) | `server/src/middleware/session.ts`, `models/Session.ts` |
| Persistent chat assistant with memory + summarisation | `server/src/routes/chat.ts` |
| Answer cache + embedding-vector cache | `services/answerCache.ts`, `services/embeddingCache.ts` |
| Model fallback chain + transient-error retry | `server/src/utils/geminiRetry.ts` |
| Health + Pinecone self-test probes | `server/src/routes/system.ts` |
| React dashboard (upload, library, ask, answer, delete) | `client/src/pages/Dashboard.tsx` |
| Floating chat widget | `client/src/components/ChatWidget.tsx` |

**Deliberately not included:** user accounts, login, signup, passwords. The app is anonymous
by design — see §6.

---

## 2. Tech stack

**Frontend**
- React 18 + TypeScript
- Vite 6 (build + dev server with `/api` proxy)
- React Router 7 (`/` landing, `/dashboard`)
- Plain CSS, no UI framework
- `lucide-react` icons

**Backend**
- Node.js ≥ 20.19, TypeScript, ESM
- Express 4
- Mongoose 9 → MongoDB (Atlas in production)
- Multer (in-memory upload handling, 5 MB limit)
- `pdf-parse` with a `pdfjs-dist` fallback for text extraction

**AI / retrieval**
- Google Gemini via `@google/genai`
  - Chat: `gemini-3-flash-preview` → falls back to `gemini-2.5-flash` → `gemini-2.5-flash-lite`
  - Embeddings: `gemini-embedding-001`
- Pinecone (dense index, one namespace per resume)
- In-process cosine similarity as a fallback ranker when Pinecone is unavailable

**Infrastructure**
- npm workspaces monorepo (`client`, `server`)
- Vercel: static client + Express wrapped as one serverless function (`api/index.mjs`)
- `render.yaml` present as an alternative long-running-server deploy

---

## 3. Repository layout

```
resumeAI/
├── api/index.mjs          Vercel function — wraps the Express app, awaits bootstrap()
├── client/                React + Vite SPA
│   └── src/
│       ├── pages/         Landing, Dashboard
│       ├── components/    ChatWidget
│       ├── context/       NotificationContext (toasts)
│       └── services/      api.ts, apiBase.ts, session.ts
├── server/                Express API
│   └── src/
│       ├── routes/        resume, ask, chat, session, system
│       ├── services/      embeddings, RAG, Pinecone, PDF, caches
│       ├── models/        Session, Resume
│       ├── middleware/    session.ts
│       └── utils/         geminiRetry, embeddingEnv
├── scripts/stage-output.mjs   Mirrors client/dist → root dist for Vercel
└── vercel.json            Build, output dir, function config, rewrites
```

---

## 4. The AI pipeline

Two distinct phases. Cost and latency are very different between them, which is the whole
reason for the split.

### Phase A — Indexing (once per resume)

```
PDF or pasted text
   │
   ├─ extractTextFromPdf()          pdf-parse, falls back to pdfjs-dist
   │
   ├─ semanticResumeSegments()      split on blank lines → paragraph units
   │                                 oversized blocks split on sentence boundaries
   │                                 then hard sliding windows as a last resort
   │                                 neighbours merged up to the char budget
   │
   ├─ embedTexts()                  Gemini embeddings, batches of 20
   │                                 LRU cache keyed on (model, exact text)
   │
   ├─ ensureResumeVectorsInPinecone()  upsert, namespace = sha256(resumeText)
   │
   ├─ Resume.findOneAndUpdate()     segment texts persisted to MongoDB
   └─ putResumeSession()            segments also held in a RAM LRU (500 resumes)

   → returns { resumeId, segmentCount, embeddingModel }
```

`resumeId` is the SHA-256 of the resume text. Same document uploaded twice = same id, same
namespace, no duplicate work.

### Phase B — Asking (every question)

```
{ resumeId, question }
   │
   ├─ answerCache lookup            exact resume+question string match → return immediately
   │
   ├─ load segments                 RAM LRU → MongoDB recovery if the process restarted
   │
   ├─ embed the QUESTION only       resume chunks are never re-embedded
   │
   ├─ computeRagTopK()              k = min(topK, segmentCount), minus one when truncating
   │
   ├─ Pinecone query (top-k)        → falls back to in-process cosine if Pinecone errors
   │                                   (unless PINECONE_ONLY=true, which fails hard instead)
   │
   ├─ finalizeRagChunks()           dedupe by index, pin segment 0 (contact/header block),
   │                                 drop lowest scorers, restore document order
   │
   ├─ build prompt                  library context + strict grounding instruction
   │                                 + the selected excerpts only
   │
   └─ generateContent()             model chain with retry/backoff on 503/429/500

   → { answer, meta }
```

### Grounding

The prompt is explicit that the model may use **only** the supplied excerpts, must say when
something is not stated, and must not invent employers, dates, skills or credentials. When
RAG ran, the prompt additionally tells the model that it is seeing *excerpts*, not the whole
resume — so "not in the retrieved excerpts" is a valid, honest answer rather than a
hallucinated guess.

### Observability (`meta` on every answer)

Returned to the UI and rendered on the dashboard:

`usedEmbeddings`, `totalChunks`, `excerptsInPrompt`, `similarChunksSelected`,
`segmentsOmitted`, `embeddingModel`, `vectorStore` (`pinecone` | `memory`),
`answerFromCache`, `embeddingVectorCacheHits` / `Misses`, `resumeId`.

So you can always see *why* an answer looked the way it did — how much of the resume the
model actually saw, and where the ranking happened.

---

## 5. The chat assistant

Separate from resume Q&A. `POST /api/chat` is a general assistant that knows the names of
the resumes in your library, so "how many candidates have I uploaded?" works.

Memory model:
- Last 20 messages kept verbatim in `Session.chatHistory`
- `POST /api/chat/summarize` compresses the whole history into `Session.chatSummary`,
  clears the verbatim log, and injects the summary into future system instructions

That keeps prompts bounded without losing the thread across sessions.

---

## 6. Identity model — no accounts

There is no signup, login, or password anywhere.

1. Browser mints a random id on first use, stores it in `localStorage`.
2. Every request carries it as the `X-Session-Id` header.
3. Server upserts a `Session` document keyed on that id.

That document holds the resume library and chat memory. Clearing site data starts a fresh,
empty workspace.

**Security note:** the id is a bearer token in all but name — anyone holding it can read that
workspace. The server validates only its *shape* (`/^[A-Za-z0-9_-]{8,64}$/`), not its
authenticity, and there is no rate limiting on the AI endpoints. Fine for a demo or an
internal tool; both gaps need closing before this handles real candidate data at scale.

---

## 7. Data model (MongoDB)

**Session**
```
sessionId    string, unique, indexed
resumes[]    { resumeId, name, uploadedAt }
chatHistory[] { role: user|assistant, content, timestamp }
chatSummary  string
timestamps
```

**Resume**
```
resumeId     string (sha256 of text), unique, indexed
segments     string[]     — chunk texts, for re-ranking after a restart
timestamps
```

Vectors live in Pinecone, not MongoDB. Mongo stores the *text* of each chunk so that
`finalizeRagChunks` can rebuild context after the serverless instance recycles.

---

## 8. API surface

| Method | Path | Purpose |
|---|---|---|
| GET | `/api` | Route listing |
| GET | `/api/health` | Liveness + DB state + config flags (503 if DB down) |
| GET | `/api/pinecone-test` | Upsert → query → delete probe; verifies key, index, dimension |
| GET | `/api/session/me` | This browser's resume library |
| POST | `/api/resume/index` | JSON `{ resumeText, name }` → index |
| POST | `/api/resume/upload-pdf` | multipart `resumePdf` → extract + index |
| DELETE | `/api/resume/:resumeId` | Remove from library |
| POST | `/api/ask` | `{ resumeId, question }` or `{ resumeText, question }` |
| POST | `/api/ask-pdf` | multipart `resumePdf` + `question`, one-shot, no indexing |
| POST | `/api/chat` | Assistant message |
| GET | `/api/chat/history` | History + summary |
| POST | `/api/chat/summarize` | Compress history into memory |

All routes except `/api`, `/api/health` and `/api/pinecone-test` require `X-Session-Id`.

---

## 9. Caching

Three independent layers, all opt-out via env:

| Layer | Scope | Key | Default size |
|---|---|---|---|
| Answer cache | Whole LLM response | exact resume + question text | 200 entries |
| Embedding vector cache | One embedding | `(model, exact text)` | 3000 entries |
| Resume session store | Chunk texts | `resumeId` | 500 resumes |

All are **in-process LRUs**. On Vercel that means per warm instance — a cold start starts
empty, which is why MongoDB persistence of segments exists as the durable backstop.

Caches match on *exact strings*, not meaning. A rephrased question is a miss.

---

## 10. Reliability

- **Gemini retry** — exponential backoff with jitter on 503/429/500 (5 attempts, 1.5 s base).
- **Model fallback** — after retries exhaust, or on a 404 "unknown model", the next model in
  the chain is tried.
- **Pinecone fallback** — a vector-store failure degrades to in-process cosine ranking rather
  than failing the request, unless `PINECONE_ONLY=true`.
- **Mongo failure is non-fatal** — the process stays up and `/api/health` reports
  `db: "disconnected"`. Exiting would leave the port unbound and make every request hang with
  no status, which is far harder to diagnose.
- **Client timeout** — 180 s ceiling with an actionable error message instead of an infinite
  spinner.
- **Session recovery** — missing in-RAM segments are re-read from MongoDB before giving up.

---

## 11. Configuration

Everything lives in `server/.env` (see `server/.env.example` for the annotated full list).

**Required**
```
GEMINI_API_KEY=            Google AI Studio key
MONGODB_URI=               Mongo connection string
PINECONE_API_KEY=          required for the resumeId flow
PINECONE_INDEX=            dense index name
PINECONE_VECTOR_DIMENSION= must equal the index's dimension
```

**Notable tuning knobs** (defaults as implemented in code)
```
GEMINI_MODEL=gemini-3-flash-preview
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
GEMINI_EMBED_CHUNK_CHARS=300        max chars when merging paragraph units
GEMINI_EMBED_CHUNK_OVERLAP=150      only for oversized blocks
GEMINI_EMBED_TOP_CHUNKS=6           segments sent to the chat model
GEMINI_EMBED_ALLOW_FULL_COVERAGE    allow every segment when truncating
GEMINI_SKIP_RAG=true                one call, whole resume — no retrieval
PINECONE_ONLY=true                  never fall back to in-memory ranking
CLIENT_ORIGIN=                      CORS allowlist, supports one-label wildcards
```

`PINECONE_VECTOR_DIMENSION` is also passed to Gemini as `outputDimensionality`, so the
embedding width always matches the index. Mismatch here is the most common setup failure —
`GET /api/pinecone-test` catches it.

---

## 12. Deployment

**Vercel (current target).** One project serves both halves:

- `vercel.json` → `buildCommand: npm run vercel-build`, `outputDirectory: dist`
- Build order: install workspaces → build client → build server (`tsc`) → `stage-output`
- `scripts/stage-output.mjs` mirrors `client/dist` to a root `dist/`, because `outputDirectory`
  resolves against the project's Root Directory
- `api/index.mjs` imports `server/dist/app.js` and becomes the serverless function
  (60 s max duration, 1024 MB)
- Rewrites: `/api/*` → the function; everything else → `index.html` for SPA routing

Client and API share one origin, so the browser makes same-origin `/api/...` calls — no CORS
list to maintain and no `VITE_API_URL` to bake in.

> **Root Directory must be the repo root.** If it points at `client/`, Vercel never reads the
> root `vercel.json`, and `api/index.mjs` falls outside the deployment root — the site builds
> and deploys clean, but no function is created and every `/api/*` call 404s.

**Local**
```bash
npm install
npm run dev          # client :5173 + server :3001, Vite proxies /api
```

---

## 13. Known limits

- **Scanned/image-only PDFs** produce no text. There is no OCR; the API returns a clear 400.
- **5 MB / single-file** uploads only.
- **One resume per question.** No cross-resume comparison ("rank these five candidates") —
  retrieval is scoped to a single namespace.
- **Caches are exact-match**, so semantically identical questions still cost a full round trip.
- **Cold starts** empty every in-process cache; the first question after idle is the slowest.
- **No rate limiting** on the Gemini-backed endpoints — an open deployment is an open bill.
- **`GEMINI_SKIP_RAG` is incompatible with `resumeId`** and returns an explicit error.
