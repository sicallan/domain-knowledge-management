import { describe, expect, it } from "vitest";
import { InMemoryGraphAdapter } from "@dkm/knowledge-graph";
import type { GraphPort } from "@dkm/knowledge-graph";
import { BusinessArchitectureProjector } from "../src/index";
import type { BusinessArchitectureNode, BusinessArchitectureView } from "../src/index";
import { buildService, ctx, makeEdge, makeNode } from "./helpers";

// Feature 08 (#86, ADR-0009) — the Business-Architecture Lens. A deterministic projection
// over the curated ReferenceCapability spine + the materialised CapabilityClassification
// judgments: curated domains → L2 capabilities → the raw capabilities classified beneath
// them as L3 functions / L4 activities; rejected & unclassified surfaced as their own
// buckets. Written first; must pass once the projector exists.

function projectorOver(graph: GraphPort): BusinessArchitectureProjector {
  return new BusinessArchitectureProjector(buildService(graph));
}

/** Flatten the domain forest depth-first into a name→node map (and assert no node appears twice). */
function flatten(view: BusinessArchitectureView): Map<string, BusinessArchitectureNode> {
  const out = new Map<string, BusinessArchitectureNode>();
  const walk = (n: BusinessArchitectureNode) => {
    expect(out.has(n.name)).toBe(false); // each node appears exactly once (cycle/dup safety)
    out.set(n.name, n);
    n.children.forEach(walk);
  };
  view.domains.forEach(walk);
  return out;
}

/**
 * A spine + classifications fixture exercising every facet:
 *
 *   Investment Management (L1 ref)
 *     └─ Portfolio Management (L2 ref)
 *          ├─ Portfolio Construction (L3, placed, conf .9, has 1 governing Rule)
 *          └─ Some Vague Thing        (L3, placed, conf .4 — dropped by minConfidence .5)
 *   Stewardship & Responsible Investment (L1 ref)
 *     └─ Stewardship (L2 ref)
 *          └─ Proxy Voting (L3, placed under "Stewardship")
 *               └─ AGM Engagement (L4, placed under the *raw cap* "Proxy Voting")
 *
 *   rejected:     Vanguard Investor Choice (generic-mention)
 *   unclassified: Weird Cap (no classification at all)
 */
async function seedBusinessArchitectureGraph(): Promise<InMemoryGraphAdapter> {
  const g = new InMemoryGraphAdapter();

  // Curated spine (L1 domains + L2 capabilities).
  await g.upsertNode(makeNode("ReferenceCapability", "ref-invest", { name: "Investment Management", level: 1, framework: "BIZBOK" }));
  await g.upsertNode(makeNode("ReferenceCapability", "ref-portfolio", { name: "Portfolio Management", level: 2, parent: "Investment Management", framework: "BIZBOK" }));
  await g.upsertNode(makeNode("ReferenceCapability", "ref-steward", { name: "Stewardship & Responsible Investment", level: 1, framework: "BIZBOK" }));
  await g.upsertNode(makeNode("ReferenceCapability", "ref-stewardship", { name: "Stewardship", level: 2, parent: "Stewardship & Responsible Investment", framework: "BIZBOK" }));

  // Raw extracted capabilities (the classification subjects).
  await g.upsertNode(makeNode("BusinessCapability", "bc-construction", { name: "Portfolio Construction", level: 3 }));
  await g.upsertNode(makeNode("BusinessCapability", "bc-vague", { name: "Some Vague Thing", level: 3 }));
  await g.upsertNode(makeNode("BusinessCapability", "bc-proxy", { name: "Proxy Voting", level: 3 }));
  await g.upsertNode(makeNode("BusinessCapability", "bc-agm", { name: "AGM Engagement", level: 4 }));
  await g.upsertNode(makeNode("BusinessCapability", "bc-vanguard", { name: "Vanguard Investor Choice", level: 1 }));
  await g.upsertNode(makeNode("BusinessCapability", "bc-weird", { name: "Weird Cap", level: 2 }));

  // Classifications (the materialised judgment).
  const cls = (id: string, extra: Record<string, unknown>) =>
    g.upsertNode(makeNode("CapabilityClassification", id, extra));
  await cls("cls-construction", { subject: "bc-construction", disposition: "placed", assignedParent: "Portfolio Management", assignedLevel: 3, rationale: "A portfolio-construction function.", confidence: 0.9 });
  await cls("cls-vague", { subject: "bc-vague", disposition: "placed", assignedParent: "Portfolio Management", assignedLevel: 3, rationale: "Best-guess placement.", confidence: 0.4 });
  await cls("cls-proxy", { subject: "bc-proxy", disposition: "placed", assignedParent: "Stewardship", assignedLevel: 3, rationale: "Proxy voting is a stewardship function.", confidence: 0.92 });
  await cls("cls-agm", { subject: "bc-agm", disposition: "placed", assignedParent: "Proxy Voting", assignedLevel: 4, rationale: "AGM engagement is an activity under proxy voting.", confidence: 0.85 });
  await cls("cls-vanguard", { subject: "bc-vanguard", disposition: "rejected", rejectionReason: "generic-mention", rationale: "A vendor-branded programme, not a capability.", confidence: 0.95 });
  // bc-weird has NO classification → unclassified.

  // Evidence attached to Portfolio Construction → counts.rules = 1.
  await g.upsertNode(makeNode("Rule", "r1", { name: "Construction Policy" }));
  await g.createEdge(makeEdge("governs", "r1", "bc-construction", "e1"));
  return g;
}

