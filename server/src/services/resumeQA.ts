import { GoogleGenAI } from "@google/genai";
import { getCachedAnswer, setCachedAnswer } from "./answerCache.js";
import {
  resolveChatModelChain,
  shouldTryNextChatModel,
  withGeminiRetry,
} from "../utils/geminiRetry.js";
import {
  retrieveIndexedResumeContext,
  retrieveResumeContext,
} from "./resumeEmbeddings.js";

export type AskInput =
  | { resumeText: string; question: string }
  | { resumeId: string; question: string };

export type AskMeta = {
  usedEmbeddings: boolean;
  /** Resume sections actually included in the chat prompt. */
  excerptsInPrompt: number;
  /** Sections the resume was split into before ranking (0 if empty). */
  totalChunks: number;
  /** How many of those sections the embedding model picked as most similar to the question (0 if embeddings were not used for ranking). */
  similarChunksSelected: number;
  /** Sections that exist in the resume but were not included in the chat prompt (embedding path only). */
  segmentsOmitted: number;
  embeddingModel?: string;
  /** Whole answer reused from server RAM; requires exact same resume + question strings (not “similar meaning”). */
  answerFromCache?: boolean;
  /** Embedding vector LRU: how many texts matched cache (exact string). Only when RAG ran. */
  embeddingVectorCacheHits?: number;
  /** Texts that required a live embed API call in this request. */
  embeddingVectorCacheMisses?: number;
  /** Segment ranking backend (only when RAG ran). */
  vectorStore?: "memory" | "pinecone";
  /** Set when the question used POST /api/resume/index (or upload-pdf) first. */
  resumeId?: string;
};

export type AskResult = {
  answer: string;
  meta: AskMeta | null;
};

function skipRagFromEnv(): boolean {
  const v = process.env.GEMINI_SKIP_RAG?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export async function answerFromResume(input: AskInput): Promise<AskResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return {
      answer:
        "Set GEMINI_API_KEY in server/.env (copy from server/.env.example). " +
        "Restart the server after saving.\n\n" +
        (`resumeId` in input
          ? `[Demo] Question: "${input.question}" — resumeId flow (index requires API key).`
          : `[Demo] Question: "${input.question}" — resume length: ${input.resumeText.length} chars.`),
      meta: null,
    };
  }

  const cached = getCachedAnswer(input);
  if (cached) {
    console.info("[resumeAI] answer cache HIT (exact resume + question text)");
    return {
      answer: cached.answer,
      meta: cached.meta
        ? { ...cached.meta, answerFromCache: true }
        : {
            answerFromCache: true,
            usedEmbeddings: false,
            excerptsInPrompt: 0,
            totalChunks: 0,
            similarChunksSelected: 0,
            segmentsOmitted: 0,
          },
    };
  }

  const ai = new GoogleGenAI({ apiKey });

  let chunks: string[];
  let usedRag: boolean;
  let totalChunks: number;
  let embeddingModel: string | undefined;
  let segmentsOmitted: number;
  let embeddingVectorCacheHits: number | undefined;
  let embeddingVectorCacheMisses: number | undefined;
  let vectorStore: "memory" | "pinecone" | undefined;

  if ("resumeId" in input) {
    if (skipRagFromEnv()) {
      throw new Error(
        "GEMINI_SKIP_RAG is not compatible with resumeId. Paste full resume text or disable skip."
      );
    }
    const ctx = await retrieveIndexedResumeContext(
      ai,
      input.resumeId,
      input.question
    );
    chunks = ctx.chunks;
    usedRag = ctx.usedRag;
    totalChunks = ctx.totalChunks;
    embeddingModel = ctx.embeddingModel;
    segmentsOmitted = ctx.segmentsOmitted;
    vectorStore = ctx.vectorStore;
    if (ctx.usedRag) {
      embeddingVectorCacheHits = ctx.embeddingVectorCacheHits;
      embeddingVectorCacheMisses = ctx.embeddingVectorCacheMisses;
    }
  } else if (skipRagFromEnv()) {
    const trimmed = input.resumeText.trim();
    chunks = trimmed ? [trimmed] : [];
    usedRag = false;
    totalChunks = trimmed ? 1 : 0;
    embeddingModel = undefined;
    segmentsOmitted = 0;
  } else {
    const ctx = await retrieveResumeContext(ai, input.resumeText, input.question);
    chunks = ctx.chunks;
    usedRag = ctx.usedRag;
    totalChunks = ctx.totalChunks;
    embeddingModel = ctx.embeddingModel;
    segmentsOmitted = ctx.segmentsOmitted;
    vectorStore = ctx.vectorStore;
    if (ctx.usedRag) {
      embeddingVectorCacheHits = ctx.embeddingVectorCacheHits;
      embeddingVectorCacheMisses = ctx.embeddingVectorCacheMisses;
    }
  }

  if (usedRag) {
    console.info(
      "[resumeAI] Embeddings RAG: model=%s, segments=%d, top_k_in_prompt=%d",
      embeddingModel ?? "gemini-embedding-001",
      totalChunks,
      chunks.length
    );
  } else if (totalChunks > 0) {
    const chars =
      "resumeText" in input ? input.resumeText.length : "resumeId (indexed)";
    console.info(
      "[resumeAI] Full resume in prompt (no embeddings): segments=%d, chars=%s",
      totalChunks,
      String(chars)
    );
  }

  const contextBlock =
    chunks.length === 0
      ? "(No resume text provided.)"
      : chunks.join("\n\n---\n\n");

  const ragNote = usedRag
    ? "Below are ONLY the resume excerpts retrieved by embedding similarity to the question. " +
      "Other parts of the resume were not provided to you. " +
      "Answer using ONLY this text; if the answer is not in these excerpts, say it is not in the retrieved excerpts " +
      "(do not guess from unstated resume content).\n\n"
    : "The full resume text is below. ";
