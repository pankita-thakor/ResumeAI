import type { GoogleGenAI } from "@google/genai";
import {
  getEmbeddingVectorCache,
  isEmbeddingCacheEnabled,
} from "./embeddingCache.js";
import {
  ensureResumeVectorsInPinecone,
  isPineconeOnlyMode,
  isPineconeVectorStoreConfigured,
  queryResumeVectorsFromPinecone,
  resumeTextNamespace,
} from "./pineconeVectors.js";
import { getResumeSession, putResumeSession } from "./resumeSessionStore.js";
import {
  computeRagTopK,
  finalizeRagChunks,
  type IndexedRagMatch,
} from "./ragChunkPick.js";
import { geminiEmbedContentConfig } from "../utils/embeddingEnv.js";
import { withGeminiRetry } from "../utils/geminiRetry.js";

const DEFAULT_EMBED_MODEL = "gemini-embedding-001";

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Last resort: sliding windows (no natural breaks). */
function hardWindowSlices(text: string, maxChars: number, overlap: number): string[] {
  const t = text.trim();
  if (!t) return [];
  const out: string[] = [];
  let start = 0;
  while (start < t.length) {
    const end = Math.min(start + maxChars, t.length);
    const slice = t.slice(start, end).trim();
    if (slice.length > 0) out.push(slice);
    if (end >= t.length) break;
    start = Math.max(0, end - overlap);
  }
  return out;
}

/**
 * Break an oversized block using sentence boundaries when possible, then hard slices.
 */
function splitOversizedBlock(text: string, maxChars: number, overlap: number): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed ? [trimmed] : [];

  const rough = trimmed.match(/[^.!?]+(?:[.!?]+|$)/g);
  const sentences =
    rough?.map((s) => s.trim()).filter((s) => s.length > 0) ?? [];

  if (sentences.length <= 1) {
    return hardWindowSlices(trimmed, maxChars, overlap);
  }

  const merged: string[] = [];
  let acc = "";
  for (const s of sentences) {
    if (!acc) {
      acc = s;
      continue;
    }
    if (acc.length + 1 + s.length <= maxChars) acc = `${acc} ${s}`;
    else {
      merged.push(acc);
      acc = s;
    }
  }
  if (acc) merged.push(acc);

  const out: string[] = [];
  for (const p of merged) {
    if (p.length <= maxChars) out.push(p);
    else out.push(...hardWindowSlices(p, maxChars, overlap));
  }
  return out;
}

/**
 * Split resume into segments along paragraphs (blank lines), merge small neighbors up to
 * maxSegmentChars, split huge blocks by sentences/windows. Count and boundaries are not fixed —
 * embedding similarity then chooses the best segments for the question.
 */
function semanticResumeSegments(
  text: string,
  maxSegmentChars: number,
  overlap: number
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const paragraphs = trimmed
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const units: string[] = [];
  for (const p of paragraphs) {
    if (p.length <= maxSegmentChars) units.push(p);
    else units.push(...splitOversizedBlock(p, maxSegmentChars, overlap));
  }

  const merged: string[] = [];
  let acc = "";
  for (const u of units) {
    if (!acc) {
      acc = u;
      continue;
    }
    if (acc.length + 2 + u.length <= maxSegmentChars) acc = `${acc}\n\n${u}`;
    else {
      merged.push(acc);
      acc = u;
    }
  }
  if (acc) merged.push(acc);
  return merged;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

type EmbedTextsResult = {
  vectors: number[][];
  cacheHits: number;
  cacheMisses: number;
};

async function embedTextsUncached(
  ai: GoogleGenAI,
  model: string,
  texts: string[]
): Promise<EmbedTextsResult> {
  const batchSize = 20;
  const vectors: number[][] = [];

  const embedCfg = geminiEmbedContentConfig();
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await withGeminiRetry(
      () =>
        ai.models.embedContent({
          model,
          contents: batch,
          ...(embedCfg ? { config: embedCfg } : {}),
        }),
      `embedContent(${model})`
    );
    const embeddings = response.embeddings ?? [];
    if (embeddings.length !== batch.length) {
      throw new Error(
        `Embedding batch size mismatch: expected ${batch.length}, got ${embeddings.length}`
      );
    }
    for (const emb of embeddings) {
      const values = emb.values;
      if (!values?.length) {
        throw new Error("Gemini returned an embedding without values.");
      }
      vectors.push(values);
    }
  }

  return {
    vectors,
    cacheHits: 0,
    cacheMisses: texts.length,
  };
}

