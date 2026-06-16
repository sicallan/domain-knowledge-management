import { describe, expect, it } from "vitest";
import { InMemoryGraphAdapter } from "@dkm/knowledge-graph";
import { GraphQueryService, routeQuery } from "../src/index";
import type { BackendUnavailableResult, QueryMetric } from "../src/index";
import { ctx } from "./helpers";

describe("routeQuery — backend mapping (spec 006 §Query Routing)", () => {
  it("routes the graph-served query types to the graph backend and marks them available", () => {
    for (const type of ["entityLookup", "typeListing", "traversal", "pathFinding", "impact"] as const) {
      const plan = routeQuery(type);
      expect(plan.backends).toEqual(["graph"]);
      expect(plan.available).toBe(true);
    }
  });

  it("routes semanticSearch to vector with a graph fallback — unavailable in Phase 1", () => {
    const plan = routeQuery("semanticSearch");
    expect(plan.backends).toEqual(["vector"]);
    expect(plan.fallback).toEqual(["graph"]);
    expect(plan.available).toBe(false);
  });

  it("routes faceted/temporal/full-text to PostgreSQL — unavailable in Phase 1", () => {
    for (const type of ["facetedBrowse", "temporal", "fullText"] as const) {
      const plan = routeQuery(type);
      expect(plan.backends).toEqual(["postgresql"]);
      expect(plan.available).toBe(false);
    }
  });

  it("routes hybrid to vector+graph with reciprocal rank fusion — unavailable in Phase 1", () => {
    const plan = routeQuery("hybrid");
    expect(plan.backends).toEqual(["vector", "graph"]);
    expect(plan.merge).toBe("reciprocalRankFusion");
    expect(plan.available).toBe(false);
  });
});

describe("Phase-1 unavailable branches return a documented structured result (acceptance 5)", () => {
  function assertUnavailable(result: { available: boolean }): asserts result is BackendUnavailableResult {
    expect(result.available).toBe(false);
    const unavailable = result as BackendUnavailableResult;
    expect(typeof unavailable.reason).toBe("string");
    expect(unavailable.reason.length).toBeGreaterThan(0);
    expect(unavailable.requiredBackends.length).toBeGreaterThan(0);
  }

  it("search returns a structured 'backend unavailable' result, never throws", async () => {
    const service = new GraphQueryService(new InMemoryGraphAdapter());
    const semantic = await service.search({ query: "card payments", mode: "semantic" }, ctx());
    assertUnavailable(semantic);
    expect(semantic.queryType).toBe("semanticSearch");

    const keyword = await service.search({ query: "card", mode: "keyword" }, ctx());
    assertUnavailable(keyword);
    expect(keyword.queryType).toBe("fullText");

    const hybrid = await service.search({ query: "card", mode: "hybrid" }, ctx());
    assertUnavailable(hybrid);
    expect(hybrid.queryType).toBe("hybrid");
  });

  it("assessImpact returns a structured Phase-4 deferral, never throws", async () => {
    const service = new GraphQueryService(new InMemoryGraphAdapter());
    const result = await service.assessImpact({ triggerNodeId: "d", traversalDepth: 3 }, ctx());
    assertUnavailable(result);
    expect(result.queryType).toBe("impact");
  });

  it("getDiff returns a structured 'backend unavailable' result, never throws", async () => {
    const service = new GraphQueryService(new InMemoryGraphAdapter());
    const result = await service.getDiff("d", "2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z", ctx());
    assertUnavailable(result);
    expect(result.queryType).toBe("temporal");
  });

  it("getStateAtTime returns null in Phase 1 (temporal reads deferred), never throws", async () => {
    const service = new GraphQueryService(new InMemoryGraphAdapter());
    const result = await service.getStateAtTime("d", "2026-01-01T00:00:00Z", ctx());
    expect(result).toBeNull();
  });

  it("emits metrics for unavailable branches with no backend called", async () => {
    const metrics: QueryMetric[] = [];
    const service = new GraphQueryService(new InMemoryGraphAdapter(), { metrics: (m) => metrics.push(m) });
    await service.search({ query: "x", mode: "semantic" }, ctx("trace-unavailable"));
    const metric = metrics.at(-1);
    expect(metric?.queryType).toBe("semanticSearch");
    expect(metric?.backendsCalled).toEqual([]);
    expect(metric?.requestId).toBe("trace-unavailable");
  });
});
