import type { JsonlEntry } from "@dkm/schema";
import type {
  EntryLoadResult,
  HealthStatus,
  LoaderConfig,
  LoaderPort,
  LoadError,
  LoadResult,
} from "./port";

interface StoredRecord {
  runId: string;
  entry: JsonlEntry;
}

/**
 * InMemoryLoaderStub — a reference {@link LoaderPort} for contract testing and the
 * extraction→loader integration boundary. It maps each JSONL entry into an
 * in-memory "store" keyed by id, tracks idempotency by (entryId, runId), and
 * supports rollback. It deliberately implements no real persistence — concrete
 * graph/vector loaders are Phase 1 features.
 */
export class InMemoryLoaderStub implements LoaderPort {
  readonly name = "in-memory-stub";
  readonly targetStore = "in-memory";
  readonly requiredFields: string[];

  private initialized = false;
  private readonly store = new Map<string, StoredRecord>();
  private readonly processed = new Set<string>();

  constructor(requiredFields: string[] = ["data"]) {
    this.requiredFields = requiredFields;
  }

  async initialize(_config: LoaderConfig): Promise<void> {
    this.initialized = true;
  }

  async healthCheck(): Promise<HealthStatus> {
    return this.initialized
      ? { healthy: true }
      : { healthy: false, detail: "loader not initialized" };
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
      if (result.status === "loaded") loaded += 1;
      else if (result.status === "skipped") skipped += 1;
      else {
        failed += 1;
        errors.push({ entryId: result.entryId, error: result.error ?? "unknown", retriable: result.retriable ?? false });
      }
    }

    return { runId, totalEntries: total, loaded, skipped, failed, errors, duration: Date.now() - start };
  }

  async loadSingle(entry: JsonlEntry, runId: string): Promise<EntryLoadResult> {
    const key = this.key(entry.id, runId);

    if (this.processed.has(key)) {
      return { entryId: entry.id, status: "skipped" };
    }

    const missing = this.missingRequiredFields(entry);
    if (missing.length > 0) {
      // Schema/shape violations are non-retriable (skip-and-continue, per spec 003 D3).
      return {
        entryId: entry.id,
        status: "failed",
        error: `missing required field(s): ${missing.join(", ")}`,
        retriable: false,
      };
    }

    this.store.set(entry.id, { runId, entry });
    this.processed.add(key);
    return { entryId: entry.id, status: "loaded" };
  }

  async hasProcessed(entryId: string, runId: string): Promise<boolean> {
    return this.processed.has(this.key(entryId, runId));
  }

  async rollbackRun(runId: string): Promise<void> {
    for (const [id, record] of [...this.store.entries()]) {
      if (record.runId === runId) {
        this.store.delete(id);
        this.processed.delete(this.key(id, runId));
      }
    }
  }

  // ---- Stub-only inspection helpers (not part of the port) -------------------

  /** Entries currently in the in-memory store. */
  getLoaded(): JsonlEntry[] {
    return [...this.store.values()].map((r) => r.entry);
  }

  getEntry(id: string): JsonlEntry | undefined {
    return this.store.get(id)?.entry;
  }

  size(): number {
    return this.store.size;
  }

  private missingRequiredFields(entry: JsonlEntry): string[] {
    const record = entry as unknown as Record<string, unknown>;
    return this.requiredFields.filter((f) => record[f] === undefined || record[f] === null);
  }

  private key(entryId: string, runId: string): string {
    return `${runId}::${entryId}`;
  }
}
