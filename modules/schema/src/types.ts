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
  direction?: "directed" | "bidirectional";
  confidence?: number;
  evidencedBy: Evidence[];
  metadata?: Record<string, unknown>;
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
