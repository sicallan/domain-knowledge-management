import { InMemoryGraphAdapter } from "@dkm/knowledge-graph";
import type { GraphPort } from "@dkm/knowledge-graph";
import { GraphQueryService } from "@dkm/query";
import type { QueryContext } from "@dkm/query";
import type { Evidence, InventoryEntry, RelationshipEntry } from "@dkm/schema";
import {
  DefaultViewEngine,
  GapAnalysisProjector,
  renderGapAnalysisMarkdown,
  renderVendorCoverageMarkdown,
  VendorCoverageProjector,
} from "@dkm/view-projection";
import type { GapAnalysisView, VendorCoverageView } from "@dkm/view-projection";

/**
 * Phase 3 — Vendor Coverage Map + Gap Analysis demo (the L2 "build-vs-buy" picture). The
 * **same** view machinery as Phases 1–2: a graph read back through the Query Interface and
 * projected by the View Projection Engine — here the two new L2 projectors (3.3/3.4), which
 * share one realisation predicate so the matrix and the gap list can never disagree (D-P3.3).
 *
 * Self-contained: Feature 3.2 (vendor/project extraction) is not built yet, so there is no
 * live L2 data in the Phase 1/2 demo graph. This seeds a small, illustrative **Payments**
 * vendor scenario directly (the shape extraction will later emit as JSONL) and renders the
 * two Markdown artefacts. Deterministic — no LLM, no secret, no external service.
 */

const CONTEXT: QueryContext = {
  userId: "demo",
  roles: ["reader"],
  scopes: ["*"],
  requestId: "demo-coverage-gap",
};

const EVIDENCE: Evidence[] = [
  { source: "vendor-datasheets.md", location: "§demo", fetchedAt: "2026-01-01T00:00:00Z", sourceAuthority: "vendor" },
];

function node(type: string, id: string, extra: Record<string, unknown>): InventoryEntry {
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
  } as InventoryEntry;
}

function edge(relationshipType: string, sourceId: string, targetId: string, id: string): RelationshipEntry {
  return { id, type: "Relationship", version: "1.0.0", relationshipType, sourceId, targetId, evidencedBy: EVIDENCE };
}

/** Seed the illustrative Payments L2 vendor scenario (vendors, capabilities, mappings, edges). */
async function seedPaymentsVendorScenario(graph: GraphPort): Promise<void> {
  // Vendor products (matrix columns). Capability claim names are vendor-scoped — as real
  // datasheets phrase them — so each mapping attributes to exactly one product (D-P3.7).
  await graph.upsertNode(node("VendorProduct", "vp-stripe", { name: "Stripe Payments", vendor: "Stripe", productVersion: "2026-04", capabilityClaims: ["stripe-card-auth", "stripe-settlement", "stripe-payouts"] }));
  await graph.upsertNode(node("VendorProduct", "vp-adyen", { name: "Adyen Platform", vendor: "Adyen", productVersion: "68", capabilityClaims: ["adyen-card-auth", "adyen-fraud-screening", "adyen-settlement"] }));

  // Business capabilities (rows).
  for (const [id, name] of [
    ["cap-authorisation", "Card Authorisation"],
    ["cap-settlement", "Settlement"],
    ["cap-fraud", "Fraud Detection"],
    ["cap-payouts", "Payouts"],
    ["cap-reporting", "Regulatory Reporting"],
  ] as const) {
    await graph.upsertNode(node("BusinessCapability", id, { name, domain: "payments" }));
  }

  // Vendor-capability mappings (the graded coverage carriers).
  await graph.upsertNode(node("VendorCapabilityMapping", "m-stripe-auth", { vendorCapability: "stripe-card-auth", mappedConcept: { targetType: "BusinessCapability", targetId: "cap-authorisation" }, coverage: "full", coveragePercentage: 100 }));
  await graph.upsertNode(node("VendorCapabilityMapping", "m-adyen-auth", { vendorCapability: "adyen-card-auth", mappedConcept: { targetType: "BusinessCapability", targetId: "cap-authorisation" }, coverage: "full", coveragePercentage: 100 }));
  await graph.upsertNode(node("VendorCapabilityMapping", "m-stripe-settle", { vendorCapability: "stripe-settlement", mappedConcept: { targetType: "BusinessCapability", targetId: "cap-settlement" }, coverage: "partial", coveragePercentage: 70, gaps: ["no T+0 settlement"] }));
  await graph.upsertNode(node("VendorCapabilityMapping", "m-adyen-settle", { vendorCapability: "adyen-settlement", mappedConcept: { targetType: "BusinessCapability", targetId: "cap-settlement" }, coverage: "full", coveragePercentage: 100 }));
  await graph.upsertNode(node("VendorCapabilityMapping", "m-adyen-fraud", { vendorCapability: "adyen-fraud-screening", mappedConcept: { targetType: "BusinessCapability", targetId: "cap-fraud" }, coverage: "partial", coveragePercentage: 55, gaps: ["no behavioural scoring"] }));
  await graph.upsertNode(node("VendorCapabilityMapping", "m-stripe-payouts", { vendorCapability: "stripe-payouts", mappedConcept: { targetType: "BusinessCapability", targetId: "cap-payouts" }, coverage: "full", coveragePercentage: 90 }));

  // L3 implementing services (technical realisation).
  await graph.upsertNode(node("Service", "svc-auth", { name: "Authorisation Service" }));
  await graph.upsertNode(node("Service", "svc-settle", { name: "Settlement Service" }));

  // fulfils: VendorProduct → BusinessCapability (paired with a graded mapping, D-P3.7).
  await graph.createEdge(edge("fulfils", "vp-stripe", "cap-authorisation", "f-stripe-auth"));
  await graph.createEdge(edge("fulfils", "vp-stripe", "cap-settlement", "f-stripe-settle"));
  await graph.createEdge(edge("fulfils", "vp-stripe", "cap-payouts", "f-stripe-payouts"));
  await graph.createEdge(edge("fulfils", "vp-adyen", "cap-authorisation", "f-adyen-auth"));
  await graph.createEdge(edge("fulfils", "vp-adyen", "cap-settlement", "f-adyen-settle"));
  await graph.createEdge(edge("fulfils", "vp-adyen", "cap-fraud", "f-adyen-fraud"));

  // implements: Service → BusinessCapability (L3).
  await graph.createEdge(edge("implements", "svc-auth", "cap-authorisation", "i-auth"));
  await graph.createEdge(edge("implements", "svc-settle", "cap-settlement", "i-settle"));
}

export interface CoverageGapDemo {
  coverage: VendorCoverageView;
  gaps: GapAnalysisView;
  coverageMarkdown: string;
  gapMarkdown: string;
}

/** Seed → project both L2 views through the engine → render the two Markdown artefacts. */
export async function buildCoverageGapDemo(): Promise<CoverageGapDemo> {
  const graph = new InMemoryGraphAdapter();
  await seedPaymentsVendorScenario(graph);

  const service = new GraphQueryService(graph);
  const engine = new DefaultViewEngine(service);
  engine.registerProjector(new VendorCoverageProjector(service));
  engine.registerProjector(new GapAnalysisProjector(service));

  const coverage = (await engine.getView<VendorCoverageView>("vendor-coverage", {}, CONTEXT)).data;
  const gaps = (await engine.getView<GapAnalysisView>("gap-analysis", {}, CONTEXT)).data;

  return {
    coverage,
    gaps,
    coverageMarkdown: renderVendorCoverageMarkdown(coverage),
    gapMarkdown: renderGapAnalysisMarkdown(gaps),
  };
}
