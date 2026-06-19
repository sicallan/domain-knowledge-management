/**
 * Shared, cross-module type definitions. The Schema Module is foundational and
 * has no runtime dependency on other modules, so these canonical types live here
 * and are imported by the graph, loader, and quality modules.
 */

export type LifecycleStatus = "draft" | "active" | "deprecated" | "retired";
export type Layer = "L0" | "L1" | "L2" | "L3";
export type SourceAuthority = "regulatory" | "scheme" | "vendor" | "project" | "operational";

/** A single provenance link tying an assertion to its evidence. */
export interface Evidence {
  source: string;
  location?: string;
  fetchedAt: string;
  sourceAuthority?: SourceAuthority;
}

/**
 * Base shape common to every inventory entry. Open by design (index signature):
 * additional type-specific and future fields are permitted (additive OCP evolution).
 */
export interface InventoryEntry {
  id: string;
  type: string;
  version: string;
  lifecycle_status: LifecycleStatus;
  validFrom: string;
  validTo?: string | null;
  transactionTime?: string;
  evidencedBy: Evidence[];
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  confidence?: number;
  [key: string]: unknown;
}

/** A typed, directed edge between two inventory entries (at rest). */
export interface RelationshipEntry {
  id: string;
  type: "Relationship";
  version: string;
  relationshipType: string;
  sourceId: string;
  targetId: string;
  /** Inventory type of the source endpoint (used by the behavioural / decision-specific edge schemas). */
  sourceType?: string;
  /** Inventory type of the target endpoint (used by the behavioural / decision-specific edge schemas). */
  targetType?: string;
  direction?: "directed" | "bidirectional";
  confidence?: number;
  evidencedBy: Evidence[];
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------------------
// Phase 2.1 — L3 behaviour types. Hand-written to mirror the authored JSON Schemas (there
// is no codegen step; the schema files are the contract). All extend the open InventoryEntry
// base, so common provenance/temporal/lifecycle fields apply uniformly.
// ---------------------------------------------------------------------------------------

/** L3 — a runtime behaviour sequence of orchestration steps. */
export interface OrchestrationFlow extends InventoryEntry {
  type: "OrchestrationFlow";
  name: string;
  trigger?: string;
  steps: string[];
  owningService?: string;
}

/** L3 — a single step within an orchestration flow. */
export interface OrchestrationStep extends InventoryEntry {
  type: "OrchestrationStep";
  sequence: number;
  actionType: string;
  serviceOrComponent?: string;
  input?: string;
  output?: string;
}

/** L3 — a domain or integration event. `eventType` (not `type`) carries the domain/integration axis. */
export interface DomainEvent extends InventoryEntry {
  type: "Event";
  name: string;
  eventType: "domain" | "integration";
  emitter?: string;
  consumers?: string[];
  transport?: string;
}

/** L3 — a change of an entity from one state to another. */
export interface StateTransition extends InventoryEntry {
  type: "StateTransition";
  entity: string;
  fromState: string;
  toState: string;
  trigger?: string;
  guardCondition?: string;
}

/** Provenance object carried by intermediate JSONL entries (spec 003). */
export interface SourceProvenance {
  file: string;
  location: string;
  fetchedAt: string;
  sourceAuthority: SourceAuthority;
}

/** One line of the intermediate JSONL extract-once-load-many format (spec 003). */
export interface JsonlEntry {
  id: string;
  type: string;
  version: string;
  source: SourceProvenance;
  confidence: number;
  extractedAt: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ValidationError {
  path: string;
  message: string;
  schemaPath: string;
  keyword: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export type SchemaLayer = Layer | "relationships" | "common" | "unknown";

export interface TypeMetadata {
  type: string;
  layer: SchemaLayer;
  schemaId: string;
  title?: string;
  version: string;
}

export interface SchemaVersion {
  version: string;
  schemaId: string;
}

export type JsonSchema = Record<string, unknown>;
