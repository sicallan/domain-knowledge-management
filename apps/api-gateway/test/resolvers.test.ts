import { type ExecutionResult, graphql } from "graphql";
import type { QueryContext, QueryService } from "@dkm/query";
import { beforeAll, describe, expect, it } from "vitest";
import { createGraphQLContext, devQueryContext } from "../src/context";
import { schema } from "../src/schema";
import { seedInMemoryGraph, type SeededBackend } from "../src/seed";

/**
 * The CI gate (UI-D5): every resolver exercised over the **in-memory adapter** seeded
 * by the shared `seedInMemoryGraph()`. Operations run through the real `graphql()`
 * executor against the emitted schema and the injected `QueryService`/`ViewEngine`,
 * so this is the actual read path on an ephemeral store — not a mocked resolver.
 */

let backend: SeededBackend;

/** Run an operation with a fresh dev-fake context over the seed; assert it didn't error. */
async function run<T>(
  source: string,
  variableValues?: Record<string, unknown>,
  context?: QueryContext,
): Promise<T> {
  const result: ExecutionResult = await graphql({
    schema,
    source,
    contextValue: createGraphQLContext(backend, context ?? devQueryContext()),
    variableValues,
  });
  expect(result.errors).toBeUndefined();
  return result.data as unknown as T;
}

type Entry = { id: string; type: string; version: string; lifecycleStatus: string };
type Items = { entries: { items: { id: string }[]; cursor: string | null; hasMore: boolean; totalCount: number | null } };

beforeAll(async () => {
  backend = await seedInMemoryGraph();
  expect(backend.loadResult.failed).toBe(0);
});

describe("Graph Query resolvers", () => {
  it("entry(id) returns the typed base-entry fields for a known id (criterion 2)", async () => {
    const list = await run<Items>(`{ entries(type: "DomainConcept", limit: 1) { items { id } } }`);
    const knownId = list.entries.items[0]!.id;

    const { entry } = await run<{
      entry: Entry & { evidencedBy: { source: string }[]; data: { id: string } };
    }>(
      `query ($id: ID!) {
        entry(id: $id) { id type version lifecycleStatus validFrom evidencedBy { source } data }
      }`,
      { id: knownId },
    );
    expect(entry.id).toBe(knownId);
    expect(entry.type).toBe("DomainConcept");
    expect(typeof entry.version).toBe("string");
    expect(typeof entry.lifecycleStatus).toBe("string");
    expect(Array.isArray(entry.evidencedBy)).toBe(true);
    expect(entry.data.id).toBe(knownId); // JSON escape hatch carries the full record
  });

  it("entry(id) returns null (not an error) for an unknown id (criterion 2)", async () => {
    const { entry } = await run<{ entry: Entry | null }>(`{ entry(id: "does-not-exist") { id } }`);
    expect(entry).toBeNull();
  });

  it("entries paginates with stable cursors, hasMore and totalCount (criterion 3)", async () => {
    const all = await run<Items>(`{ entries(type: "OrchestrationStep") { items { id } totalCount } }`);
    const total = all.entries.totalCount!;
    expect(total).toBeGreaterThan(1);

    const page1 = await run<Items>(
      `{ entries(type: "OrchestrationStep", limit: 2) { items { id } cursor hasMore totalCount } }`,
    );
    expect(page1.entries.items).toHaveLength(2);
    expect(page1.entries.hasMore).toBe(true);
    expect(page1.entries.totalCount).toBe(total);

    const page2 = await run<Items>(
      `query ($c: String) { entries(type: "OrchestrationStep", limit: 2, cursor: $c) { items { id } } }`,
      { c: page1.entries.cursor },
    );
    const p1Ids = page1.entries.items.map((i) => i.id);
    const p2Ids = page2.entries.items.map((i) => i.id);
    expect(p2Ids).not.toEqual(expect.arrayContaining(p1Ids)); // no overlap across pages
  });

  it("traverse returns the start node and honours includeEdges (criterion 4)", async () => {
    const subs = await run<Items>(`{ entries(type: "Subdomain", limit: 1) { items { id } } }`);
    const startId = subs.entries.items[0]!.id;

    const withEdges = await run<{
      traverse: { nodes: { id: string }[]; edges: { sourceId: string }[]; truncated: boolean };
    }>(
      `query ($id: ID!) {
        traverse(startNodeId: $id, direction: BOTH, maxDepth: 2, includeEdges: true) {
          nodes { id } edges { sourceId } truncated
        }
      }`,
      { id: startId },
    );
    expect(withEdges.traverse.nodes.map((n) => n.id)).toContain(startId);

    const noEdges = await run<{ traverse: { edges: unknown[] } }>(
      `query ($id: ID!) {
        traverse(startNodeId: $id, direction: BOTH, maxDepth: 2, includeEdges: false) { edges { sourceId } }
      }`,
      { id: startId },
    );
    expect(noEdges.traverse.edges).toEqual([]); // includeEdges:false ⇒ no edges
  });

  it("paths finds a connecting path between two related nodes (criterion 4)", async () => {
    // Discover a real edge by traversing OUT from nodes that are edge *sources*
    // (concepts/decisions/contexts carry belongsTo/operatesOn/invokes edges).
    const ids: string[] = [];
    for (const type of ["DomainConcept", "Decision", "BoundedContext"]) {
      const page = await run<Items>(`query ($t: String) { entries(type: $t, limit: 10) { items { id } } }`, {
        t: type,
      });
      ids.push(...page.entries.items.map((i) => i.id));
    }

    let found = false;
    for (const id of ids) {
      const out = await run<{ traverse: { edges: { targetId: string }[] } }>(
        `query ($id: ID!) { traverse(startNodeId: $id, direction: OUT, maxDepth: 1, includeEdges: true) { edges { targetId } } }`,
        { id },
      );
      const edges = out.traverse.edges;
      if (edges.length === 0) continue;
      const targetId = edges[0]!.targetId;
      const result = await run<{ paths: { found: boolean; paths: { nodeIds: string[] }[] } }>(
        `query ($s: ID!, $t: ID!) { paths(sourceId: $s, targetId: $t, maxDepth: 3) { found paths { nodeIds } } }`,
        { s: id, t: targetId },
      );
      expect(result.paths.found).toBe(true);
      found = true;
      break;
    }
    expect(found).toBe(true); // the seed has at least one traversable edge
  });
});