async function embedTexts(
  ai: GoogleGenAI,
  model: string,
  texts: string[]
): Promise<EmbedTextsResult> {
  if (!isEmbeddingCacheEnabled() || texts.length === 0) {
    if (texts.length === 0) {
      return { vectors: [], cacheHits: 0, cacheMisses: 0 };
    }
    return embedTextsUncached(ai, model, texts);
  }

  const cache = getEmbeddingVectorCache();
  const out: number[][] = new Array(texts.length);
  const pending: { index: number; text: string }[] = [];
  let hits = 0;

  for (let i = 0; i < texts.length; i++) {
    const t = texts[i]!;
    const cached = cache.get(model, t);
    if (cached) {
      out[i] = cached;
      hits++;
    } else {
      pending.push({ index: i, text: t });
    }
  }

  const embedCfg = geminiEmbedContentConfig();
  const batchSize = 20;
  for (let i = 0; i < pending.length; i += batchSize) {
    const slice = pending.slice(i, i + batchSize);
    const batch = slice.map((p) => p.text);
    const response = await withGeminiRetry(
      () =>
        ai.models.embedContent({
          model,
          contents: batch,
          ...(embedCfg ? { config: embedCfg } : {}),
        }),
      `embedContent(${model})`
    );
    const embeddings = response.embeddings ?? [];
    if (embeddings.length !== slice.length) {
      throw new Error(
        `Embedding batch size mismatch: expected ${slice.length}, got ${embeddings.length}`
      );
    }
    for (let j = 0; j < slice.length; j++) {
      const values = embeddings[j]?.values;
      if (!values?.length) {
        throw new Error("Gemini returned an embedding without values.");
      }
      const { index, text } = slice[j]!;
      cache.set(model, text, values);
      out[index] = values;
    }
  }

  if (process.env.GEMINI_EMBED_CACHE_LOG === "1") {
    console.info(
      "[resumeAI] embedding cache: hits=%d api_calls=%d (texts=%d)",
      hits,
      Math.ceil(pending.length / batchSize),
      texts.length
    );
  }

  return {
    vectors: out,
    cacheHits: hits,
    cacheMisses: pending.length,
  };
}

export type RetrievedContext = {
  chunks: string[];
  usedRag: boolean;
  /** Segments the resume was split into before embedding-based top‑K selection. */
  totalChunks: number;
  embeddingModel?: string;
  /** Segments not passed to the chat model (0 when RAG not used or full coverage allowed). */
  segmentsOmitted: number;
  /** In-memory embedding vector cache (exact string match). Only set when RAG ran. */
  embeddingVectorCacheHits?: number;
  embeddingVectorCacheMisses?: number;
  /** Where segment ranking ran after embedding. */
  vectorStore?: "memory" | "pinecone";
};

export type ResumeIndexResult = {
  resumeId: string;
  segmentCount: number;
  embeddingModel: string;
};

/**
 * Chunk → Gemini embeddings → upsert to Pinecone (force) → store segment texts in server session.
 * Use on resume upload; then ask with `resumeId` only (embed question → query Pinecone → LLM).
 */
