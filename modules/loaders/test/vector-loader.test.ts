import { describe, expect, it } from "vitest";
import type { JsonlEntry } from "@dkm/schema";
import {
  EMBEDDING_DIMENSION,
  FakeEmbedder,
  InMemoryVectorIndex,
  toAsyncIterable,
  VectorLoader,
} from "../src/index";

function entity(id: string, data: Record<string, unknown> = { name: "Payment", conceptType: "aggregate" }): JsonlEntry {
  return {
    id,
    type: "DomainConcept",
    version: "1.0.0",
    source: { file: "payments/authorisation.md", location: "§1", fetchedAt: "2026-01-01T00:00:00Z", sourceAuthority: "scheme" },
    confidence: 0.9,
    extractedAt: "2026-01-02T00:00:00Z",
    data,
  };
}

function relationship(id: string): JsonlEntry {
  return {
    id,
    type: "Relationship",
    version: "1.0.0",
    source: { file: "payments/authorisation.md", location: "§2", fetchedAt: "2026-01-01T00:00:00Z", sourceAuthority: "scheme" },
    confidence: 0.88,
    extractedAt: "2026-01-02T00:00:00Z",
    data: { relationshipType: "evaluates", sourceEntityId: "e-a", targetEntityId: "e-b" },
  };
}

describe("FakeEmbedder — deterministic, fixed-dimension vectors", () => {
  it("returns an identical vector for identical text (deterministic) of the fixed dimension", async () => {
    const embedder = new FakeEmbedder();
    const [a] = await embedder.embed(["Authorise Payment"]);
    const [b] = await embedder.embed(["Authorise Payment"]);
    expect(a).toHaveLength(EMBEDDING_DIMENSION);
    expect(a).toEqual(b);
  });

  it("returns a different vector for different text", async () => {
    const embedder = new FakeEmbedder();
    const [a] = await embedder.embed(["Authorise Payment"]);
    const [b] = await embedder.embed(["Sufficient Funds"]);
    expect(a).not.toEqual(b);
  });

  it("embeds a batch positionally and honours a custom dimension", async () => {
    const embedder = new FakeEmbedder(8);
    expect(embedder.dimension).toBe(8);
    const vectors = await embedder.embed(["one", "two", "three"]);
    expect(vectors).toHaveLength(3);
    expect(vectors.every((v) => v.length === 8)).toBe(true);
  });
});

describe("VectorLoader — entity → in-memory index", () => {
  it("embeds an entity into an index record carrying the embedding and a payload", async () => {
    const index = new InMemoryVectorIndex();
    const loader = new VectorLoader({ index });
    await loader.initialize({});

    const result = await loader.load(toAsyncIterable([entity("e1")]), "run-1");
    expect(result.loaded).toBe(1);
    expect(result.failed).toBe(0);

    const record = index.get("e1");
    expect(record).toBeDefined();
    expect(record?.runId).toBe("run-1");
    expect(record?.embedding).toHaveLength(EMBEDDING_DIMENSION);
    expect(record?.payload.type).toBe("DomainConcept");
  });

  it("derives embed text from name/description, falling back to JSON when absent", async () => {
    const index = new InMemoryVectorIndex();
    const loader = new VectorLoader({ index });
    await loader.initialize({});
    // No name/description — must still index (text = JSON-stringified data), no crash.
    await loader.load(toAsyncIterable([entity("e1", { conceptType: "aggregate" })]), "run-1");
    expect(index.get("e1")?.embedding).toHaveLength(EMBEDDING_DIMENSION);
  });

  it("ignores relationship entries without error (acceptance 5) — they are not indexed", async () => {
    const index = new InMemoryVectorIndex();
    const loader = new VectorLoader({ index });
    await loader.initialize({});

    const result = await loader.load(toAsyncIterable([entity("e1"), relationship("r1")]), "run-1");
    expect(result.totalEntries).toBe(2);
    expect(result.loaded).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
    expect(index.has("e1")).toBe(true);
    expect(index.has("r1")).toBe(false);
    expect(index.size()).toBe(1);
  });

  it("is idempotent — re-running the same runId skips and does not re-index (acceptance 7)", async () => {
    const index = new InMemoryVectorIndex();
    const loader = new VectorLoader({ index });
    await loader.initialize({});
    const entries = [entity("e1"), entity("e2", { name: "Authorise", decisionType: "automated" })];

    await loader.load(toAsyncIterable(entries), "run-1");
    const first = index.get("e1");

    const second = await loader.load(toAsyncIterable(entries), "run-1");
    expect(second.skipped).toBe(2);
    expect(second.loaded).toBe(0);
    expect(index.size()).toBe(2);
    // Skipped entries are not re-embedded — the existing record object is untouched.
    expect(index.get("e1")).toBe(first);
  });

  it("rolls back a run, removing its vectors and clearing its processed marks", async () => {
    const index = new InMemoryVectorIndex();
    const loader = new VectorLoader({ index });
    await loader.initialize({});
    await loader.load(toAsyncIterable([entity("e1"), entity("e2")]), "run-1");
    expect(index.size()).toBe(2);
    expect(await loader.hasProcessed("e1", "run-1")).toBe(true);

    await loader.rollbackRun("run-1");
    expect(index.size()).toBe(0);
    expect(await loader.hasProcessed("e1", "run-1")).toBe(false);
  });

  it("fails an entry missing required `data` with a clear non-retriable error (acceptance 8)", async () => {
    const loader = new VectorLoader();
    await loader.initialize({});
    const bad = entity("e1");
    delete (bad as Partial<JsonlEntry>).data;

    const result = await loader.load(toAsyncIterable([bad as JsonlEntry]), "run-1");
    expect(result.failed).toBe(1);
    expect(result.errors[0]?.entryId).toBe("e1");
    expect(result.errors[0]?.retriable).toBe(false);
    expect(result.errors[0]?.error).toMatch(/data/);
  });

  it("declares its target store and required fields per spec 003", () => {
    const loader = new VectorLoader();
    expect(loader.name).toBe("vector-loader");
    expect(loader.targetStore).toBe("in-memory-vector");
    expect(loader.requiredFields).toEqual(["data"]);
    expect(loader.orderedProcessing).toBe(false);
  });
});
