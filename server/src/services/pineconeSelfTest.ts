import { Pinecone } from "@pinecone-database/pinecone";
import { embeddingOutputDimensionality } from "../utils/embeddingEnv.js";

const TEST_NS = "__resumeai_selftest__";
const TEST_ID = "__resumeai_probe__";

export type PineconeSelfTestResult =
  | {
      ok: true;
      index: string;
      dimension: number;
      namespace: string;
      upsertedId: string;
      /** Best query hit (should match upserted id). */
      topMatch: { id: string; score?: number; metadata?: Record<string, unknown> };
      /** All matches returned (topK=3) for inspection. */
      matches: Array<{
        id: string;
        score?: number;
        metadata?: Record<string, unknown>;
      }>;
      note: string;
    }
  | {
      ok: false;
      error: string;
      step?: "config" | "describeIndex" | "upsert" | "query" | "cleanup";
    };

function indexNameFromEnv(): string | undefined {
  return (
    process.env.PINECONE_INDEX?.trim() ||
    process.env.PINECONE_INDEX_NAME?.trim() ||
    undefined
  );
}

/**
 * Upsert a fixed test vector, query it, delete it. Use GET /api/pinecone-test to verify
 * API key, index name, and dimension match.
 */
export async function runPineconeSelfTest(): Promise<PineconeSelfTestResult> {
  const apiKey = process.env.PINECONE_API_KEY?.trim();
  const indexName = indexNameFromEnv();
  if (!apiKey || !indexName) {
    return {
      ok: false,
      error:
        "Set PINECONE_API_KEY and PINECONE_INDEX (or PINECONE_INDEX_NAME) in server/.env.",
      step: "config",
    };
  }

  const pc = new Pinecone({ apiKey });
  let dimension: number;
  try {
    const model = await pc.describeIndex(indexName);
    let dim = model.dimension;
    if (dim == null || dim < 1 || !Number.isFinite(dim)) {
      const fromEnv = embeddingOutputDimensionality();
      if (fromEnv !== undefined) dim = fromEnv;
    }
    if (dim == null || dim < 1 || !Number.isFinite(dim)) {
      return {
        ok: false,
        error:
          "No vector dimension from describeIndex. Set PINECONE_VECTOR_DIMENSION or use a dense index.",
        step: "describeIndex",
      };
    }
    dimension = dim;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `describeIndex failed: ${msg}`,
      step: "describeIndex",
    };
  }

  const vector = new Array<number>(dimension).fill(0);
  vector[0] = 1;

  const index = pc.index(indexName);

  try {
    await index.namespace(TEST_NS).upsert({
      records: [
        {
          id: TEST_ID,
          values: vector,
          metadata: { source: "resumeai-selftest", t: Date.now() },
        },
      ],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `upsert failed (wrong dimension?): ${msg}`,
      step: "upsert",
    };
  }

  let matches: Array<{
    id: string;
    score?: number;
    metadata?: Record<string, unknown>;
  }> = [];

  try {
    const qr = await index.namespace(TEST_NS).query({
      vector,
      topK: 3,
      includeMetadata: true,
    });
    matches =
      qr.matches?.map((m) => ({
        id: m.id ?? "",
        score: m.score,
        metadata: m.metadata as Record<string, unknown> | undefined,
      })) ?? [];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `query failed: ${msg}`,
      step: "query",
    };
  } finally {
    try {
      await index.deleteOne({ id: TEST_ID, namespace: TEST_NS });
    } catch (e) {
      console.warn("[resumeAI] pinecone self-test cleanup failed:", e);
    }
  }

  const top = matches[0];
  if (!top?.id) {
    return {
      ok: false,
      error: "query returned no matches after upsert",
      step: "query",
    };
  }

  const expectedId = top.id === TEST_ID;
  if (!expectedId) {
    return {
      ok: false,
      error: `top match id was "${top.id}", expected "${TEST_ID}"`,
      step: "query",
    };
  }

  return {
    ok: true,
    index: indexName,
    dimension,
    namespace: TEST_NS,
    upsertedId: TEST_ID,
    topMatch: {
      id: top.id,
      score: top.score,
      metadata: top.metadata,
    },
    matches,
    note:
      "Probe vector upserted, queried, then deleted from namespace __resumeai_selftest__.",
  };
}
