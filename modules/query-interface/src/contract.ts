import { describe, expect, it } from "vitest";
import type { GraphPort } from "@dkm/knowledge-graph";
import type { Evidence, InventoryEntry, RelationshipEntry } from "@dkm/schema";
import type { QueryContext, QueryMetric, QueryService } from "./types";

const EVIDENCE: Evidence[] = [{ source: "spec.md", fetchedAt: "2026-01-01T00:00:00Z", sourceAuthority: "scheme" }];

function makeNode(type: string, extra: Record<string, unknown>, id: string): InventoryEntry {
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

function makeEdge(relationshipType: string, sourceId: string, targetId: string, id: string): RelationshipEntry {
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

function ctx(requestId = "req-contract"): QueryContext {
  return { userId: "u1", roles: ["reader"], scopes: ["payments.*"], requestId };
}

/** What a contract-suite factory yields: a graph to seed and the service under test over it. */
export interface QueryServiceContractHarness {
  graph: GraphPort;
  service: QueryService;
  /** Metrics emitted by `service`, captured by the wiring (acceptance criteria 6 & 8). */
  metrics: QueryMetric[];
}

export type QueryServiceContractFactory = () =>
  | QueryServiceContractHarness
  | Promise<QueryServiceContractHarness>;

/**
 * Adapter-agnostic contract suite for the {@link QueryService} graph-served subset
 * (feature 04 §6). Any QueryService over any {@link GraphPort} adapter — in-memory
 * (the CI gate) or Neo4j (opt-in, D-P1.2) — must pass this identical suite, proving
 * adapter parity (acceptance criterion 7). Call it inside a test file with a factory
 * that produces a fresh, empty harness per `it`.
 */
export function runQueryServiceContractTests(name: string, factory: QueryServiceContractFactory): void {
  describe(`QueryService contract — ${name}`, () => {
    // ---- 1. Entity lookup (acceptance 1) ------------------------------------
    describe("getEntry", () => {
      it("returns the typed entry for a known id", async () => {
        const { graph, service } = await factory();
        await graph.upsertNode(makeNode("DomainConcept", { name: "Payment" }, "e-payment"));

        const result = await service.getEntry("e-payment", ctx());
        expect(result?.entry.id).toBe("e-payment");
        expect(result?.entry.name).toBe("Payment");
      });

      it("returns null (not an error) for an unknown id", async () => {
        const { service } = await factory();
        expect(await service.getEntry("does-not-exist", ctx())).toBeNull();
      });
    });

    // ---- 2. Type listing + cursor pagination (acceptance 2) -----------------
    describe("listEntries", () => {
      it("paginates a type listing with stable cursors and no duplicates/skips", async () => {
        const { graph, service } = await factory();
        const ids = ["n-1", "n-2", "n-3", "n-4", "n-5"];
        for (const id of ids) await graph.upsertNode(makeNode("DomainConcept", { name: id }, id));

        const seen: string[] = [];
        const page1 = await service.listEntries({ type: "DomainConcept", limit: 2 }, ctx());
        expect(page1.items).toHaveLength(2);
        expect(page1.hasMore).toBe(true);
        expect(page1.cursor).toBeTruthy();
        seen.push(...page1.items.map((n) => n.id));

        const page2 = await service.listEntries({ type: "DomainConcept", limit: 2, cursor: page1.cursor! }, ctx());
        expect(page2.items).toHaveLength(2);
        expect(page2.hasMore).toBe(true);
        seen.push(...page2.items.map((n) => n.id));

        const page3 = await service.listEntries({ type: "DomainConcept", limit: 2, cursor: page2.cursor! }, ctx());
        expect(page3.items).toHaveLength(1);
        expect(page3.hasMore).toBe(false);
        expect(page3.cursor).toBeNull();
        seen.push(...page3.items.map((n) => n.id));

        // No duplicates, no skips — every seeded id appears exactly once.
        expect([...seen].sort()).toEqual([...ids].sort());
        expect(new Set(seen).size).toBe(ids.length);
      });

      it("reports the total count and empty pages for an absent type", async () => {
        const { graph, service } = await factory();
        await graph.upsertNode(makeNode("DomainConcept", { name: "Payment" }, "e-payment"));

        const present = await service.listEntries({ type: "DomainConcept" }, ctx());
        expect(present.totalCount).toBe(1);

        const absent = await service.listEntries({ type: "NoSuchType" }, ctx());
        expect(absent.items).toEqual([]);
        expect(absent.hasMore).toBe(false);
        expect(absent.cursor).toBeNull();
        expect(absent.totalCount).toBe(0);
      });
    });

    // ---- 3. Traversal (acceptance 3) ----------------------------------------
    describe("traverse", () => {
      async function seedTriangle(graph: GraphPort): Promise<void> {
        await graph.upsertNode(makeNode("Decision", { name: "Authorise" }, "d"));
        await graph.upsertNode(makeNode("Rule", { name: "Funds" }, "r"));
        await graph.upsertNode(makeNode("ReferenceData", { name: "Limits" }, "ref"));
        await graph.createEdge(makeEdge("evaluates", "d", "r", "x-evaluates"));
        await graph.createEdge(makeEdge("consumes", "d", "ref", "x-consumes"));
      }

      it("returns the reachable subgraph with edges when includeEdges is true", async () => {
        const { graph, service } = await factory();
        await seedTriangle(graph);

        const result = await service.traverse(
          { startNodeId: "d", direction: "out", maxDepth: 1, includeEdges: true },
          ctx(),
        );
        expect(result.nodes.map((n) => n.id).sort()).toEqual(["d", "r", "ref"].sort());
        expect(result.edges.map((e) => e.relationshipType).sort()).toEqual(["consumes", "evaluates"]);
      });

      it("follows only the requested edge types", async () => {
        const { graph, service } = await factory();
        await seedTriangle(graph);

        const result = await service.traverse(
          { startNodeId: "d", direction: "out", edgeTypes: ["evaluates"], maxDepth: 2, includeEdges: true },
          ctx(),
        );
        expect(result.nodes.map((n) => n.id).sort()).toEqual(["d", "r"].sort());
        expect(result.edges.map((e) => e.relationshipType)).toEqual(["evaluates"]);
      });

      it("omits edges when includeEdges is false", async () => {
        const { graph, service } = await factory();
        await seedTriangle(graph);

        const result = await service.traverse(
          { startNodeId: "d", direction: "out", maxDepth: 1, includeEdges: false },
          ctx(),
        );
        expect(result.nodes.length).toBeGreaterThan(0);
        expect(result.edges).toEqual([]);
      });

      it("returns an empty subgraph for an unknown start node (no crash)", async () => {
        const { service } = await factory();
        const result = await service.traverse(
          { startNodeId: "ghost", direction: "out", maxDepth: 2, includeEdges: true },
          ctx(),
        );
        expect(result.nodes).toEqual([]);
        expect(result.edges).toEqual([]);
      });
    });

    // ---- 4. Path finding (acceptance 4) -------------------------------------
    describe("findPaths", () => {
      it("returns at least one correct path between connected nodes", async () => {
        const { graph, service } = await factory();
        await graph.upsertNode(makeNode("Decision", { name: "Authorise" }, "d"));
        await graph.upsertNode(makeNode("Rule", { name: "Funds" }, "r"));
        await graph.createEdge(makeEdge("evaluates", "d", "r", "x-evaluates"));

        const result = await service.findPaths({ sourceId: "d", targetId: "r" }, ctx());
        expect(result.found).toBe(true);
        expect(result.paths.length).toBeGreaterThanOrEqual(1);
        expect(result.paths[0]?.nodeIds).toEqual(["d", "r"]);
      });

      it("returns an empty path set for unconnected nodes", async () => {
        const { graph, service } = await factory();
        await graph.upsertNode(makeNode("Decision", { name: "Authorise" }, "d"));
        await graph.upsertNode(makeNode("DomainConcept", { name: "Island" }, "x"));

        const result = await service.findPaths({ sourceId: "d", targetId: "x" }, ctx());
        expect(result.found).toBe(false);
        expect(result.paths).toEqual([]);
      });
    });

    // ---- 6 & 8. Context seam + metrics --------------------------------------
    describe("metrics & context", () => {
      it("emits a metric carrying queryType, duration, backendsCalled and the requestId", async () => {
        const harness = await factory();
        await harness.graph.upsertNode(makeNode("DomainConcept", { name: "Payment" }, "e-payment"));

        await harness.service.getEntry("e-payment", ctx("trace-42"));

        const metric = harness.metrics.at(-1);
        expect(metric?.queryType).toBe("entityLookup");
        expect(metric?.requestId).toBe("trace-42");
        expect(metric?.backendsCalled).toEqual(["graph"]);
        expect(typeof metric?.duration).toBe("number");
        expect(metric!.duration).toBeGreaterThanOrEqual(0);
      });
    });
  });
}
