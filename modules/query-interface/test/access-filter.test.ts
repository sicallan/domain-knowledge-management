import { describe, expect, it } from "vitest";
import { InMemoryGraphAdapter } from "@dkm/knowledge-graph";
import type { InventoryEntry, RelationshipEntry } from "@dkm/schema";
import { GraphQueryService, PassThroughAccessFilter } from "../src/index";
import type { AccessFilter, QueryContext } from "../src/index";
import { ctx, makeEdge, makeNode } from "./helpers";

/** A spying access filter that records the contexts it is invoked with, then delegates. */
class SpyAccessFilter implements AccessFilter {
  readonly nodeCalls: Array<{ count: number; context: QueryContext }> = [];
  readonly edgeCalls: Array<{ count: number; context: QueryContext }> = [];
  private readonly inner = new PassThroughAccessFilter();

  filterNodes(nodes: InventoryEntry[], context: QueryContext): InventoryEntry[] {
    this.nodeCalls.push({ count: nodes.length, context });
    return this.inner.filterNodes(nodes, context);
  }

  filterEdges(edges: RelationshipEntry[], context: QueryContext): RelationshipEntry[] {
    this.edgeCalls.push({ count: edges.length, context });
    return this.inner.filterEdges(edges, context);
  }
}

describe("PassThroughAccessFilter", () => {
  it("returns nodes and edges unchanged (Phase-1 no-op)", () => {
    const filter = new PassThroughAccessFilter();
    const nodes = [makeNode("DomainConcept", "n1")];
    const edges = [makeEdge("evaluates", "a", "b", "e1")];
    expect(filter.filterNodes(nodes, ctx())).toBe(nodes);
    expect(filter.filterEdges(edges, ctx())).toBe(edges);
  });
});

describe("access-filter seam is on the hot path of every query", () => {
  async function seed(graph: InMemoryGraphAdapter): Promise<void> {
    await graph.upsertNode(makeNode("Decision", "d", { name: "Authorise" }));
    await graph.upsertNode(makeNode("Rule", "r", { name: "Funds" }));
    await graph.createEdge(makeEdge("evaluates", "d", "r", "x-eval"));
  }

  it("invokes filterNodes with the caller context on getEntry", async () => {
    const graph = new InMemoryGraphAdapter();
    await seed(graph);
    const spy = new SpyAccessFilter();
    const service = new GraphQueryService(graph, { accessFilter: spy });

    await service.getEntry("d", ctx("trace-get"));
    expect(spy.nodeCalls.length).toBeGreaterThan(0);
    expect(spy.nodeCalls.at(-1)?.context.requestId).toBe("trace-get");
  });

  it("invokes filterNodes with the caller context on listEntries", async () => {
    const graph = new InMemoryGraphAdapter();
    await seed(graph);
    const spy = new SpyAccessFilter();
    const service = new GraphQueryService(graph, { accessFilter: spy });

    await service.listEntries({ type: "Decision" }, ctx("trace-list"));
    expect(spy.nodeCalls.at(-1)?.context.requestId).toBe("trace-list");
  });

  it("invokes filterNodes and filterEdges on traverse with includeEdges", async () => {
    const graph = new InMemoryGraphAdapter();
    await seed(graph);
    const spy = new SpyAccessFilter();
    const service = new GraphQueryService(graph, { accessFilter: spy });

    await service.traverse({ startNodeId: "d", direction: "out", maxDepth: 1, includeEdges: true }, ctx("trace-trav"));
    expect(spy.nodeCalls.at(-1)?.context.requestId).toBe("trace-trav");
    expect(spy.edgeCalls.at(-1)?.context.requestId).toBe("trace-trav");
  });

  it("invokes filterEdges on findPaths", async () => {
    const graph = new InMemoryGraphAdapter();
    await seed(graph);
    const spy = new SpyAccessFilter();
    const service = new GraphQueryService(graph, { accessFilter: spy });

    await service.findPaths({ sourceId: "d", targetId: "r" }, ctx("trace-path"));
    expect(spy.edgeCalls.at(-1)?.context.requestId).toBe("trace-path");
  });

  it("a scope-enforcing filter can exclude entries behind the same seam (push-down ready)", async () => {
    const graph = new InMemoryGraphAdapter();
    await seed(graph);
    // A stand-in RBAC filter that hides Rule nodes — proves the seam can drop results
    // without any change to QueryService callers.
    const rbac: AccessFilter = {
      filterNodes: (nodes) => nodes.filter((n) => n.type !== "Rule"),
      filterEdges: (edges) => edges,
    };
    const service = new GraphQueryService(graph, { accessFilter: rbac });

    expect(await service.getEntry("r", ctx())).toBeNull(); // Rule filtered out
    expect((await service.getEntry("d", ctx()))?.entry.id).toBe("d"); // Decision allowed
  });
});
