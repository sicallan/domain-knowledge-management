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

/**
 * Why a relationship edge was routed to the review queue instead of being committed
 * (D-P2.5: quarantine + count, never drop, never commit a dangling edge):
 *  - `dangling-endpoint` — an endpoint node was not (yet) extracted (cross-pass ordering).
 *  - `endpoint-type-mismatch` — both endpoints exist but a type violates the registry.
 *  - `cardinality-violation` — committing would breach a max-cardinality rule (e.g. belongsTo N:1).
 */
export type QuarantineReason = "dangling-endpoint" | "endpoint-type-mismatch" | "cardinality-violation";

/** A relationship edge held for review rather than committed (D-P2.5). */
export interface QuarantinedEdge {
  entryId: string;
  relationshipType: string;
  sourceId: string;
  targetId: string;
  reason: QuarantineReason;
  detail: string;
}

/** A link-time completeness breach on a node (min / conditional cardinality, D-P2.2). */
export interface IntegrityViolation {
  decisionId: string;
  relationshipType: string;
  keyword: "minCardinality" | "conditionalCardinality";
  detail: string;
}

export interface LoadResult {
  runId: string;
  totalEntries: number;
  loaded: number;
  skipped: number;
  failed: number;
  errors: LoadError[];
  duration: number;
  /** Count of edges routed to review instead of committed (D-P2.5). Optional: not every loader quarantines. */
  quarantined?: number;
  /** The quarantined edges, surfaced for the review queue (D-P2.5). */
  quarantine?: QuarantinedEdge[];
}

export type EntryLoadStatus = "loaded" | "skipped" | "failed" | "quarantined";

export interface EntryLoadResult {
  entryId: string;
  status: EntryLoadStatus;
  error?: string;
  retriable?: boolean;
  /** Present when `status === "quarantined"`: why the edge was held for review. */
  quarantine?: Omit<QuarantinedEdge, "entryId">;
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

/**
 * The pair of JSONL files a single extraction run produces (spec 003 §File Naming
 * Convention): `{runId}-extractions.jsonl` and `{runId}-relationships.jsonl`.
 * Feeding `entities` before `relationships` gives entity-first ordering.
 */
export interface RunFiles {
  entities: string;
  relationships?: string;
}

export type RunState = "running" | "completed" | "partial" | "failed";

/** Status of a run across all loaders the orchestrator executed (spec 003). */
export interface RunStatus {
  runId: string;
  state: RunState;
  results: LoadResult[];
  startedAt: string;
  completedAt?: string;
}

/** Result of running every registered loader against one run (spec 003). */
export interface OrchestratorResult {
  runId: string;
  results: LoadResult[];
  /** True when no loader threw and every loader reported zero failures. */
  succeeded: boolean;
}

/**
 * LoaderOrchestrator — runs the registered loaders against a run's JSONL files
 * (spec 003 §Loader Orchestration). New loaders (vector, PostgreSQL, …) join via
 * `registerLoader` with **no change** to the orchestrator or any existing loader
 * (OCP — Feature 07's vector loader is the validation case).
 */
export interface LoaderOrchestrator {
  registerLoader(loader: LoaderPort): void;
  executeRun(files: RunFiles, runId: string): Promise<OrchestratorResult>;
  replayLoader(loaderName: string, files: RunFiles, runId: string): Promise<LoadResult>;
  getRunStatus(runId: string): Promise<RunStatus | null>;
}

/** Helper: adapt an array of entries into the AsyncIterable the port consumes. */
export async function* toAsyncIterable<T>(items: Iterable<T>): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}
