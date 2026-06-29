import { describe, expect, it } from "vitest";
import { InMemoryGraphAdapter } from "@dkm/knowledge-graph";
import type { GraphPort } from "@dkm/knowledge-graph";
import { CapabilityMapProjector } from "../src/index";
import type { CapabilityMapView, CapabilityNode } from "../src/index";
import { buildService, ctx, makeEdge, makeNode } from "./helpers";

function projectorOver(graph: GraphPort): CapabilityMapProjector {
  return new CapabilityMapProjector(buildService(graph));
}

/** Flatten the forest depth-first into a name→node map (and assert no node appears twice). */
function flatten(view: CapabilityMapView): Map<string, CapabilityNode> {
  const out = new Map<string, CapabilityNode>();
  const walk = (n: CapabilityNode) => {
    expect(out.has(n.name)).toBe(false); // each capability appears exactly once (cycle/dup safety)
    out.set(n.name, n);
    n.children.forEach(walk);
  };
  view.roots.forEach(walk);
  return out;
}

/**
 * A capability hierarchy with attached evidence, orphans, a cycle, and an alias — one fixture
 * exercising every facet of the projector.
 *
 *   Stewardship (L1)
 *     ├─ Engagement (L2)
 *     │    └─ Proxy Voting (L3)   ← carries the evidence counted below
 *     └─ Escalation (L2)
 *   Reporting (L1, no parent)
 *   Mystery (parent "Nope" → unresolved → orphaned root)
 *   Canonical (alias "Old Name") ← child resolves to it via alias
 *     └─ Aliased Child (parent "Old Name")
 *   Cycle A ↔ Cycle B (mutual parents → must not loop)
 */
async function seedCapabilityGraph(): Promise<InMemoryGraphAdapter> {
  const g = new InMemoryGraphAdapter();
  const cap = (id: string, extra: Record<string, unknown>) =>
    g.upsertNode(makeNode("BusinessCapability", id, extra));

  await cap("cap-stewardship", { name: "Stewardship", level: 1 });
  await cap("cap-engagement", { name: "Engagement", level: 2, parentCapability: "Stewardship" });
  await cap("cap-proxy", { name: "Proxy Voting", level: 3, parentCapability: "Engagement" });
  await cap("cap-escalation", { name: "Escalation", level: 2, parentCapability: "Stewardship" });
  await cap("cap-reporting", { name: "Reporting", level: 1 });
  await cap("cap-mystery", { name: "Mystery", level: 2, parentCapability: "Nope" });
  await cap("cap-canonical", { name: "Canonical", level: 1, aliases: ["Old Name"] });
  await cap("cap-aliaschild", { name: "Aliased Child", level: 2, parentCapability: "Old Name" });
  await cap("cap-cyc-a", { name: "Cycle A", level: 1, parentCapability: "Cycle B" });
  await cap("cap-cyc-b", { name: "Cycle B", level: 1, parentCapability: "Cycle A" });

  // Evidence attached to Proxy Voting → counts {rules:1, invariants:1, decisions:1, concepts:1, realisations:2}
  await g.upsertNode(makeNode("Rule", "r1", { name: "Voting Policy" }));
  await g.upsertNode(makeNode("BusinessInvariant", "inv1", { statement: "Must vote" }));
  await g.upsertNode(makeNode("Decision", "d1", { name: "Vote or abstain" }));
  await g.upsertNode(makeNode("DomainConcept", "c1", { name: "Resolution" }));
  await g.upsertNode(makeNode("OrchestrationFlow", "f1", { name: "Voting Flow" }));
  await g.upsertNode(makeNode("Service", "s1", { name: "Voting Service" }));
  await g.createEdge(makeEdge("governs", "r1", "cap-proxy", "e1"));
  await g.createEdge(makeEdge("constrains", "inv1", "cap-proxy", "e2"));
  await g.createEdge(makeEdge("involves", "cap-proxy", "d1", "e3"));
  await g.createEdge(makeEdge("supports", "c1", "cap-proxy", "e4"));
  await g.createEdge(makeEdge("implements", "f1", "cap-proxy", "e5"));
  await g.createEdge(makeEdge("implements", "s1", "cap-proxy", "e6"));
  // A capability↔capability edge must NOT inflate Proxy Voting's evidence counts.
  await g.createEdge(makeEdge("supports", "cap-proxy", "cap-escalation", "e7"));
  return g;
}

