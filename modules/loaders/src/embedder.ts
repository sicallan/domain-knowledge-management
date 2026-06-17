/**
 * Fixed embedding dimensionality the in-memory stub uses. Deliberately small — this is
 * plumbing, not retrieval quality. A real embedder (Phase 3+) will declare its own
 * `dimension`; the Vector DB ADR captures dimensionality as a port requirement.
 */
export const EMBEDDING_DIMENSION = 16;

/**
 * Embedder — the seam between the vector loader and however text becomes a vector.
 *
 * This repo has **no in-process TypeScript LLM gateway**: Feature 02's gateway is Python,
 * across the process boundary. So a real embedder is **deferred** (Phase 3+, cross-process)
 * and slots in behind this interface later. The default everywhere — CI, tests, the demo —
 * is the deterministic {@link FakeEmbedder}: no network, no API key, no external service.
 */
export interface Embedder {
  /** The length of every vector this embedder produces. */
  readonly dimension: number;
  /** Embed a batch of texts, returning one vector per input (positional). */
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * FakeEmbedder — a deterministic, dependency-free embedder. Identical text always yields
 * an identical vector of `dimension` floats; different text (almost always) yields a
 * different vector. It is **not** semantically meaningful — it exists to prove the loader
 * plumbing (embed → upsert → idempotency → rollback) deterministically in CI.
 *
 * Each component is an independent FNV-1a hash of `"{dimension-index}:{text}"`, mapped to
 * `[-1, 1)`, so every dimension is populated regardless of text length.
 */
export class FakeEmbedder implements Embedder {
  readonly dimension: number;

  constructor(dimension: number = EMBEDDING_DIMENSION) {
    this.dimension = dimension;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.vector(text));
  }

  private vector(text: string): number[] {
    const out = new Array<number>(this.dimension);
    for (let d = 0; d < this.dimension; d += 1) {
      out[d] = hashToUnit(`${d}:${text}`);
    }
    return out;
  }
}

/** FNV-1a (32-bit) of `s`, mapped deterministically into `[-1, 1)`. */
function hashToUnit(s: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const unsigned = hash >>> 0;
  return (unsigned / 0xffffffff) * 2 - 1;
}
