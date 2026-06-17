/** One indexed vector: the embedding plus a retrievable payload, keyed by `entryId`. */
export interface VectorRecord {
  entryId: string;
  /** The run that produced this record — backs run-scoped rollback. */
  runId: string;
  embedding: number[];
  /** Filtered, retrievable fields (type, name, provenance) — never the raw embedding. */
  payload: Record<string, unknown>;
}

/**
 * InMemoryVectorIndex — the stub store sitting behind the vector loader's
 * `targetStore: "in-memory-vector"`. It models the minimum a real vector DB
 * (pgvector / Qdrant / …) must offer the loader: **upsert** by id, point lookup,
 * and **run-scoped delete** for rollback. The product choice stays **deferred** behind
 * this shape — see the Vector DB ADR. The query/search path is Phase 3+ (write-only here).
 */
export class InMemoryVectorIndex {
  private readonly records = new Map<string, VectorRecord>();

  /** Insert or replace the record for `record.entryId` (upsert). */
  upsert(record: VectorRecord): void {
    this.records.set(record.entryId, record);
  }

  get(entryId: string): VectorRecord | undefined {
    return this.records.get(entryId);
  }

  has(entryId: string): boolean {
    return this.records.has(entryId);
  }

  /** Remove every record produced by `runId` (rollback). */
  removeRun(runId: string): void {
    for (const [entryId, record] of [...this.records.entries()]) {
      if (record.runId === runId) {
        this.records.delete(entryId);
      }
    }
  }

  all(): VectorRecord[] {
    return [...this.records.values()];
  }

  size(): number {
    return this.records.size;
  }
}
