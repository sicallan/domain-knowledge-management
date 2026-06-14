import type { JsonlEntry } from "@dkm/schema";

export interface LoaderConfig {
  /** Optional connection / target details (adapter-specific). */
  [key: string]: unknown;
}

export interface HealthStatus {
  healthy: boolean;
  detail?: string;
}

export interface LoadError {
  entryId: string;
  error: string;
  retriable: boolean;
}

export interface LoadResult {
  runId: string;
  totalEntries: number;
  loaded: number;
  skipped: number;
  failed: number;
  errors: LoadError[];
  duration: number;
}

export type EntryLoadStatus = "loaded" | "skipped" | "failed";

export interface EntryLoadResult {
  entryId: string;
  status: EntryLoadStatus;
  error?: string;
  retriable?: boolean;
}

/**
 * LoaderPort — the abstract contract every loader implements (spec 003). A loader
 * reads the canonical intermediate JSONL stream and writes to one target store.
 * "Extract once, load many": extraction never writes to a store directly.
 *
 * Note: `load` takes the run identifier explicitly (the orchestrator owns runIds);
 * idempotency and rollback are keyed by (entryId, runId).
 */
export interface LoaderPort {
  readonly name: string;
  readonly targetStore: string;
  /** JSONL fields this loader requires (beyond being well-formed). */
  readonly requiredFields: string[];

  initialize(config: LoaderConfig): Promise<void>;
  healthCheck(): Promise<HealthStatus>;

  load(entries: AsyncIterable<JsonlEntry>, runId: string): Promise<LoadResult>;
  loadSingle(entry: JsonlEntry, runId: string): Promise<EntryLoadResult>;

  hasProcessed(entryId: string, runId: string): Promise<boolean>;
  rollbackRun(runId: string): Promise<void>;
}

export type LoaderPortFactory = () => LoaderPort | Promise<LoaderPort>;

/** Helper: adapt an array of entries into the AsyncIterable the port consumes. */
export async function* toAsyncIterable<T>(items: Iterable<T>): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}
