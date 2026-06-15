import type {
  Evidence,
  InventoryEntry,
  JsonlEntry,
  LifecycleStatus,
  RelationshipEntry,
  SourceProvenance,
} from "@dkm/schema";

/** The fixed `type` value identifying a relationship line (spec 003). */
export const RELATIONSHIP_TYPE = "Relationship";

/**
 * A non-retriable mapping failure: the entry is structurally unfit to become a
 * node/edge (e.g. a relationship missing its endpoints). The loader reports these
 * in `LoadResult.errors[]` with `retriable: false` — re-running cannot fix the data.
 */
export class MappingError extends Error {
  readonly retriable = false;
  constructor(message: string) {
    super(message);
    this.name = "MappingError";
  }
}

export function isRelationship(entry: JsonlEntry): boolean {
  return entry.type === RELATIONSHIP_TYPE;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Derive a provenance link from a JSONL entry's `source` (spec 003 §SourceProvenance). */
function evidenceFromSource(source: SourceProvenance | undefined): Evidence[] {
  if (!source) return [];
  return [
    {
      source: source.file,
      location: source.location,
      fetchedAt: source.fetchedAt,
      sourceAuthority: source.sourceAuthority,
    },
  ];
}

/**
 * Map an inventory JSONL entry to a graph node ({@link InventoryEntry}). The entry's
 * fixed-core fields are authoritative; type-specific fields ride in `data`. Bi-temporal
 * and lifecycle fields fall back to sensible defaults when the payload omits them, so
 * the mapping is data-driven and works for any inventory `type` without per-type code
 * (OCP — new inventory types need no loader change).
 */
export function entryToNode(entry: JsonlEntry): InventoryEntry {
  const data = (entry.data ?? {}) as Record<string, unknown>;
  return {
    ...data,
    id: entry.id,
    type: entry.type,
    version: entry.version,
    lifecycle_status: (data.lifecycle_status as LifecycleStatus | undefined) ?? "active",
    validFrom: (data.validFrom as string | undefined) ?? entry.extractedAt,
    validTo: (data.validTo as string | null | undefined) ?? null,
    evidencedBy: (data.evidencedBy as Evidence[] | undefined) ?? evidenceFromSource(entry.source),
    confidence: entry.confidence,
  };
}

/**
 * Map a relationship JSONL entry to a typed graph edge ({@link RelationshipEntry}).
 * The intermediate relationship payload carries `relationshipType` / `sourceEntityId`
 * / `targetEntityId` (spec 003 §Relationship Entries); a payload missing any of these
 * is unmappable and raises {@link MappingError} (non-retriable).
 */
export function entryToEdge(entry: JsonlEntry): RelationshipEntry {
  const data = (entry.data ?? {}) as Record<string, unknown>;
  const relationshipType = data.relationshipType;
  const sourceId = data.sourceEntityId;
  const targetId = data.targetEntityId;

  if (!isNonEmptyString(relationshipType) || !isNonEmptyString(sourceId) || !isNonEmptyString(targetId)) {
    throw new MappingError(
      `relationship entry ${entry.id} is missing relationshipType/sourceEntityId/targetEntityId`,
    );
  }

  const edge: RelationshipEntry = {
    id: entry.id,
    type: "Relationship",
    version: entry.version,
    relationshipType,
    sourceId,
    targetId,
    confidence: entry.confidence,
    evidencedBy: evidenceFromSource(entry.source),
  };
  const metadata = data.metadata;
  if (metadata && typeof metadata === "object") {
    edge.metadata = metadata as Record<string, unknown>;
  }
  return edge;
}
