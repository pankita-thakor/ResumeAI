import { ApiError } from "@google/genai";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** True when Google (or the SDK) indicates overload / rate limit / temporary outage. */
export function isTransientGeminiError(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.status === 503 || err.status === 429 || err.status === 500;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /\b503\b/.test(msg) ||
    /\b429\b/.test(msg) ||
    /\b500\b/.test(msg) ||
    /UNAVAILABLE/i.test(msg) ||
    /RESOURCE_EXHAUSTED/i.test(msg) ||
    /high demand/i.test(msg) ||
    /try again later/i.test(msg)
  );
}

export async function withGeminiRetry<T>(
  fn: () => Promise<T>,
  label: string
): Promise<T> {
  const attempts = Math.max(
    1,
    Math.floor(Number(process.env.GEMINI_RETRY_ATTEMPTS || 5)) || 5
  );
  const baseMs = Math.max(
    200,
    Math.floor(Number(process.env.GEMINI_RETRY_BASE_MS || 1500)) || 1500
  );

  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isTransientGeminiError(e) || attempt === attempts) {
        throw e;
      }
      const jitter = Math.random() * 400;
      const delay = baseMs * 2 ** (attempt - 1) + jitter;
      console.warn(
        `[resumeAI] ${label}: transient error (${attempt}/${attempts}), waiting ${Math.round(delay)}ms`
      );
      await sleep(delay);
    }
  }
  throw lastErr;
}

/** After retries, try the next model in the chain (overload, 404 unknown model, etc.). */
export function shouldTryNextChatModel(err: unknown): boolean {
  if (isTransientGeminiError(err)) return true;
  if (err instanceof ApiError && err.status === 404) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /NOT_FOUND/i.test(msg) ||
    /is not found for API version/i.test(msg) ||
    /not supported for generateContent/i.test(msg)
  );
}

export function resolveChatModelChain(): string[] {
  const primary =
    process.env.GEMINI_MODEL?.trim() || "gemini-3-flash-preview";
  const fromEnv = (process.env.GEMINI_MODEL_FALLBACKS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const defaults = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
  const ordered = [primary, ...fromEnv, ...defaults];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of ordered) {
    if (!m || seen.has(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out;
}
