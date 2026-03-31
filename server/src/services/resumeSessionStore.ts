/**
 * In-memory resume sessions: after indexing to Pinecone we keep chunk texts so question-time
 * retrieval can run finalizeRagChunks / pins without re-sending full resume text.
 * Restarting the API clears sessions (client must re-index).
 */

export type ResumeSessionData = {
  segments: string[];
};

function maxSessions(): number {
  const n = Number(process.env.RESUME_SESSION_MAX ?? 500);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 500;
}

const store = new Map<string, ResumeSessionData>();

function touch(key: string, value: ResumeSessionData): void {
  store.delete(key);
  store.set(key, value);
  const limit = maxSessions();
  while (store.size > limit) {
    const first = store.keys().next().value as string;
    store.delete(first);
  }
}

export function putResumeSession(resumeId: string, data: ResumeSessionData): void {
  touch(resumeId.trim(), data);
}

export function getResumeSession(resumeId: string): ResumeSessionData | undefined {
  const key = resumeId.trim();
  const v = store.get(key);
  if (v === undefined) return undefined;
  store.delete(key);
  store.set(key, v);
  return v;
}