// if i change this prompt tp generalized convsation then it will convert to regular model behavour like chatgpt
  const prompt =
    "You answer questions using ONLY the resume material below (nothing else). " +
    "If the material does not contain the answer, say clearly that it is not stated there. " +
    "Be concise and factual. Do not invent employers, dates, skills, or credentials.\n\n" +
    ragNote +
    "--- RESUME MATERIAL ---\n" +
    contextBlock +
    "\n--- END ---\n\n" +
    `Question: ${input.question}`;

  const models = resolveChatModelChain();
  let lastErr: unknown;
  let response:
    | Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>
    | undefined;

  for (const model of models) {
    try {
      response = await withGeminiRetry(
        () =>
          ai.models.generateContent({
            model,
            contents: prompt,
          }),
        `generateContent(${model})`
      );
      if (model !== models[0]) {
        console.info("[resumeAI] Answered using fallback chat model: %s", model);
      }
      break;
    } catch (e) {
      lastErr = e;
      if (!shouldTryNextChatModel(e)) throw e;
      console.warn(
        `[resumeAI] Chat model ${model} failed after retries (or invalid); trying next if any.`
      );
    }
  }

  if (response == null) throw lastErr;

  const text = response.text;
  if (!text?.trim()) {
    throw new Error("Gemini returned an empty response.");
  }

  const result: AskResult = {
    answer: text,
    meta: {
      usedEmbeddings: usedRag,
      excerptsInPrompt: chunks.length,
      totalChunks,
      similarChunksSelected: usedRag ? chunks.length : 0,
      segmentsOmitted: usedRag ? segmentsOmitted : 0,
      ...(embeddingModel ? { embeddingModel } : {}),
      ...(embeddingVectorCacheHits !== undefined &&
      embeddingVectorCacheMisses !== undefined
        ? {
            embeddingVectorCacheHits,
            embeddingVectorCacheMisses,
          }
        : {}),
      ...(usedRag && vectorStore ? { vectorStore } : {}),
      ...("resumeId" in input ? { resumeId: input.resumeId } : {}),
    },
  };
  setCachedAnswer(input, result);
  return result;
}
