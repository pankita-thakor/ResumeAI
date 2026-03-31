import { createHash } from "node:crypto";
import { embeddingOutputDimensionality } from "../utils/embeddingEnv.js";
import { isPineconeVectorStoreConfigured } from "./pineconeVectors.js";
import type { AskInput, AskResult } from "./resumeQA.js";

function maxEntries(): number {
  const n = Number(process.env.GEMINI_ANSWER_CACHE_MAX ?? 200);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 200;
}

export function isAnswerCacheEnabled(): boolean {
  const v = process.env.GEMINI_ANSWER_CACHE?.trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "off";
}

function cacheKey(input: AskInput): string {
  const skipRag =
    process.env.GEMINI_SKIP_RAG === "1" ||
    process.env.GEMINI_SKIP_RAG === "true";
  const h = createHash("sha256");
  if ("resumeId" in input) {
    h.update("id\0", "utf8").update(input.resumeId, "utf8");
  } else {
    h.update("text\0", "utf8").update(input.resumeText.trim(), "utf8");
  }
  return h
    .update("\0")
    .update(input.question.trim(), "utf8")
    .update("\0")
    .update(process.env.GEMINI_MODEL ?? "", "utf8")
    .update("\0")
    .update(process.env.GEMINI_EMBEDDING_MODEL ?? "", "utf8")
    .update("\0")
    .update(skipRag ? "skipRag" : "rag", "utf8")
    .update("\0")
    .update(
      skipRag
        ? ""
        : "resumeId" in input
          ? "indexed-pinecone"
          : isPineconeVectorStoreConfigured()
            ? "pinecone"
            : "memory",
      "utf8"
    )
    .update("\0")
    .update(String(embeddingOutputDimensionality() ?? ""), "utf8")
    .digest("base64url");
}

export class AnswerLruCache {
  private readonly map = new Map<string, AskResult>();

  constructor(private readonly limit: number) {}

  get(key: string): AskResult | undefined {
    if (this.limit <= 0) return undefined;
    const v = this.map.get(key);
    if (v === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }

  set(key: string, value: AskResult): void {
    if (this.limit <= 0) return;
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.limit > 0 && this.map.size > this.limit) {
      const first = this.map.keys().next().value as string;
      this.map.delete(first);
    }
  }
}

let singleton: AnswerLruCache | null = null;

function getStore(): AnswerLruCache {
  if (!singleton) singleton = new AnswerLruCache(maxEntries());
  return singleton;
}

export function getCachedAnswer(input: AskInput): AskResult | undefined {
  if (!isAnswerCacheEnabled()) return undefined;
  return getStore().get(cacheKey(input));
}

export function setCachedAnswer(input: AskInput, result: AskResult): void {
  if (!isAnswerCacheEnabled()) return;
  getStore().set(cacheKey(input), result);
}
