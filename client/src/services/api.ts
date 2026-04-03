export type AskMeta = {
  usedEmbeddings: boolean;
  excerptsInPrompt: number;
  totalChunks: number;
  similarChunksSelected: number;
  segmentsOmitted: number;
  embeddingModel?: string;
  answerFromCache?: boolean;
  embeddingVectorCacheHits?: number;
  embeddingVectorCacheMisses?: number;
  vectorStore?: "memory" | "pinecone";
  resumeId?: string;
};

export type ResumeIndexResponse = {
  resumeId: string;
  segmentCount: number;
  embeddingModel: string;
};

export type AskResponse = {
  answer: string;
  meta: AskMeta | null;
};

export type AskError = { error: string };

/**
 * Use relative `/api/...` in dev so the Vite dev server proxies to the API (same origin — no CORS,
 * no wrong host/port). Set `VITE_API_URL` only when the API is on another origin.
 */
function apiUrl(path: string): string {
  const trimmed = path.startsWith("/") ? path : `/${path}`;
  const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (fromEnv) return `${fromEnv.replace(/\/$/, "")}${trimmed}`;
  return trimmed;
}

async function apiFetch(url: string, init: RequestInit): Promise<Response> {
  const token = localStorage.getItem('token');
  const headers = {
    ...init.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  try {
    return await fetch(url, { ...init, headers });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Network error";
    throw new Error(
      `${detail} — Is the API running? From the project root run \`npm run dev\` (starts client + server on port 3001). If the API uses another port, set VITE_API_URL in client/.env`
    );
  }
}

function normalizeAskMeta(data: AskResponse & AskError): AskResponse {
  const raw = data.meta ?? null;
  let meta = raw;
  if (raw) {
    const fixes: Partial<AskMeta> = {};
    if (raw.similarChunksSelected === undefined) {
      fixes.similarChunksSelected = raw.usedEmbeddings ? raw.excerptsInPrompt : 0;
    }
    if (raw.segmentsOmitted === undefined) {
      fixes.segmentsOmitted = 0;
    }
    if (Object.keys(fixes).length > 0) meta = { ...raw, ...fixes };
  }
  return { answer: data.answer, meta };
}

async function parseAskResponse(res: Response): Promise<AskResponse> {
  const rawText = await res.text();
  if (!rawText.trim()) {
    if (!res.ok) {
      throw new Error(
        `Server returned ${res.status} with an empty body. Start the API (see Vite terminal for proxy errors).`
      );
    }
    throw new Error(
      "Server returned an empty response. The request may have timed out — check the API terminal."
    );
  }

  let data: AskResponse & AskError;
  try {
    data = JSON.parse(rawText) as AskResponse & AskError;
  } catch {
    throw new Error(
      `Bad response from server (not JSON): ${rawText.slice(0, 200)}${rawText.length > 200 ? "…" : ""}`
    );
  }

  if (!res.ok) {
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }

  return normalizeAskMeta(data);
}

export async function askResume(
  resumeText: string,
  question: string
): Promise<AskResponse> {
  const res = await apiFetch(apiUrl("/api/ask"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resumeText, question }),
  });
  return parseAskResponse(res);
}

export async function askResumeFromPdf(
  file: File,
  question: string
): Promise<AskResponse> {
  const body = new FormData();
  body.append("resumePdf", file);
  body.append("question", question);
  const res = await apiFetch(apiUrl("/api/ask-pdf"), { method: "POST", body });
  return parseAskResponse(res);
}

/** Upload PDF only: chunk + embed + Pinecone; returns resumeId for /api/ask. */
export async function indexResumePdf(file: File): Promise<ResumeIndexResponse> {
  const body = new FormData();
  body.append("resumePdf", file);
  const res = await apiFetch(apiUrl("/api/resume/upload-pdf"), {
    method: "POST",
    body,
  });
  const rawText = await res.text();
  if (!rawText.trim()) {
    throw new Error(`Index failed (${res.status}): empty response`);
  }
  let data: ResumeIndexResponse & { error?: string };
  try {
    data = JSON.parse(rawText) as ResumeIndexResponse & { error?: string };
  } catch {
    throw new Error(`Bad index response: ${rawText.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(data.error ?? `Index failed (${res.status})`);
  }
  return data;
}

export async function indexResumeText(
  resumeText: string
): Promise<ResumeIndexResponse> {
  const res = await apiFetch(apiUrl("/api/resume/index"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resumeText }),
  });
  const rawText = await res.text();
  if (!rawText.trim()) {
    throw new Error(`Index failed (${res.status}): empty response`);
  }
  let data: ResumeIndexResponse & { error?: string };
  try {
    data = JSON.parse(rawText) as ResumeIndexResponse & { error?: string };
  } catch {
    throw new Error(`Bad index response: ${rawText.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(data.error ?? `Index failed (${res.status})`);
  }
  return data;
}

export async function askResumeById(
  resumeId: string,
  question: string
): Promise<AskResponse> {
  const res = await apiFetch(apiUrl("/api/ask"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resumeId, question }),
  });
  return parseAskResponse(res);
}
