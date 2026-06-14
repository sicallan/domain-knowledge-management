import { describe, expect, it } from "vitest";
import type { JsonlEntry } from "@dkm/schema";
import { runLoaderPortContractTests } from "../src/contract";
import { InMemoryLoaderStub, toAsyncIterable } from "../src/index";

// The in-memory stub must satisfy the full LoaderPort contract.
runLoaderPortContractTests("InMemoryLoaderStub", () => new InMemoryLoaderStub());

// Stub-specific: prove JSONL entries are mapped into the store (0b.4 acceptance).
describe("InMemoryLoaderStub — JSONL → store mapping", () => {
  function entry(id: string): JsonlEntry {
    return {
      id,
      type: "Decision",
      version: "1.0.0",
      source: { file: "log.csv", location: "row:1", fetchedAt: "2026-01-01T00:00:00Z", sourceAuthority: "project" },
      confidence: 0.92,
      extractedAt: "2026-01-01T01:00:00Z",
      data: { name: "CSM Selection", decisionType: "manual", outcomes: ["Selected TIPS"] },
    };
  }

  it("stores each loaded entry keyed by id and preserves its payload", async () => {
    const stub = new InMemoryLoaderStub();
    await stub.initialize({});
    await stub.load(toAsyncIterable([entry("a1"), entry("b2")]), "run-x");
    expect(stub.size()).toBe(2);
    expect(stub.getEntry("a1")?.data.name).toBe("CSM Selection");
    expect(stub.getLoaded().map((e) => e.id).sort()).toEqual(["a1", "b2"]);
  });

  it("removes mapped entries on rollback", async () => {
    const stub = new InMemoryLoaderStub();
    await stub.initialize({});
    await stub.load(toAsyncIterable([entry("a1")]), "run-y");
    expect(stub.size()).toBe(1);
    await stub.rollbackRun("run-y");
    expect(stub.size()).toBe(0);
  });
});
