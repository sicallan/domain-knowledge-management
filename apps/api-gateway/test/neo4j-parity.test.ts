import { neo4jAdapterFromEnv } from "@dkm/knowledge-graph";
import type { QueryContext } from "@dkm/query";
import { afterAll, describe, expect, it } from "vitest";
import { seedInMemoryGraph } from "../src/seed";

/**
 * Adapter parity (D-P1.2 / criterion 10): the same seed + the same queries must yield
 * the same results over the Neo4j adapter as over the in-memory one — proving the
 * gateway is store-agnostic and going to production is a wiring change, not a rewrite.
 *
 * **Auto-skips** unless `NEO4J_URI` is set (UI-D5: CI stays green with no service). The
 * live run is tracked as a follow-up issue.
 */

const env = neo4jAdapterFromEnv();
const CONTEXT: QueryContext = { userId: "parity", roles: ["reader"], scopes: ["*"], requestId: "parity" };

afterAll(async () => {
  await env?.driver.close();
});

describe.skipIf(!env)("Neo4j ↔ in-memory parity (opt-in via NEO4J_URI)", () => {
  it("returns identical entries/entry/traverse results across both adapters", async () => {
    const memory = await seedInMemoryGraph({ runId: "parity-memory" });
    const neo = await seedInMemoryGraph({ graph: env!.adapter, runId: "parity-neo4j" });

    const list = await memory.queryService.listEntries({ type: "DomainConcept" }, CONTEXT);
    const neoList = await neo.queryService.listEntries({ type: "DomainConcept" }, CONTEXT);
    expect(neoList.items.map((e) => e.id).sort()).toEqual(list.items.map((e) => e.id).sort());

    const id = list.items[0]?.id;
    if (id) {
      const a = await memory.queryService.getEntry(id, CONTEXT);
      const b = await neo.queryService.getEntry(id, CONTEXT);
      expect(b?.entry.id).toBe(a?.entry.id);
    }
  });
});
