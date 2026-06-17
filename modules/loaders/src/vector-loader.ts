import type { JsonlEntry } from "@dkm/schema";
import { FakeEmbedder } from "./embedder";
import type { Embedder } from "./embedder";
import { isRelationship } from "./mapping";
import type {
  EntryLoadResult,
  HealthStatus,
  LoaderConfig,
  LoaderPort,
  LoadError,
  LoadResult,
} from "./port";
import { InMemoryVectorIndex } from "./vector-index";

// Re-export the vector feature's surface so `@dkm/loaders`' barrel needs a single
// additive line (`export * from "./vector-loader"`) — the only edit to a shared file.
export { EMBEDDING_DIMENSION, FakeEmbedder } from "./embedder";
export type { Embedder } from "./embedder";
export { InMemoryVectorIndex } from "./vector-index";
export type { VectorRecord } from "./vector-index";

export interface VectorLoaderOptions {
  /** Text→vector seam; defaults to the deterministic {@link FakeEmbedder} (no network/key). */
  embedder?: Embedder;
  /** The store to populate; defaults to a fresh {@link InMemoryVectorIndex}. */
  index?: InMemoryVectorIndex;
  /** JSONL fields required before an entry is indexable (default `["data"]`). */
  requiredFields?: string[];
}

/**
 * VectorLoader — the **second** concrete {@link LoaderPort} (Feature 07), proving the
 * loader OCP boundary: it consumes the **same** intermediate JSONL the graph loader does
 * ("extract once, load many") with **zero edits** to extraction, the graph loader, the
 * port, or the orchestrator. It joins a run purely via `orchestrator.registerLoader(...)`.
 *
 * Behaviour:
 *  - **Embeds entities**: derives text from each entry's `data` (name/description, else the
 *    JSON of `data`) via the {@link Embedder} seam and **upserts** `{entryId, embedding,
 *    payload}` into the {@link InMemoryVectorIndex}.
 *  - **Ignores relationships** (`orderedProcessing: false`): a `type: "Relationship"` entry
 *    is skipped without error (spec 003 D2 — vector loaders ignore the relationship file).
 *  - **Idempotent**: `hasProcessed(id, runId)` skips already-indexed entries on replay, so a
 *    re-run reports `skipped == total`, `loaded == 0`, and never re-embeds.
 *  - **requiredFields validation**: an entry missing `data` is a *non-retriable* failure in
 *    `LoadResult.errors[]`, surfaced by the orchestrator — never a crash.
 *  - **Rollback**: `rollbackRun(runId)` removes that run's vectors from the index.
 *
 * A real vector DB (pgvector / Qdrant / …) slots in behind `targetStore` later without
 * touching this loader's callers — the choice is deferred to the Vector DB ADR.
 */
export class VectorLoader implements LoaderPort {
  readonly name = "vector-loader";
  readonly targetStore = "in-memory-vector";
  /** Order-independent: entities and relationships need no sequencing here (spec 003 §Ordering). */
  readonly orderedProcessing = false;
  readonly requiredFields: string[];

  private readonly embedder: Embedder;
  private readonly index: InMemoryVectorIndex;
  private initialized = false;
  /** runId → entryIds processed in that run — backs `hasProcessed` and rollback. */
  private readonly runs = new Map<string, Set<string>>();

  constructor(options: VectorLoaderOptions = {}) {
    this.embedder = options.embedder ?? new FakeEmbedder();
    this.index = options.index ?? new InMemoryVectorIndex();
    this.requiredFields = options.requiredFields ?? ["data"];
  }

  async initialize(_config: LoaderConfig): Promise<void> {
    this.initialized = true;
  }

  async healthCheck(): Promise<HealthStatus> {
    return this.initialized ? { healthy: true } : { healthy: false, detail: "loader not initialized" };
  }

  async load(entries: AsyncIterable<JsonlEntry>, runId: string): Promise<LoadResult> {
    const start = Date.now();
    let total = 0;
    let loaded = 0;
    let skipped = 0;
    let failed = 0;
    const errors: LoadError[] = [];

    for await (const entry of entries) {
      total += 1;
      const result = await this.loadSingle(entry, runId);
      if (result.status === "loaded") {
        loaded += 1;
      } else if (result.status === "skipped") {
        skipped += 1;
      } else {
        failed += 1;
        errors.push({
          entryId: result.entryId,
          error: result.error ?? "unknown",
          retriable: result.retriable ?? false,
        });
      }
    }

    // Totals reconcile by construction: loaded + skipped + failed === totalEntries.
    return { runId, totalEntries: total, loaded, skipped, failed, errors, duration: Date.now() - start };
  }

  async loadSingle(entry: JsonlEntry, runId: string): Promise<EntryLoadResult> {
    const entryId = entry?.id ?? "(unknown)";

    if (entry?.id && (await this.hasProcessed(entry.id, runId))) {
      return { entryId, status: "skipped" };
    }

    // Vector loaders ignore relationship entries (spec 003 D2). Mark them processed so
    // idempotency and totals hold, but never embed or index them.
    if (isRelationship(entry)) {
      this.record(runId, entryId);
      return { entryId, status: "skipped" };
    }

    const missing = this.missingRequiredFields(entry);
    if (missing.length > 0) {
      // Schema/shape violations are non-retriable (skip-and-continue, spec 003 D3).
      return {
        entryId,
        status: "failed",
        error: `missing required field(s): ${missing.join(", ")}`,
        retriable: false,
      };
    }

    const text = embedText(entry);
    const [embedding] = await this.embedder.embed([text]);
    this.index.upsert({
      entryId: entry.id,
      runId,
      embedding: embedding ?? [],
      payload: payloadFor(entry, text),
    });
    this.record(runId, entry.id);
    return { entryId: entry.id, status: "loaded" };
  }

  async hasProcessed(entryId: string, runId: string): Promise<boolean> {
    return this.runs.get(runId)?.has(entryId) ?? false;
  }

  async rollbackRun(runId: string): Promise<void> {
    this.index.removeRun(runId);
    this.runs.delete(runId);
  }

  private record(runId: string, entryId: string): void {
    let set = this.runs.get(runId);
    if (!set) {
      set = new Set<string>();
      this.runs.set(runId, set);
    }
    set.add(entryId);
  }

  private missingRequiredFields(entry: JsonlEntry): string[] {
    const record = entry as unknown as Record<string, unknown>;
    return this.requiredFields.filter((field) => record?.[field] === undefined || record[field] === null);
  }
}

/** Derive the text to embed from an entry's `data`: name/description, else its JSON. */
function embedText(entry: JsonlEntry): string {
  const data = (entry.data ?? {}) as Record<string, unknown>;
  const parts = [data.name, data.description].filter((v): v is string => typeof v === "string" && v.length > 0);
  const text = parts.join(" ").trim();
  return text.length > 0 ? text : JSON.stringify(data);
}

/** A filtered, retrievable payload — never the raw embedding (spec: payload filtering). */
function payloadFor(entry: JsonlEntry, text: string): Record<string, unknown> {
  const data = (entry.data ?? {}) as Record<string, unknown>;
  return {
    type: entry.type,
    name: typeof data.name === "string" ? data.name : undefined,
    text,
    source: entry.source,
  };
}
