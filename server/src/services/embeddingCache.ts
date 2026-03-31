import { createHash } from "node:crypto";
import { embeddingOutputDimensionality } from "../utils/embeddingEnv.js";

function cacheMaxEntries(): number {
  const n = Number(process.env.GEMINI_EMBED_CACHE_MAX ?? 3000);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 3000;
}

export function isEmbeddingCacheEnabled(): boolean {
  const v = process.env.GEMINI_EMBED_CACHE?.trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "off";
}

/**
 * LRU cache of embedding vectors in memory (key = model + SHA-256 of text).
 * Speeds up repeated questions on the same resume or repeated strings.
 */
export class EmbeddingVectorCache {
  private readonly map = new Map<string, number[]>();

  constructor(private readonly maxEntries: number) {}

  private static cacheKey(model: string, text: string): string {
    const dim = embeddingOutputDimensionality();
    return createHash("sha256")
      .update(model, "utf8")
      .update("\0")
      .update(text, "utf8")
      .update("\0")
      .update(dim !== undefined ? String(dim) : "", "utf8")
      .digest("base64url");
  }

  get(model: string, text: string): number[] | undefined {
    if (this.maxEntries <= 0) return undefined;
    const k = EmbeddingVectorCache.cacheKey(model, text);
    const v = this.map.get(k);
    if (v === undefined) return undefined;
    this.map.delete(k);
    this.map.set(k, v);
    return v;
  }

  set(model: string, text: string, vector: number[]): void {
    if (this.maxEntries <= 0) return;
    const k = EmbeddingVectorCache.cacheKey(model, text);
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, vector);
    while (this.maxEntries > 0 && this.map.size > this.maxEntries) {
      const first = this.map.keys().next().value as string;
      this.map.delete(first);
    }
  }
}

let cacheSingleton: EmbeddingVectorCache | null = null;

export function getEmbeddingVectorCache(): EmbeddingVectorCache {
  if (!cacheSingleton) {
    cacheSingleton = new EmbeddingVectorCache(cacheMaxEntries());
  }
  return cacheSingleton;
}
