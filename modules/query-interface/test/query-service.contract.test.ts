import { afterAll, describe, it } from "vitest";
import { InMemoryGraphAdapter, neo4jAdapterFromEnv } from "@dkm/knowledge-graph";
import type { GraphPort } from "@dkm/knowledge-graph";
import { GraphQueryService } from "../src/index";
import type { QueryMetric } from "../src/index";
import { runQueryServiceContractTests } from "../src/contract";
import type { QueryServiceContractHarness } from "../src/contract";

// The adapter-agnostic QueryService contract suite (feature 04 §6) runs against
// EVERY graph adapter, proving identical results in-memory vs Neo4j (acceptance
// criterion 7). The in-memory adapter is the CI gate and always runs; the Neo4j
// adapter runs the *identical* suite but only when NEO4J_URI is configured, so it
// is never a CI gate and needs no external service by default.
//
// To exercise the Neo4j variant locally:
//
//   docker run -d --rm -p 7687:7687 -e NEO4J_AUTH=neo4j/testpassword neo4j:5
//   NEO4J_URI=bolt://localhost:7687 NEO4J_USER=neo4j NEO4J_PASSWORD=testpassword \
//     pnpm exec vitest run modules/query-interface

function harnessFor(graph: GraphPort): QueryServiceContractHarness {
  const metrics: QueryMetric[] = [];
  const service = new GraphQueryService(graph, { metrics: (m) => metrics.push(m) });
  return { graph, service, metrics };
}

runQueryServiceContractTests("InMemoryGraphAdapter", () => harnessFor(new InMemoryGraphAdapter()));

const neo4j = neo4jAdapterFromEnv();
if (neo4j) {
  const { adapter, driver } = neo4j;
  afterAll(async () => {
    await adapter.clear();
    await driver.close();
  });
  // A fresh, empty graph per test: the contract suite calls the factory once per
  // `it`, so clear the database before handing the shared adapter back.
  runQueryServiceContractTests("Neo4jGraphAdapter", async () => {
    await adapter.clear();
    return harnessFor(adapter);
  });
} else {
  describe.skip("QueryService contract — Neo4jGraphAdapter (set NEO4J_URI to run)", () => {
    it("is skipped without a configured Neo4j — never a CI gate (D-P1.2)", () => {
      /* intentionally empty: documents the guarded, opt-in adapter-parity path */
    });
  });
}
