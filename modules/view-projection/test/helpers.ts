import { InMemoryGraphAdapter } from "@dkm/knowledge-graph";
import type { GraphPort } from "@dkm/knowledge-graph";
import { GraphQueryService } from "@dkm/query";
import type { QueryContext } from "@dkm/query";
import type { Evidence, InventoryEntry, RelationshipEntry } from "@dkm/schema";

const EVIDENCE: Evidence[] = [
  { source: "domain-map-spec.md", location: "§seed", fetchedAt: "2026-01-01T00:00:00Z", sourceAuthority: "scheme" },
];

export function ctx(requestId = "req-view"): QueryContext {
  return { userId: "u1", roles: ["reader"], scopes: ["*"], requestId };
}

/** A structurally valid, evidenced + versioned inventory node of any type. */
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

/** A typed directed edge; `relationshipType` is an open string (belongsTo, settledBy, …). */
export function makeEdge(
  relationshipType: string,
  sourceId: string,
  targetId: string,
  id: string,
): RelationshipEntry {
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

export function buildService(graph: GraphPort): GraphQueryService {
  return new GraphQueryService(graph);
}

/**
 * Seed the canonical Domain Map scenario used across the unit tests (feature 05
 * acceptance 1–4):
 *
 *  - 2 subdomains: `sd-payments` (Payments), `sd-risk` (Risk & Fraud)
 *  - 3 bounded contexts: `bc-auth` + `bc-settle` belongsTo sd-payments, `bc-fraud` belongsTo sd-risk
 *  - concepts/services nested via belongsTo edges
 *  - cross-context edges (between concepts in different contexts) to aggregate
 *
 * Expected counts: bc-auth → 2 concepts, 1 service · bc-settle → 1 concept · bc-fraud → 1 concept.
 * Expected cross-context strengths: bc-auth→bc-settle "settledBy" = 1 · bc-auth→bc-fraud "scoredBy" = 2.
 */
export async function seedStandardGraph(graph: GraphPort): Promise<void> {
  // Subdomains
  await graph.upsertNode(makeNode("Subdomain", "sd-payments", { name: "Payments" }));
  await graph.upsertNode(makeNode("Subdomain", "sd-risk", { name: "Risk & Fraud" }));

  // Bounded contexts (denormalised subdomain set too, for the fallback path)
  await graph.upsertNode(makeNode("BoundedContext", "bc-auth", { name: "Authorisation", subdomain: "sd-payments" }));
  await graph.upsertNode(makeNode("BoundedContext", "bc-settle", { name: "Settlement", subdomain: "sd-payments" }));
  await graph.upsertNode(makeNode("BoundedContext", "bc-fraud", { name: "Fraud Scoring", subdomain: "sd-risk" }));

  // Concepts + a service
  await graph.upsertNode(makeNode("DomainConcept", "c-payment", { name: "Payment" }));
  await graph.upsertNode(makeNode("DomainConcept", "c-card", { name: "Card" }));
  await graph.upsertNode(makeNode("DomainConcept", "c-batch", { name: "Batch" }));
  await graph.upsertNode(makeNode("DomainConcept", "c-score", { name: "Risk Score" }));
  await graph.upsertNode(makeNode("Service", "s-auth-svc", { name: "Authorisation Service" }));

  // belongsTo: context → subdomain
  await graph.createEdge(makeEdge("belongsTo", "bc-auth", "sd-payments", "b-bc-auth"));
  await graph.createEdge(makeEdge("belongsTo", "bc-settle", "sd-payments", "b-bc-settle"));
  await graph.createEdge(makeEdge("belongsTo", "bc-fraud", "sd-risk", "b-bc-fraud"));

  // belongsTo: member → context
  await graph.createEdge(makeEdge("belongsTo", "c-payment", "bc-auth", "b-c-payment"));
  await graph.createEdge(makeEdge("belongsTo", "c-card", "bc-auth", "b-c-card"));
  await graph.createEdge(makeEdge("belongsTo", "s-auth-svc", "bc-auth", "b-s-auth"));
  await graph.createEdge(makeEdge("belongsTo", "c-batch", "bc-settle", "b-c-batch"));
  await graph.createEdge(makeEdge("belongsTo", "c-score", "bc-fraud", "b-c-score"));

  // Cross-context edges (between concepts in different contexts)
  await graph.createEdge(makeEdge("settledBy", "c-payment", "c-batch", "x-settled")); // bc-auth → bc-settle
  await graph.createEdge(makeEdge("scoredBy", "c-payment", "c-score", "x-scored-1")); // bc-auth → bc-fraud
  await graph.createEdge(makeEdge("scoredBy", "c-card", "c-score", "x-scored-2")); // bc-auth → bc-fraud (strength 2)
}

/** A fresh in-memory graph seeded with the standard scenario. */
export async function seededInMemoryGraph(): Promise<InMemoryGraphAdapter> {
  const graph = new InMemoryGraphAdapter();
  await seedStandardGraph(graph);
  return graph;
}
