import { createHash } from "node:crypto";
import { Pinecone } from "@pinecone-database/pinecone";

const MAX_SYNCED_NAMESPACES = 1000;

let client: Pinecone | null = null;

function pineconeOff(): boolean {
  const v = process.env.PINECONE_VECTOR_STORE?.trim().toLowerCase();
  return v === "0" || v === "false" || v === "off";
}

export function isPineconeVectorStoreConfigured(): boolean {
  if (pineconeOff()) return false;
  const key = process.env.PINECONE_API_KEY?.trim();
  const idx =
    process.env.PINECONE_INDEX?.trim() || process.env.PINECONE_INDEX_NAME?.trim();
  return Boolean(key && idx);
}

/** When true, RAG must use Pinecone (no in-process cosine fallback). */
export function isPineconeOnlyMode(): boolean {
  const v = process.env.PINECONE_ONLY?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function getIndexName(): string {
  return (
    process.env.PINECONE_INDEX?.trim() ||
    process.env.PINECONE_INDEX_NAME?.trim() ||
    ""
  );
}

function getClient(): Pinecone {
  if (!client) {
    const apiKey = process.env.PINECONE_API_KEY?.trim();
    if (!apiKey) throw new Error("PINECONE_API_KEY is not set.");
    client = new Pinecone({ apiKey });
  }
  return client;
}

/** Namespace per resume (isolated chunks; safe for multi-tenant). */
export function resumeTextNamespace(resumeText: string): string {
  return createHash("sha256").update(resumeText, "utf8").digest("hex").slice(0, 64);
}

const syncedFingerprints = new Map<string, string>();

function rememberSynced(ns: string, fingerprint: string): void {
  syncedFingerprints.delete(ns);
  syncedFingerprints.set(ns, fingerprint);
  while (syncedFingerprints.size > MAX_SYNCED_NAMESPACES) {
    const oldest = syncedFingerprints.keys().next().value as string;
    syncedFingerprints.delete(oldest);
  }
}

const METADATA_TEXT_MAX = 35000;

/**
 * Upserts segment vectors for this resume into the namespace. Skips network call when the
 * fingerprint matches the last upsert seen for this namespace in this process.
 */
export async function ensureResumeVectorsInPinecone(
  namespace: string,
  segments: string[],
  vectors: number[][],
  options?: { force?: boolean }
): Promise<void> {
  if (segments.length !== vectors.length) {
    throw new Error("Pinecone upsert: segments and vectors length mismatch.");
  }
  const fingerprint = createHash("sha256").update(segments.join("\0"), "utf8").digest("hex");
  if (!options?.force && syncedFingerprints.get(namespace) === fingerprint) return;
  if (options?.force) syncedFingerprints.delete(namespace);

  const indexName = getIndexName();
  const ns = getClient().index(indexName).namespace(namespace);

  const batchSize = 100;
  for (let i = 0; i < segments.length; i += batchSize) {
    const slice = segments.slice(i, i + batchSize);
    const vecSlice = vectors.slice(i, i + batchSize);
    const records = slice.map((text, j) => {
      const idx = i + j;
      const metaText =
        text.length > METADATA_TEXT_MAX ? text.slice(0, METADATA_TEXT_MAX) : text;
      return {
        id: String(idx),
        values: vecSlice[j]!,
        metadata: { text: metaText, chunk_index: idx },
      };
    });
    await ns.upsert({ records });
  }

  rememberSynced(namespace, fingerprint);
}

export type PineconeHit = {
  chunk_index: number;
  text: string;
  score: number;
};

export async function queryResumeVectorsFromPinecone(
  namespace: string,
  queryVector: number[],
  topK: number
): Promise<PineconeHit[]> {
  const indexName = getIndexName();
  const res = await getClient()
    .index(indexName)
    .namespace(namespace)
    .query({
      vector: queryVector,
      topK,
      includeMetadata: true,
    });

  const out: PineconeHit[] = [];
  for (const m of res.matches ?? []) {
    const rawText = m.metadata?.text;
    if (typeof rawText !== "string" || !rawText) continue;
    const ci = m.metadata?.chunk_index;
    const chunk_index = typeof ci === "number" ? ci : Number(ci);
    if (!Number.isFinite(chunk_index)) continue;
    out.push({
      chunk_index,
      text: rawText,
      score: m.score ?? 0,
    });
  }
  return out;
}