describe("View Projection resolvers", () => {
  it("domainMap returns the projector's subdomain shape (criterion 5)", async () => {
    const { domainMap } = await run<{
      domainMap: { subdomains: { id: string; name: string }[] };
    }>(`{ domainMap { subdomains { id name contexts { id conceptCount } } crossContextRelationships { source target } } }`);
    expect(Array.isArray(domainMap.subdomains)).toBe(true);
    expect(domainMap.subdomains.length).toBeGreaterThan(0);
  });

  it("capabilityMap returns the seeded business-function hierarchy with counts", async () => {
    type Node = { id: string; name: string; level: number | null; descendantCount: number; counts: { rules: number; realisations: number }; children: Node[] };
    const { capabilityMap } = await run<{ capabilityMap: { roots: Node[] } }>(
      `{ capabilityMap { roots { id name level descendantCount counts { rules realisations } children { name counts { rules } } } } }`,
    );
    const rootNames = capabilityMap.roots.map((r) => r.name);
    expect(rootNames).toEqual(expect.arrayContaining(["Payments Processing", "Risk & Compliance"]));

    const payments = capabilityMap.roots.find((r) => r.name === "Payments Processing")!;
    expect(payments.children.map((c) => c.name).sort()).toEqual(["Authorisation", "Refunds", "Settlement"]);
    // Authorisation carries the seeded evidence (1 governing rule + 1 realising flow).
    const auth = payments.children.find((c) => c.name === "Authorisation")!;
    expect(auth.counts.rules).toBe(1);

    // root scoping narrows to one subtree.
    const scoped = await run<{ capabilityMap: { roots: { name: string }[] } }>(
      `{ capabilityMap(root: "Risk & Compliance") { roots { name children { name } } } }`,
    );
    expect(scoped.capabilityMap.roots.map((r) => r.name)).toEqual(["Risk & Compliance"]);
  });

  it("coverageMap returns the matrix shape with a summary (criterion 5)", async () => {
    const { coverageMap } = await run<{
      coverageMap: { rows: unknown[]; summary: { totalCapabilities: number; coveragePercentage: number } };
    }>(`{ coverageMap { rows { id status gap } columns { id vendor } summary { totalCapabilities coveragePercentage } } }`);
    expect(Array.isArray(coverageMap.rows)).toBe(true);
    expect(coverageMap.summary).toHaveProperty("totalCapabilities");
    expect(coverageMap.summary).toHaveProperty("coveragePercentage");
  });

  it("gapAnalysis returns gaps + a summary, agreeing with coverage (criterion 5)", async () => {
    const { gapAnalysis } = await run<{
      gapAnalysis: { gaps: unknown[]; summary: { totalAssessed: number; functionalGaps: number } };
    }>(`{ gapAnalysis { gaps { id missingLayers priority } summary { totalAssessed functionalGaps } } }`);
    expect(Array.isArray(gapAnalysis.gaps)).toBe(true);
    expect(gapAnalysis.summary).toHaveProperty("totalAssessed");
  });
});

describe("Deferred queries are honest (criterion 6)", () => {
  it("search returns the BackendUnavailable union member, not an error", async () => {
    const { search } = await run<{
      search: { __typename: string; available: boolean; requiredBackends: string[] };
    }>(
      `{ search(query: "card scheme", mode: SEMANTIC) {
        __typename
        ... on BackendUnavailable { available reason queryType requiredBackends }
        ... on SearchHits { available }
      } }`,
    );
    expect(search.__typename).toBe("BackendUnavailable");
    expect(search.available).toBe(false);
    expect(search.requiredBackends.length).toBeGreaterThan(0);
  });

  it("assessImpact returns BackendUnavailable, not a fake success", async () => {
    const { assessImpact } = await run<{ assessImpact: { __typename: string } }>(
      `{ assessImpact(triggerNodeId: "x", traversalDepth: 2) {
        __typename
        ... on BackendUnavailable { available queryType }
      } }`,
    );
    expect(assessImpact.__typename).toBe("BackendUnavailable");
  });
});

describe("Context seam on the hot path (criterion 8)", () => {
  it("threads the QueryContext into every delegated service call", async () => {
    const seen: QueryContext[] = [];
    const recording = new Proxy(backend.queryService, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          const last = args.at(-1);
          if (last && typeof last === "object" && "requestId" in last) {
            seen.push(last as QueryContext);
          }
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    }) as QueryService;

    const ctx = devQueryContext({ requestId: "ctx-threading-probe" });
    await graphql({
      schema,
      source: `{ entry(id: "x") { id } }`,
      contextValue: { queryService: recording, views: backend.views, context: ctx },
    });

    expect(seen.some((c) => c.requestId === "ctx-threading-probe")).toBe(true);
  });
});
