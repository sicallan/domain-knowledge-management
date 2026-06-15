import { fileURLToPath } from "node:url";
import { InMemoryGraphAdapter } from "@dkm/knowledge-graph";
import { describe, expect, it } from "vitest";
import { GraphLoader, InMemoryLoaderStub, MultiLoaderOrchestrator } from "../src/index";
import type { RunFiles } from "../src/index";

const FILES: RunFiles = {
  entities: fileURLToPath(new URL("./fixtures/run-001-extractions.jsonl", import.meta.url)),
  relationships: fileURLToPath(new URL("./fixtures/run-001-relationships.jsonl", import.meta.url)),
};

describe("MultiLoaderOrchestrator", () => {
  it("runs the graph-loader over a run's two JSONL files → populated graph (end-to-end)", async () => {
    const graph = new InMemoryGraphAdapter();
    const loader = new GraphLoader(graph);
    await loader.initialize({});

    const orchestrator = new MultiLoaderOrchestrator();
    orchestrator.registerLoader(loader);

    const result = await orchestrator.executeRun(FILES, "run-001");
    expect(result.succeeded).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.loaded).toBe(6);

    // The graph is populated and queryable: source → JSONL → loader → graph.
    expect(await graph.findByType("Decision")).toHaveLength(1);
    expect(await graph.getEdges("e-authorise", "out")).toHaveLength(2);

    const status = await orchestrator.getRunStatus("run-001");
    expect(status?.state).toBe("completed");
    expect(status?.completedAt).toBeTruthy();
  });

  it("OCP — a second loader registers and runs over the SAME files with no change to loader/orchestrator", async () => {
    const graph = new InMemoryGraphAdapter();
    const graphLoader = new GraphLoader(graph);
    // A stand-in for Feature 07's future vector loader: a different LoaderPort, added
    // purely via registerLoader() — proving the closed surfaces hold.
    const secondLoader = new InMemoryLoaderStub();
    await graphLoader.initialize({});
    await secondLoader.initialize({});

    const orchestrator = new MultiLoaderOrchestrator();
    orchestrator.registerLoader(graphLoader);
    orchestrator.registerLoader(secondLoader);

    const result = await orchestrator.executeRun(FILES, "run-ocp");
    expect(result.succeeded).toBe(true);
    expect(result.results).toHaveLength(2);
    // Both loaders consumed the same 6-entry stream independently.
    expect(result.results.every((r) => r.loaded === 6)).toBe(true);
    expect(await graph.findByType("Decision")).toHaveLength(1);
    expect(secondLoader.size()).toBe(6);
  });

  it("rejects registering two loaders with the same name", () => {
    const orchestrator = new MultiLoaderOrchestrator();
    orchestrator.registerLoader(new GraphLoader(new InMemoryGraphAdapter()));
    expect(() => orchestrator.registerLoader(new GraphLoader(new InMemoryGraphAdapter()))).toThrow(
      /already registered/,
    );
  });

  it("replayLoader is idempotent — a replay of a completed run skips every entry", async () => {
    const graph = new InMemoryGraphAdapter();
    const loader = new GraphLoader(graph);
    await loader.initialize({});
    const orchestrator = new MultiLoaderOrchestrator();
    orchestrator.registerLoader(loader);

    await orchestrator.executeRun(FILES, "run-replay");
    const replay = await orchestrator.replayLoader("graph-loader", FILES, "run-replay");
    expect(replay.totalEntries).toBe(6);
    expect(replay.skipped).toBe(6);
    expect(replay.loaded).toBe(0);
  });

  it("replayLoader throws for an unregistered loader", async () => {
    const orchestrator = new MultiLoaderOrchestrator();
    await expect(orchestrator.replayLoader("nope", FILES, "r")).rejects.toThrow(/no loader named/);
  });
});
