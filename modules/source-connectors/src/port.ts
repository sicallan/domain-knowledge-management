import type { CanonicalDocument } from "./canonical-document";
import type { SourceAuthority } from "@dkm/schema";

/** Field of a document a filter targets. */
export type FilterField = "path" | "name" | "extension" | "tag";

export interface SourceFilter {
  type: "include" | "exclude";
  /** Glob pattern, e.g. `*.md` for names or a double-star path glob for directories. */
  pattern: string;
  field: FilterField;
}

/** Discovery uses the same filter shape as configuration. */
export type DiscoveryFilter = SourceFilter;

export interface SourceConfig {
  /** Unique source instance id. */
  id: string;
  /** Connector type (must match the connector's `type`). */
  type: string;
  /** Type-specific connection config (e.g. `{ rootPath }` for filesystem). */
  connectionDetails: Record<string, unknown>;
  credentialRef?: string;
  filters: SourceFilter[];
  sourceAuthority: SourceAuthority;
}

export interface HealthStatus {
  healthy: boolean;
  detail?: string;
}

/** A lightweight pointer to an available document — no content fetched. */
export interface DocumentReference {
  sourcePath: string;
  /** Best-known version (content hash / mtime); may be absent before fetch. */
  sourceVersion?: string;
  lastModified?: string;
  sizeBytes?: number;
}

/** Per-source incremental state persisted between runs (spec 004). */
export interface IngestionState {
  sourceId: string;
  lastRunId: string;
  lastRunAt: string;
  /** Connector-specific cursor: filesystem stores `{ path: contentHash }`. */
  checkpoint: Record<string, unknown>;
  documentsProcessed: number;
  lastDocumentId: string;
}

export interface IngestionError {
  documentPath: string;
  error: string;
  retriable: boolean;
}

export interface IngestionStats {
  total: number;
  fetched: number;
  /** Unchanged since last run. */
  skipped: number;
  failed: number;
  duration: number;
}

export interface IngestionResult {
  runId: string;
  documents: CanonicalDocument[];
  /** Updated checkpoint for the next incremental run. */
  state: IngestionState;
  errors: IngestionError[];
  stats: IngestionStats;
}

export interface ConnectorMetadata {
  type: string;
  supportedFormats: string[];
}

/**
 * SourceConnector port (spec 004 §SourceConnector Port). Each connector adapts a
 * specific source system into `CanonicalDocument[]`. The team develops and tests
 * against this abstract contract; concrete connectors (filesystem, json, …) plug
 * in via the {@link ConnectorRegistry} without the pipeline knowing their type.
 */
export interface SourceConnector {
  // Metadata
  readonly type: string;
  readonly supportedFormats: string[];

  // Lifecycle
  initialize(config: SourceConfig): Promise<void>;
  healthCheck(): Promise<HealthStatus>;

  // Ingestion (full or incremental when `state` is supplied)
  ingest(state?: IngestionState): Promise<IngestionResult>;

  // Discovery — list available documents without fetching content
  discover(filters?: DiscoveryFilter[]): Promise<DocumentReference[]>;
}

/**
 * ConnectorRegistry (spec 004 §Connector Registry, Decision 4: explicit
 * registration). New connector types are added via {@link ConnectorRegistry.register}
 * — never by modifying the registry internals — which is the OCP extension point.
 */
export interface ConnectorRegistry {
  register(connector: SourceConnector): void;
  getConnector(type: string): SourceConnector;
  listConnectors(): ConnectorMetadata[];
  hasConnector(type: string): boolean;
}

/** A factory the contract test suite uses to obtain a fresh connector instance. */
export type SourceConnectorFactory = () => SourceConnector | Promise<SourceConnector>;
