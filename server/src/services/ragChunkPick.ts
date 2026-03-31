export type IndexedRagMatch = {
  chunk_index: number;
  text: string;
  score: number;
};

/** Merge by chunk_index keeping the higher score. */
function dedupeByIndex(matches: IndexedRagMatch[]): IndexedRagMatch[] {
  const by = new Map<number, IndexedRagMatch>();
  for (const m of matches) {
    const ex = by.get(m.chunk_index);
    if (!ex || m.score > ex.score) by.set(m.chunk_index, m);
  }
  return [...by.values()];
}

/**
 * Pin the first segment when truncating long resumes, then trim to k by dropping
 * lowest-scoring non-head chunks (same policy as in-process cosine RAG).
 */
export function finalizeRagChunks(
  segments: string[],
  picked: IndexedRagMatch[],
  k: number,
  topK: number
): string[] {
  let arr = dedupeByIndex(picked);

  if (segments.length > topK && !arr.some((p) => p.chunk_index === 0)) {
    arr.push({
      chunk_index: 0,
      text: segments[0]!,
      score: Number.NEGATIVE_INFINITY,
    });
  }

  while (arr.length > k) {
    let worstI = -1;
    let worstScore = Infinity;
    for (const p of arr) {
      if (p.chunk_index === 0) continue;
      if (p.score < worstScore) {
        worstScore = p.score;
        worstI = p.chunk_index;
      }
    }
    if (worstI < 0) break;
    arr = arr.filter((p) => p.chunk_index !== worstI);
  }

  arr.sort((a, b) => a.chunk_index - b.chunk_index);
  return arr.map((p) => p.text);
}

export function computeRagTopK(
  segmentCount: number,
  topK: number,
  allowFullCoverage: boolean
): number {
  let k = Math.min(topK, segmentCount);
  if (!allowFullCoverage && segmentCount > topK) {
    k = Math.min(k, Math.max(1, segmentCount - 1));
  }
  return Math.max(1, k);
}