export async function indexResumeToPinecone(
  ai: GoogleGenAI,
  resumeText: string
): Promise<ResumeIndexResult> {
  if (!isPineconeVectorStoreConfigured()) {
    throw new Error(
      "Pinecone is not configured. Set PINECONE_API_KEY and PINECONE_INDEX to index resumes."
    );
  }

  const trimmed = resumeText.trim();
  const maxSegment = envInt("GEMINI_EMBED_CHUNK_CHARS", 300);
  const overlap = envInt("GEMINI_EMBED_CHUNK_OVERLAP", 150);
  const segments = semanticResumeSegments(trimmed, maxSegment, overlap);
  if (segments.length === 0) {
    throw new Error("No resume text to index.");
  }

  const embedModel =
    process.env.GEMINI_EMBEDDING_MODEL?.trim() || DEFAULT_EMBED_MODEL;
  const resumeId = resumeTextNamespace(trimmed);
  const segEmb = await embedTexts(ai, embedModel, segments);
  await ensureResumeVectorsInPinecone(resumeId, segments, segEmb.vectors, {
    force: true,
  });
  putResumeSession(resumeId, { segments });

  return {
    resumeId,
    segmentCount: segments.length,
    embeddingModel: embedModel,
  };
}

/**
 * Question-time: session segments + embed question only → Pinecone query → top chunks.
 * Resume chunks are not re-embedded (vectors already in Pinecone from the index step).
 */
export async function retrieveIndexedResumeContext(
  ai: GoogleGenAI,
  resumeId: string,
  question: string
): Promise<RetrievedContext> {
  const trimmedId = resumeId.trim();
  const session = getResumeSession(trimmedId);
  if (!session) {
    throw new Error(
      "Resume session not found or expired. Index the resume again (POST /api/resume/index or /api/resume/upload-pdf)."
    );
  }

  const segments = session.segments;
  if (segments.length === 0) {
    return {
      chunks: [],
      usedRag: false,
      totalChunks: 0,
      segmentsOmitted: 0,
    };
  }

  if (segments.length === 1) {
    return {
      chunks: segments,
      usedRag: false,
      totalChunks: 1,
      segmentsOmitted: 0,
    };
  }

  if (!isPineconeVectorStoreConfigured()) {
    throw new Error("Pinecone is not configured; cannot query indexed resume.");
  }

  const embedModel =
    process.env.GEMINI_EMBEDDING_MODEL?.trim() || DEFAULT_EMBED_MODEL;
  const topK = envInt("GEMINI_EMBED_TOP_CHUNKS", 6);
  const allowFullCoverage =
    process.env.GEMINI_EMBED_ALLOW_FULL_COVERAGE === "true" ||
    process.env.GEMINI_EMBED_ALLOW_FULL_COVERAGE === "1";
  const k = computeRagTopK(segments.length, topK, allowFullCoverage);

  const qEmb = await embedTexts(ai, embedModel, [question]);
  const qVec = qEmb.vectors[0];
  if (!qVec) throw new Error("Failed to embed question.");

  const hits = await queryResumeVectorsFromPinecone(trimmedId, qVec, k);
  const initial: IndexedRagMatch[] = hits.map((h) => ({
    chunk_index: h.chunk_index,
    text: h.text,
    score: h.score,
  }));
  const similar = finalizeRagChunks(segments, initial, k, topK);
  const omitted = segments.length - similar.length;

  return {
    chunks: similar,
    usedRag: true,
    totalChunks: segments.length,
    embeddingModel: embedModel,
    segmentsOmitted: omitted,
    embeddingVectorCacheHits: qEmb.cacheHits,
    embeddingVectorCacheMisses: qEmb.cacheMisses,
    vectorStore: "pinecone",
  };
}

/**
 * Segments follow resume structure (paragraphs / sentences), not a fixed number of slices.
 * When there are 2+ segments, the embedding model scores each against the question and the
 * top‑K segments are passed to the chat model.
 */
