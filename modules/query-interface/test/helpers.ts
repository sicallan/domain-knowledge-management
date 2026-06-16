import type { Evidence, InventoryEntry, RelationshipEntry } from "@dkm/schema";
import type { QueryContext } from "../src/index";

const EVIDENCE: Evidence[] = [{ source: "spec.md", fetchedAt: "2026-01-01T00:00:00Z", sourceAuthority: "scheme" }];

/** Build a minimal, valid {@link InventoryEntry} for seeding a graph in tests. */
export function makeNode(type: string, id: string, extra: Record<string, unknown> = {}): InventoryEntry {
  return {
    id,
    type,
    version: "1.0.0",
    lifecycle_status: "active",
    validFrom: "2026-01-01T00:00:00Z",
    validTo: null,
    evidencedBy: EVIDENCE,
    confidence: 0.9,
    ...extra,
  };
}

/** Build a directed {@link RelationshipEntry} edge for seeding a graph in tests. */
export function makeEdge(relationshipType: string, sourceId: string, targetId: string, id: string): RelationshipEntry {
  return {
    id,
    type: "Relationship",
    version: "1.0.0",
    relationshipType,
    sourceId,
    targetId,
    evidencedBy: EVIDENCE,
  };
}

/** A throwaway {@link QueryContext} for tests. */
export function ctx(requestId = "req-test"): QueryContext {
  return { userId: "u1", roles: ["reader"], scopes: ["payments.*"], requestId };
}
