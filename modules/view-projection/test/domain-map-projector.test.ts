import { describe, expect, it } from "vitest";
import { InMemoryGraphAdapter } from "@dkm/knowledge-graph";
import { DomainMapProjector } from "../src/index";
import type { DomainMapView } from "../src/index";
import { buildService, ctx, makeEdge, makeNode, seededInMemoryGraph } from "./helpers";

function projectorOver(graph: InMemoryGraphAdapter): DomainMapProjector {
  return new DomainMapProjector(buildService(graph));
}

function context(view: DomainMapView, contextId: string) {
  for (const sub of view.subdomains) {
    const found = sub.contexts.find((c) => c.id === contextId);
    if (found) return found;
  }
  return undefined;
}

describe("DomainMapProjector — structure & nesting (acceptance 1)", () => {
  it("nests bounded contexts under their subdomains", async () => {
    const projector = projectorOver(await seededInMemoryGraph());
    const view = await projector.project({}, ctx());

    expect(view.subdomains.map((s) => s.id).sort()).toEqual(["sd-payments", "sd-risk"]);

    const payments = view.subdomains.find((s) => s.id === "sd-payments");
    expect(payments?.name).toBe("Payments");
    expect(payments?.contexts.map((c) => c.id).sort()).toEqual(["bc-auth", "bc-settle"]);

    const risk = view.subdomains.find((s) => s.id === "sd-risk");
    expect(risk?.contexts.map((c) => c.id)).toEqual(["bc-fraud"]);
  });
});

describe("DomainMapProjector — per-context counts (acceptance 3)", () => {
  it("counts contained concepts and services per context", async () => {
    const projector = projectorOver(await seededInMemoryGraph());
    const view = await projector.project({}, ctx());

    expect(context(view, "bc-auth")).toMatchObject({ conceptCount: 2, serviceCount: 1 });
    expect(context(view, "bc-settle")).toMatchObject({ conceptCount: 1, serviceCount: 0 });
    expect(context(view, "bc-fraud")).toMatchObject({ conceptCount: 1, serviceCount: 0 });
  });
});

describe("DomainMapProjector — cross-context edges (acceptance 2)", () => {
  it("aggregates cross-context relationships with strength = edge count", async () => {
    const projector = projectorOver(await seededInMemoryGraph());
    const view = await projector.project({}, ctx());

    const byKey = new Map(
      view.crossContextRelationships.map((r) => [`${r.source}->${r.target}:${r.type}`, r.strength]),
    );
    expect(byKey.get("bc-auth->bc-settle:settledBy")).toBe(1);
    expect(byKey.get("bc-auth->bc-fraud:scoredBy")).toBe(2);
    // Only genuinely cross-context edges appear (belongsTo / intra-context excluded).
    expect(view.crossContextRelationships).toHaveLength(2);
  });

  it("mirrors cross-context edges into each source context's relationships[]", async () => {
    const projector = projectorOver(await seededInMemoryGraph());
    const view = await projector.project({}, ctx());

    const auth = context(view, "bc-auth");
    expect(auth?.relationships).toEqual(
      expect.arrayContaining([
        { targetContextId: "bc-settle", type: "settledBy" },
        { targetContextId: "bc-fraud", type: "scoredBy" },
      ]),
    );
    // A context with no outgoing cross-context edges has an empty list (no nulls).
    expect(context(view, "bc-fraud")?.relationships).toEqual([]);
  });
});

describe("DomainMapProjector — subdomain scoping (acceptance 4)", () => {
  it("returns only the named subdomain's contexts (by id)", async () => {
    const projector = projectorOver(await seededInMemoryGraph());
    const view = await projector.project({ subdomain: "sd-payments" }, ctx());

    expect(view.subdomains.map((s) => s.id)).toEqual(["sd-payments"]);
    expect(view.subdomains[0]?.contexts.map((c) => c.id).sort()).toEqual(["bc-auth", "bc-settle"]);

    // Cross-context relationships referencing an out-of-scope context are dropped;
    // only those fully inside the scoped subdomain remain.
    expect(view.crossContextRelationships).toEqual([
      { source: "bc-auth", target: "bc-settle", type: "settledBy", strength: 1 },
    ]);
  });

  it("also scopes by subdomain name (case-insensitive)", async () => {
    const projector = projectorOver(await seededInMemoryGraph());
    const view = await projector.project({ subdomain: "risk & fraud" }, ctx());
    expect(view.subdomains.map((s) => s.id)).toEqual(["sd-risk"]);
  });

  it("returns an empty view for an unknown subdomain (no throws)", async () => {
    const projector = projectorOver(await seededInMemoryGraph());
    const view = await projector.project({ subdomain: "nope" }, ctx());
    expect(view.subdomains).toEqual([]);
    expect(view.crossContextRelationships).toEqual([]);
  });
});

describe("DomainMapProjector — empty graph (acceptance 5)", () => {
  it("produces an empty-but-valid DomainMapView (no nulls, no throws)", async () => {
    const projector = projectorOver(new InMemoryGraphAdapter());
    const view = await projector.project({}, ctx());
    expect(view).toEqual({ subdomains: [], crossContextRelationships: [] });
  });

  it("reports zero entriesIncluded for an empty graph", async () => {
    const projector = projectorOver(new InMemoryGraphAdapter());
    const view = await projector.project({}, ctx());
    expect(projector.entriesIncluded(view)).toBe(0);
  });
});

describe("DomainMapProjector — membership via the denormalised field (fallback path)", () => {
  it("nests a context under its subdomain using the denormalised subdomain field when no belongsTo edge exists", async () => {
    const graph = new InMemoryGraphAdapter();
    await graph.upsertNode(makeNode("Subdomain", "sd-x", { name: "X" }));
    // No belongsTo edge — only the denormalised field links the context to its subdomain.
    await graph.upsertNode(makeNode("BoundedContext", "bc-x", { name: "Ctx X", subdomain: "sd-x" }));
    await graph.upsertNode(makeNode("DomainConcept", "c-x", { name: "Thing" }));
    await graph.createEdge(makeEdge("belongsTo", "c-x", "bc-x", "b-c-x"));

    const view = await projectorOver(graph).project({}, ctx());
    expect(view.subdomains.map((s) => s.id)).toEqual(["sd-x"]);
    expect(context(view, "bc-x")).toMatchObject({ conceptCount: 1 });
  });
});

describe("DomainMapProjector — freshness metadata (acceptance 7)", () => {
  it("reports entriesIncluded covering subdomains + contexts + members", async () => {
    const projector = projectorOver(await seededInMemoryGraph());
    const view = await projector.project({}, ctx());
    // 2 subdomains + 3 contexts + (2+1 concepts/services in bc-auth) + 1 (bc-settle) + 1 (bc-fraud)
    expect(projector.entriesIncluded(view)).toBe(10);
  });

  it("declares an on-demand refresh policy via describe()", async () => {
    const projector = projectorOver(await seededInMemoryGraph());
    expect(projector.describe().viewType).toBe("domain-map");
    expect(projector.describe().refreshPolicy).toBe("on-demand");
  });
});
