import { fileURLToPath } from "node:url";
import { InMemoryGraphAdapter } from "@dkm/knowledge-graph";
import { describe, expect, it } from "vitest";
import {
  GraphLoader,
  InMemoryVectorIndex,
  MultiLoaderOrchestrator,
  VectorLoader,
} from "../src/index";
import type { Embedder, RunFiles } from "../src/index";

const FILES: RunFiles = {
  entities: fileURLToPath(new URL("./fixtures/run-001-extractions.jsonl", import.meta.url)),
  relationships: fileURLToPath(new URL("./fixtures/run-001-relationships.jsonl", import.meta.url)),
};

describe("MultiLoaderOrchestrator — graph + vector loaders over one run (OCP, parallel, independent failure)", () => {
  it("fans one run's JSONL to both loaders in parallel — graph populated AND entities indexed", async () => {
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
    expect(result.results).toHaveLength(2);

    // Loaders are pushed in registration order: [graph, vector].
    const [graphResult, vectorResult] = result.results;
    expect(graphResult?.loaded).toBe(6); // 4 entities + 2 relationships
    expect(vectorResult?.loaded).toBe(4); // 4 entities embedded
    expect(vectorResult?.skipped).toBe(2); // 2 relationships ignored

    // Graph store populated; vector index holds exactly the four entities.
    expect(await graph.findByType("Decision")).toHaveLength(1);
    expect(index.size()).toBe(4);
  });

  it("isolates a forced vector-loader error — the graph loader still succeeds (independent failure)", async () => {
    const graph = new InMemoryGraphAdapter();
    const graphLoader = new GraphLoader(graph);
    // A throwing embedder simulates a transient vector-store fault; the loader surfaces it.
    const boom: Embedder = {
      dimension: 16,
      embed: async () => {
        throw new Error("embedder unavailable");
      },
    };
    const vectorLoader = new VectorLoader({ embedder: boom });
    await graphLoader.initialize({});
    await vectorLoader.initialize({});

    const orchestrator = new MultiLoaderOrchestrator();
    orchestrator.registerLoader(graphLoader);
    orchestrator.registerLoader(vectorLoader);

    const result = await orchestrator.executeRun(FILES, "run-err");
    expect(result.results).toHaveLength(2);

    // The graph loader completed fully despite the vector loader failing.
    const [graphResult, vectorResult] = result.results;
    expect(graphResult?.loaded).toBe(6);
    expect(graphResult?.failed).toBe(0);
    expect(await graph.findByType("Decision")).toHaveLength(1);

    // The vector-loader's error is surfaced per-loader, not swallowed and not blocking.
    expect(vectorResult?.errors.some((e) => /embedder unavailable/.test(e.error))).toBe(true);
    expect(result.succeeded).toBe(false);
  });
});
