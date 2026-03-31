/**
 env vars shared by embedding + Pinecone index dimension.
 */
export function embeddingOutputDimensionality(): number | undefined {
  const v =
    process.env.GEMINI_EMBEDDING_OUTPUT_DIM?.trim() ||
    process.env.PINECONE_VECTOR_DIMENSION?.trim();
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

/** Pass into Gemini embedContent when set (must match Pinecone index dimension). */
export function geminiEmbedContentConfig():
  | { outputDimensionality: number }
  | undefined {
  const d = embeddingOutputDimensionality();
  return d !== undefined ? { outputDimensionality: d } : undefined;
}
