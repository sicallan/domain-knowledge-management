import { afterAll, describe, it } from "vitest";
import { runGraphPortContractTests } from "../src/contract";
import { InMemoryGraphAdapter, neo4jAdapterFromEnv } from "../src/index";

// The adapter-agnostic GraphPort contract suite (spec 002 "Port Contract Test
// Suite") runs against EVERY adapter. The in-memory adapter is the CI gate and
// always runs; the Neo4j adapter (D-P1.2) runs the *identical* suite but only
// when a NEO4J_URI is configured, so it is never a CI gate and needs no external
// service by default.
//
// To exercise the Neo4j variant locally:
//
//   docker run -d --rm -p 7687:7687 -e NEO4J_AUTH=neo4j/testpassword neo4j:5
//   NEO4J_URI=bolt://localhost:7687 NEO4J_USER=neo4j NEO4J_PASSWORD=testpassword \
//     pnpm exec vitest run modules/knowledge-graph

runGraphPortContractTests("InMemoryGraphAdapter", () => new InMemoryGraphAdapter());

const neo4j = neo4jAdapterFromEnv();
if (neo4j) {
  const { adapter, driver } = neo4j;
  afterAll(async () => {
    await adapter.clear();
    await driver.close();
  });
  // A fresh, empty graph per test: the contract suite calls the factory once per
  // `it`, so clear the database before handing the shared adapter back.
  runGraphPortContractTests("Neo4jGraphAdapter", async () => {
    await adapter.clear();
    return adapter;
  });
} else {
  describe.skip("GraphPort contract — Neo4jGraphAdapter (set NEO4J_URI to run)", () => {
    it("is skipped without a configured Neo4j — never a CI gate (D-P1.2)", () => {
      /* intentionally empty: documents the guarded, opt-in integration path */
    });
  });
}
