import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { InMemoryGraphAdapter, neo4jAdapterFromEnv } from "@dkm/knowledge-graph";
import type { GraphPort } from "@dkm/knowledge-graph";
import { concatJsonl, GraphLoader } from "@dkm/loaders";
import { GraphQueryService } from "@dkm/query";
import { DefaultViewEngine, DomainMapProjector } from "../src/index";
import type { DomainMapContext, DomainMapView } from "../src/index";
import { ctx } from "./helpers";

// The full Phase 1 slice (the demo path): the same pre-baked Payments JSONL the demo
// loads → GraphLoader → GraphQueryService → ViewEngine.getView('domain-map'). Asserted
// over BOTH adapters to prove adapter parity (acceptance 8 / D-P1.2).
const EXTRACTIONS = fileURLToPath(new URL("../../../demo/payments-extractions.jsonl", import.meta.url));
const RELATIONSHIPS = fileURLToPath(new URL("../../../demo/payments-relationships.jsonl", import.meta.url));

function findContext(view: DomainMapView, contextId: string): DomainMapContext | undefined {
  for (const subdomain of view.subdomains) {
    const found = subdomain.contexts.find((context) => context.id === contextId);
    if (found) return found;
  }
  return undefined;
}

/** Load the demo fixtures through the loader, project, and assert the Domain Map. */
async function assertDomainMapOverLoadedGraph(graph: GraphPort): Promise<void> {
  const loader = new GraphLoader(graph);
  await loader.initialize({});
  const load = await loader.load(concatJsonl([EXTRACTIONS, RELATIONSHIPS]), "demo-payments");
  expect(load.failed).toBe(0);
  expect(load.loaded).toBe(93); // 40 inventory entries + 53 relationships (incl. the Phase 2 behaviour layer + the #84 capability hierarchy)

  const service = new GraphQueryService(graph);
  const engine = new DefaultViewEngine(service);
  engine.registerProjector(new DomainMapProjector(service));

  const result = await engine.getView<DomainMapView>("domain-map", {}, ctx());

  // Freshness metadata (acceptance 7): on-demand is always fresh, never cached.
  expect(result.metadata.viewType).toBe("domain-map");
  expect(result.metadata.cacheHit).toBe(false);
  expect(result.metadata.stale).toBe(false);
  expect(result.metadata.entriesIncluded).toBeGreaterThan(0);

  const view = result.data;

  // Structure (acceptance 1): 2 subdomains, contexts nested correctly.
  expect(view.subdomains.map((s) => s.id)).toEqual(["sd-payments", "sd-risk"]);
  const payments = view.subdomains.find((s) => s.id === "sd-payments");
  expect(payments?.name).toBe("Payments");
  expect(payments?.contexts.map((c) => c.id)).toEqual(["bc-authorisation", "bc-refunds", "bc-settlement"]);
  const risk = view.subdomains.find((s) => s.id === "sd-risk");
  expect(risk?.contexts.map((c) => c.id)).toEqual(["bc-fraud"]);

  // Counts (acceptance 3): DomainConcepts per context; no Service nodes in Phase 1.
  expect(findContext(view, "bc-authorisation")).toMatchObject({ conceptCount: 2, serviceCount: 0 });
  expect(findContext(view, "bc-settlement")).toMatchObject({ conceptCount: 2, serviceCount: 0 });
  expect(findContext(view, "bc-refunds")).toMatchObject({ conceptCount: 1, serviceCount: 0 });
  expect(findContext(view, "bc-fraud")).toMatchObject({ conceptCount: 0, serviceCount: 0 });

  // Cross-context edges (acceptance 2): the two genuinely cross-context links.
  expect(view.crossContextRelationships).toEqual([
    { source: "bc-authorisation", target: "bc-fraud", type: "triggers", strength: 1 },
    { source: "bc-refunds", target: "bc-settlement", type: "derivedFrom", strength: 1 },
  ]);

  // Subdomain scoping (acceptance 4).
  const scoped = await engine.getView<DomainMapView>("domain-map", { subdomain: "sd-risk" }, ctx());
  expect(scoped.data.subdomains.map((s) => s.id)).toEqual(["sd-risk"]);
  // The triggers edge points out of sd-risk's scope, so it is dropped when scoped.
  expect(scoped.data.crossContextRelationships).toEqual([]);
}

describe("Domain Map over a loader-populated graph — in-memory adapter", () => {
  it("projects the expected DomainMapView from the demo fixtures", async () => {
    await assertDomainMapOverLoadedGraph(new InMemoryGraphAdapter());
  });
});

// Same end-to-end projection against Neo4j — opt-in only (D-P1.2), never a CI gate.
const neo4j = neo4jAdapterFromEnv();
if (neo4j) {
  const { adapter, driver } = neo4j;
  afterAll(async () => {
    await adapter.clear();
    await driver.close();
  });
  describe("Domain Map over a loader-populated graph — Neo4j adapter", () => {
    it("projects an identical DomainMapView from the same JSONL pair", async () => {
      await adapter.clear();
      await assertDomainMapOverLoadedGraph(adapter);
    });
  });
} else {
  describe.skip("Domain Map over a loader-populated graph — Neo4j adapter (set NEO4J_URI to run)", () => {
    it("is skipped without a configured Neo4j — never a CI gate (D-P1.2)", () => {
      /* documents the guarded, opt-in adapter-parity path (acceptance 8) */
    });
  });
}
