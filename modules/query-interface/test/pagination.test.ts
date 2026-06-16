import { describe, expect, it } from "vitest";
import { InMemoryGraphAdapter } from "@dkm/knowledge-graph";
import { clampLimit, decodeCursor, encodeCursor, GraphQueryService } from "../src/index";
import { ctx, makeNode } from "./helpers";

describe("cursor encode/decode", () => {
  it("round-trips the last-seen sort key and id", () => {
    const cursor = encodeCursor({ sortValue: "Payment", id: "n-007" });
    expect(typeof cursor).toBe("string");
    expect(decodeCursor(cursor)).toEqual({ sortValue: "Payment", id: "n-007" });
  });

  it("round-trips non-string sort values", () => {
    const cursor = encodeCursor({ sortValue: 42, id: "n-001" });
    expect(decodeCursor(cursor)).toEqual({ sortValue: 42, id: "n-001" });
  });

  it("rejects a malformed cursor", () => {
    expect(() => decodeCursor("not-a-valid-cursor!!")).toThrow();
  });
});

describe("page-size clamping (default 25, max 100)", () => {
  it("defaults to 25 when unspecified or invalid", () => {
    expect(clampLimit(undefined)).toBe(25);
    expect(clampLimit(0)).toBe(25);
    expect(clampLimit(-5)).toBe(25);
  });

  it("clamps to a maximum of 100", () => {
    expect(clampLimit(500)).toBe(100);
    expect(clampLimit(100)).toBe(100);
    expect(clampLimit(26)).toBe(26);
  });
});

describe("listEntries pagination semantics", () => {
  async function seed(graph: InMemoryGraphAdapter, count: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 1; i <= count; i += 1) {
      const id = `n-${i.toString().padStart(3, "0")}`;
      ids.push(id);
      await graph.upsertNode(makeNode("DomainConcept", id, { name: id }));
    }
    return ids;
  }

  it("returns 25/25/10 across three pages for 60 nodes with correct hasMore (acceptance 2)", async () => {
    const graph = new InMemoryGraphAdapter();
    const ids = await seed(graph, 60);
    const service = new GraphQueryService(graph);

    const page1 = await service.listEntries({ type: "DomainConcept", limit: 25 }, ctx());
    expect(page1.items).toHaveLength(25);
    expect(page1.hasMore).toBe(true);

    const page2 = await service.listEntries({ type: "DomainConcept", limit: 25, cursor: page1.cursor! }, ctx());
    expect(page2.items).toHaveLength(25);
    expect(page2.hasMore).toBe(true);

    const page3 = await service.listEntries({ type: "DomainConcept", limit: 25, cursor: page2.cursor! }, ctx());
    expect(page3.items).toHaveLength(10);
    expect(page3.hasMore).toBe(false);
    expect(page3.cursor).toBeNull();

    const seen = [...page1.items, ...page2.items, ...page3.items].map((n) => n.id);
    expect(seen).toEqual(ids); // in order, no duplicates, no skips
  });

  it("is stable across a node inserted mid-paging (no duplicates, no skips)", async () => {
    const graph = new InMemoryGraphAdapter();
    await seed(graph, 4); // n-001..n-004
    const service = new GraphQueryService(graph);

    const page1 = await service.listEntries({ type: "DomainConcept", limit: 2 }, ctx());
    expect(page1.items.map((n) => n.id)).toEqual(["n-001", "n-002"]);

    // A concurrent insert lands *before* the cursor position; cursor-based paging
    // must neither re-emit an already-seen node nor skip a later one.
    await graph.upsertNode(makeNode("DomainConcept", "n-000", { name: "n-000" }));

    const page2 = await service.listEntries({ type: "DomainConcept", limit: 2, cursor: page1.cursor! }, ctx());
    expect(page2.items.map((n) => n.id)).toEqual(["n-003", "n-004"]);
    expect(page2.hasMore).toBe(false);

    // n-000 (inserted behind the cursor) is correctly not surfaced in later pages.
    const all = [...page1.items, ...page2.items].map((n) => n.id);
    expect(new Set(all).size).toBe(all.length);
    expect(all).not.toContain("n-000");
  });

  it("computes totalCount by default and omits it (null) when includeTotal is false", async () => {
    const graph = new InMemoryGraphAdapter();
    await seed(graph, 7);
    const service = new GraphQueryService(graph);

    const withTotal = await service.listEntries({ type: "DomainConcept", limit: 2 }, ctx());
    expect(withTotal.totalCount).toBe(7);

    const withoutTotal = await service.listEntries({ type: "DomainConcept", limit: 2, includeTotal: false }, ctx());
    expect(withoutTotal.totalCount).toBeNull();
    expect(withoutTotal.items).toHaveLength(2); // paging still works
  });

  it("honours a descending sort on a property field", async () => {
    const graph = new InMemoryGraphAdapter();
    await graph.upsertNode(makeNode("DomainConcept", "a", { rank: 1 }));
    await graph.upsertNode(makeNode("DomainConcept", "b", { rank: 2 }));
    await graph.upsertNode(makeNode("DomainConcept", "c", { rank: 3 }));
    const service = new GraphQueryService(graph);

    const page = await service.listEntries(
      { type: "DomainConcept", sort: { field: "rank", direction: "desc" }, limit: 2 },
      ctx(),
    );
    expect(page.items.map((n) => n.id)).toEqual(["c", "b"]);
  });
});