describe("BusinessArchitectureProjector — spine + placement assembly", () => {
  it("always shows the curated domains and their L2 capabilities", async () => {
    const view = await projectorOver(await seedBusinessArchitectureGraph()).project({}, ctx());
    expect(view.domains.map((d) => d.name)).toEqual(["Investment Management", "Stewardship & Responsible Investment"]);
    const byName = flatten(view);
    expect(byName.get("Investment Management")?.children.map((c) => c.name)).toEqual(["Portfolio Management"]);
    expect(byName.get("Investment Management")?.origin).toBe("reference");
    expect(byName.get("Investment Management")?.level).toBe(1);
    expect(byName.get("Portfolio Management")?.origin).toBe("reference");
  });

  it("places raw capabilities under their assigned reference capability (L3)", async () => {
    const byName = flatten(await projectorOver(await seedBusinessArchitectureGraph()).project({}, ctx()));
    expect(byName.get("Portfolio Management")?.children.map((c) => c.name)).toEqual(["Portfolio Construction", "Some Vague Thing"]);
    const construction = byName.get("Portfolio Construction");
    expect(construction?.origin).toBe("classified");
    expect(construction?.level).toBe(3);
    expect(construction?.rationale).toContain("portfolio-construction");
  });

  it("nests an L4 activity under a placed L3 capability (classified-under-classified)", async () => {
    const byName = flatten(await projectorOver(await seedBusinessArchitectureGraph()).project({}, ctx()));
    expect(byName.get("Stewardship")?.children.map((c) => c.name)).toEqual(["Proxy Voting"]);
    expect(byName.get("Proxy Voting")?.children.map((c) => c.name)).toEqual(["AGM Engagement"]);
    expect(byName.get("AGM Engagement")?.level).toBe(4);
  });

  it("counts evidence attached to a classified capability", async () => {
    const byName = flatten(await projectorOver(await seedBusinessArchitectureGraph()).project({}, ctx()));
    expect(byName.get("Portfolio Construction")?.counts).toEqual({ rules: 1, invariants: 0, decisions: 0, concepts: 0, realisations: 0 });
  });

  it("reports subtree sizes via descendantCount", async () => {
    const byName = flatten(await projectorOver(await seedBusinessArchitectureGraph()).project({}, ctx()));
    expect(byName.get("Stewardship & Responsible Investment")?.descendantCount).toBe(3); // Stewardship → Proxy Voting → AGM
    expect(byName.get("Proxy Voting")?.descendantCount).toBe(1);
    expect(byName.get("AGM Engagement")?.descendantCount).toBe(0);
  });
});

describe("BusinessArchitectureProjector — rejected & unclassified buckets", () => {
  it("tallies rejected classifications by reason (never placed in the tree)", async () => {
    const view = await projectorOver(await seedBusinessArchitectureGraph()).project({}, ctx());
    expect(view.rejected.count).toBe(1);
    expect(view.rejected.byReason).toEqual([{ reason: "generic-mention", count: 1 }]);
    expect(flatten(view).has("Vanguard Investor Choice")).toBe(false);
  });

  it("counts raw capabilities with no classification as unclassified", async () => {
    const view = await projectorOver(await seedBusinessArchitectureGraph()).project({}, ctx());
    expect(view.unclassified.count).toBe(1);
    expect(view.unclassified.names).toEqual(["Weird Cap"]);
  });
});

describe("BusinessArchitectureProjector — minConfidence", () => {
  it("drops below-threshold placements and moves their subjects to unclassified", async () => {
    const view = await projectorOver(await seedBusinessArchitectureGraph()).project({ minConfidence: 0.5 }, ctx());
    const byName = flatten(view);
    expect(byName.get("Portfolio Management")?.children.map((c) => c.name)).toEqual(["Portfolio Construction"]);
    expect(byName.has("Some Vague Thing")).toBe(false);
    expect(view.unclassified.count).toBe(2);
    expect(view.unclassified.names).toEqual(["Some Vague Thing", "Weird Cap"]);
  });
});

describe("BusinessArchitectureProjector — root scoping & metadata", () => {
  it("restricts to one domain subtree by name (case-insensitive)", async () => {
    const view = await projectorOver(await seedBusinessArchitectureGraph()).project({ root: "investment management" }, ctx());
    expect(view.domains.map((d) => d.name)).toEqual(["Investment Management"]);
  });

  it("restricts by domain id", async () => {
    const view = await projectorOver(await seedBusinessArchitectureGraph()).project({ root: "ref-steward" }, ctx());
    expect(view.domains.map((d) => d.name)).toEqual(["Stewardship & Responsible Investment"]);
  });

  it("produces an empty-but-valid view for a graph with no spine", async () => {
    const view = await projectorOver(new InMemoryGraphAdapter()).project({}, ctx());
    expect(view).toEqual({ domains: [], rejected: { count: 0, byReason: [] }, unclassified: { count: 0, names: [] } });
  });

  it("declares an on-demand business-architecture view via describe()", async () => {
    const projector = projectorOver(await seedBusinessArchitectureGraph());
    expect(projector.describe().viewType).toBe("business-architecture");
    expect(projector.describe().refreshPolicy).toBe("on-demand");
  });
});