export async function retrieveResumeContext(
  ai: GoogleGenAI,
  resumeText: string,
  question: string
): Promise<RetrievedContext> {
  const maxSegment = envInt("GEMINI_EMBED_CHUNK_CHARS", 300);
  const overlap = envInt("GEMINI_EMBED_CHUNK_OVERLAP", 150);
  const topK = envInt("GEMINI_EMBED_TOP_CHUNKS", 6);

  const embedModel =
    process.env.GEMINI_EMBEDDING_MODEL?.trim() || DEFAULT_EMBED_MODEL;

  const segments = semanticResumeSegments(resumeText, maxSegment, overlap);
  if (segments.length === 0) {
    return {
      chunks: [],
      usedRag: false,
      totalChunks: 0,
      segmentsOmitted: 0,
    };
  }

  if (segments.length === 1) {
    return {
      chunks: segments,
      usedRag: false,
      totalChunks: 1,
      segmentsOmitted: 0,
    };
  }

  if (isPineconeOnlyMode() && !isPineconeVectorStoreConfigured()) {
    throw new Error(
      "PINECONE_ONLY is set but Pinecone is not configured. Set PINECONE_API_KEY and PINECONE_INDEX " +
        "(and ensure PINECONE_VECTOR_STORE is not disabled), or load server/.env from the API process."
    );
  }

  const [segEmb, qEmb] = await Promise.all([
    embedTexts(ai, embedModel, segments),
    embedTexts(ai, embedModel, [question]),
  ]);
  const segmentVectors = segEmb.vectors;
  const qVec = qEmb.vectors[0];
  if (!qVec) throw new Error("Failed to embed question.");

  const allowFullCoverage =
    process.env.GEMINI_EMBED_ALLOW_FULL_COVERAGE === "true" ||
    process.env.GEMINI_EMBED_ALLOW_FULL_COVERAGE === "1";

  const k = computeRagTopK(segments.length, topK, allowFullCoverage);

  const cacheHits = segEmb.cacheHits + qEmb.cacheHits;
  const cacheMisses = segEmb.cacheMisses + qEmb.cacheMisses;

  if (isPineconeVectorStoreConfigured()) {
    try {
      const ns = resumeTextNamespace(resumeText);
      await ensureResumeVectorsInPinecone(ns, segments, segmentVectors);
      const hits = await queryResumeVectorsFromPinecone(ns, qVec, k);
      const initial: IndexedRagMatch[] = hits.map((h) => ({
        chunk_index: h.chunk_index,
        text: h.text,
        score: h.score,
      }));
      const similar = finalizeRagChunks(segments, initial, k, topK);
      const omitted = segments.length - similar.length;
      return {
        chunks: similar,
        usedRag: true,
        totalChunks: segments.length,
        embeddingModel: embedModel,
        segmentsOmitted: omitted,
        embeddingVectorCacheHits: cacheHits,
        embeddingVectorCacheMisses: cacheMisses,
        vectorStore: "pinecone",
      };
    } catch (e) {
      if (isPineconeOnlyMode()) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Pinecone RAG failed (PINECONE_ONLY): ${msg}`);
      }
      console.warn(
        "[resumeAI] Pinecone vector query failed; falling back to in-process similarity.",
        e instanceof Error ? e.message : e
      );
    }
  }

  const scored = segmentVectors.map((vec, index) => ({
    index,
    score: cosineSimilarity(qVec, vec),
  }));
  scored.sort((a, b) => b.score - a.score);

  const initialMem: IndexedRagMatch[] = scored
    .slice(0, k)
    .map((s) => ({
      chunk_index: s.index,
      text: segments[s.index]!,
      score: s.score,
    }));
  const similar = finalizeRagChunks(segments, initialMem, k, topK);
  const omitted = segments.length - similar.length;

  return {
    chunks: similar,
    usedRag: true,
    totalChunks: segments.length,
    embeddingModel: embedModel,
    segmentsOmitted: omitted,
    embeddingVectorCacheHits: cacheHits,
    embeddingVectorCacheMisses: cacheMisses,
    vectorStore: "memory",
  };
}

