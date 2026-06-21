import type { JsonlEntry } from "@dkm/schema";

const SOURCE = {
  file: "payments/cross-layer.md",
  location: "§1",
  fetchedAt: "2026-01-01T00:00:00Z",
  sourceAuthority: "scheme" as const,
};

/** Build an inventory-entry JSONL line for a graph node of any `type`. */
export function nodeEntry(type: string, id: string, data: Record<string, unknown> = {}): JsonlEntry {
  return {
    id,
    type,
    version: "1.0.0",
    source: SOURCE,
    confidence: 0.9,
    extractedAt: "2026-01-02T00:00:00Z",
    data: { name: id, ...data },
  };
}

/** Build a relationship JSONL line (spec 003 §Relationship Entries). */
export function edgeEntry(
  relationshipType: string,
  sourceEntityId: string,
  targetEntityId: string,
  id: string,
): JsonlEntry {
  return {
    id,
    type: "Relationship",
    version: "1.0.0",
    source: SOURCE,
    confidence: 0.85,
    extractedAt: "2026-01-02T00:00:00Z",
    data: { relationshipType, sourceEntityId, targetEntityId },
  };
}
