import { fileURLToPath } from "node:url";
import { InMemoryGraphAdapter } from "@dkm/knowledge-graph";
import { describe, expect, it } from "vitest";
import {
  GraphLoader,
  InMemoryVectorIndex,
  MultiLoaderOrchestrator,
  VectorLoader,
} from "../src/index";
import type { RunFiles } from "../src/index";

const FILES: RunFiles = {
  entities: fileURLToPath(new URL("./fixtures/run-001-extractions.jsonl", import.meta.url)),
  relationships: fileURLToPath(new URL("./fixtures/run-001-relationships.jsonl", import.meta.url)),
};

// The four inventory entities in the shared Feature-02 fixture.
const ENTITY_IDS = ["e-authorise", "e-funds", "e-limits", "e-payment"];

describe("extract once, load many — one run's JSONL → graph AND vector index", () => {
  it("loads the same extraction into both stores with no re-extraction (the OCP demo)", async () => {
    const graph = new InMemoryGraphAdapter();
    const graphLoader = new GraphLoader(graph);
    const index = new InMemoryVectorIndex();
    const vectorLoader = new VectorLoader({ index });
    await graphLoader.initialize({});
    await vectorLoader.initialize({});

    const orchestrator = new MultiLoaderOrchestrator();
    orchestrator.registerLoader(graphLoader);
    orchestrator.registerLoader(vectorLoader);

    const result = await orchestrator.executeRun(FILES, "run-001");
    expect(result.succeeded).toBe(true);

    // "Load many" #1 — the graph is populated and queryable.
    expect((await graph.findByType("DomainConcept")).map((n) => n.name)).toEqual(["Payment"]);
    expect(await graph.findByType("Decision")).toHaveLength(1);
    expect(await graph.getEdges("e-authorise", "out")).toHaveLength(2);

    // "Load many" #2 — the vector index holds the SAME entities from the SAME run.
    expect(index.all().map((r) => r.entryId).sort()).toEqual(ENTITY_IDS);
    expect(index.all().every((r) => r.runId === "run-001")).toBe(true);
    // The graph's nodes and the vector index agree on the entity set.
    const graphEntityIds = [
      ...(await graph.findByType("DomainConcept")),
      ...(await graph.findByType("Decision")),
      ...(await graph.findByType("Rule")),
      ...(await graph.findByType("ReferenceData")),
    ]
      .map((n) => n.id)
      .sort();
    expect(graphEntityIds).toEqual(ENTITY_IDS);
  });
});
