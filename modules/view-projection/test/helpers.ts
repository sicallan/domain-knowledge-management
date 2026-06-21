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

/** The flow id seeded by {@link seedBehaviourFlowGraph}. */
export const BEHAVIOUR_FLOW_ID = "flow-auth";

/**
 * Seed the canonical Behaviour Flow scenario used by the feature 04 unit tests — a
 * Payments card-authorisation flow (deliberately exercising every projected facet):
 *
 *  - `flow-auth` (Card Authorisation), triggered by event `evt-requested`, owned by `auth-svc`.
 *  - Three steps held as **scrambled ordered ids** in `flow.steps` but with `sequence`
 *    fields defining the true order: `step-validate` (0) → `step-decide` (1) → `step-settle` (2).
 *  - `step-validate` emits `evt-validated` and `transitionsTo` `st-validated`.
 *  - `step-decide` `invokes` Decision `dec-auth` (the decision point).
 *  - `step-settle` emits `evt-approved` and `compensates` `step-validate`.
 *  - `dec-auth` (automated, outcomes approved/declined) `produces` `evt-approved`
 *    (whose name "approved" matches the outcome → producesEventId set for that branch).
 *
 * Expected first-step `consumes` = the trigger event `evt-requested` (best-effort wiring).
 */
export async function seedBehaviourFlowGraph(graph: GraphPort): Promise<void> {
  // Flow + steps (steps listed out of sequence order on purpose).
  await graph.upsertNode(
    makeNode("OrchestrationFlow", "flow-auth", {
      name: "Card Authorisation",
      trigger: "AuthorisationRequested",
      owningService: "auth-svc",
      steps: ["step-decide", "step-settle", "step-validate"],
    }),
  );
  await graph.upsertNode(
    makeNode("OrchestrationStep", "step-validate", { sequence: 0, actionType: "invoke-service", serviceOrComponent: "validation-svc" }),
  );
  await graph.upsertNode(
    makeNode("OrchestrationStep", "step-decide", { sequence: 1, actionType: "evaluate-decision", serviceOrComponent: "auth-svc" }),
  );
  await graph.upsertNode(
    makeNode("OrchestrationStep", "step-settle", { sequence: 2, actionType: "publish-event", serviceOrComponent: "settlement-svc" }),
  );

  // Events.
  await graph.upsertNode(makeNode("Event", "evt-requested", { name: "AuthorisationRequested", eventType: "integration" }));
  await graph.upsertNode(makeNode("Event", "evt-validated", { name: "CardValidated", eventType: "domain" }));
  await graph.upsertNode(makeNode("Event", "evt-approved", { name: "approved", eventType: "domain" }));

  // State transition + decision.
  await graph.upsertNode(
    makeNode("StateTransition", "st-validated", { entity: "Authorisation", fromState: "pending", toState: "validated", guardCondition: "card present" }),
  );
  await graph.upsertNode(
    makeNode("Decision", "dec-auth", { name: "Authorise Payment", decisionType: "automated", outcomes: ["approved", "declined"] }),
  );

  // Behavioural + decision edges.
  await graph.createEdge(makeEdge("triggers", "evt-requested", "flow-auth", "r-trigger"));
  await graph.createEdge(makeEdge("emits", "step-validate", "evt-validated", "r-emit-validated"));
  await graph.createEdge(makeEdge("transitionsTo", "step-validate", "st-validated", "r-trans"));
  await graph.createEdge(makeEdge("invokes", "step-decide", "dec-auth", "r-invokes"));
  await graph.createEdge(makeEdge("emits", "step-settle", "evt-approved", "r-emit-approved"));
  await graph.createEdge(makeEdge("compensates", "step-settle", "step-validate", "r-compensates"));
  await graph.createEdge(makeEdge("produces", "dec-auth", "evt-approved", "r-produces"));
}

/** A fresh in-memory graph seeded with the canonical Behaviour Flow scenario. */
export async function seededBehaviourFlowGraph(): Promise<InMemoryGraphAdapter> {
  const graph = new InMemoryGraphAdapter();
  await seedBehaviourFlowGraph(graph);
  return graph;
}