describe("CapabilityMapProjector — tree assembly", () => {
  it("nests capabilities by parentCapability (resolved by name)", async () => {
    const view = await projectorOver(await seedCapabilityGraph()).project({}, ctx());
    const byName = flatten(view);

    const stewardship = view.roots.find((r) => r.name === "Stewardship");
    expect(stewardship?.children.map((c) => c.name).sort()).toEqual(["Engagement", "Escalation"]);
    expect(byName.get("Engagement")?.children.map((c) => c.name)).toEqual(["Proxy Voting"]);
    expect(byName.get("Proxy Voting")?.children).toEqual([]);
  });

  it("resolves a parent declared against the survivor's alias", async () => {
    const view = await projectorOver(await seedCapabilityGraph()).project({}, ctx());
    const canonical = view.roots.find((r) => r.name === "Canonical");
    expect(canonical?.children.map((c) => c.name)).toEqual(["Aliased Child"]);
  });

  it("surfaces a capability with an unresolved parent as an orphaned root", async () => {
    const view = await projectorOver(await seedCapabilityGraph()).project({}, ctx());
    const mystery = view.roots.find((r) => r.name === "Mystery");
    expect(mystery).toBeDefined();
    expect(mystery?.orphaned).toBe(true);
    expect(view.roots.find((r) => r.name === "Reporting")?.orphaned).toBe(false);
  });

  it("never loops on a parent cycle; every capability appears exactly once", async () => {
    const view = await projectorOver(await seedCapabilityGraph()).project({}, ctx());
    // flatten() asserts uniqueness; here assert completeness (all 10 capabilities present).
    expect(flatten(view).size).toBe(10);
  });
});

describe("CapabilityMapProjector — counts & descendants", () => {
  it("counts attached evidence by neighbour type, excluding capability↔capability edges", async () => {
    const view = await projectorOver(await seedCapabilityGraph()).project({}, ctx());
    const proxy = flatten(view).get("Proxy Voting");
    expect(proxy?.counts).toEqual({
      rules: 1,
      invariants: 1,
      decisions: 1,
      concepts: 1,
      realisations: 2,
    });
  });

  it("reports subtree sizes via descendantCount", async () => {
    const byName = flatten(await projectorOver(await seedCapabilityGraph()).project({}, ctx()));
    expect(byName.get("Stewardship")?.descendantCount).toBe(3);
    expect(byName.get("Engagement")?.descendantCount).toBe(1);
    expect(byName.get("Proxy Voting")?.descendantCount).toBe(0);
  });
});

describe("CapabilityMapProjector — root scoping", () => {
  it("restricts to one root subtree by name (case-insensitive)", async () => {
    const view = await projectorOver(await seedCapabilityGraph()).project({ root: "stewardship" }, ctx());
    expect(view.roots.map((r) => r.name)).toEqual(["Stewardship"]);
    expect(view.roots[0]?.children.map((c) => c.name).sort()).toEqual(["Engagement", "Escalation"]);
  });

  it("restricts by root id", async () => {
    const view = await projectorOver(await seedCapabilityGraph()).project({ root: "cap-reporting" }, ctx());
    expect(view.roots.map((r) => r.name)).toEqual(["Reporting"]);
  });

  it("returns an empty forest for an unknown root (no throw)", async () => {
    const view = await projectorOver(await seedCapabilityGraph()).project({ root: "nope" }, ctx());
    expect(view.roots).toEqual([]);
  });
});

describe("CapabilityMapProjector — empties & metadata", () => {
  it("produces an empty-but-valid view for a graph with no capabilities", async () => {
    const view = await projectorOver(new InMemoryGraphAdapter()).project({}, ctx());
    expect(view).toEqual({ roots: [] });
  });

  it("reports entriesIncluded = number of capabilities", async () => {
    const projector = projectorOver(await seedCapabilityGraph());
    const view = await projector.project({}, ctx());
    expect(projector.entriesIncluded(view)).toBe(10);
  });

  it("declares an on-demand capability-map view via describe()", async () => {
    const projector = projectorOver(await seedCapabilityGraph());
    expect(projector.describe().viewType).toBe("capability-map");
    expect(projector.describe().refreshPolicy).toBe("on-demand");
  });
});
