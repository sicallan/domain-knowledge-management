import { describe, expect, it } from "vitest";
import type { JsonlEntry } from "@dkm/schema";
import { toAsyncIterable } from "./port";
import type { LoaderPortFactory } from "./port";

let seq = 0;
function makeJsonl(overrides: Partial<JsonlEntry> = {}): JsonlEntry {
  seq += 1;
  return {
    id: `entry-${seq}`,
    type: "DomainConcept",
    version: "1.0.0",
    source: { file: "spec.md", location: "§1", fetchedAt: "2026-01-01T00:00:00Z", sourceAuthority: "scheme" },
    confidence: 0.9,
    extractedAt: "2026-01-01T01:00:00Z",
    data: { name: "Payment", conceptType: "aggregate" },
    ...overrides,
  };
}

/**
 * Adapter-agnostic contract test suite for {@link LoaderPort} (spec 003). Uses
 * only the public port API so any loader — the in-memory stub, a future graph or
 * vector loader — can be validated against it.
 */
export function runLoaderPortContractTests(name: string, factory: LoaderPortFactory): void {
  describe(`LoaderPort contract — ${name}`, () => {
    it("reports healthy only after initialize", async () => {
      const loader = await factory();
      expect((await loader.healthCheck()).healthy).toBe(false);
      await loader.initialize({});
      expect((await loader.healthCheck()).healthy).toBe(true);
    });

    it("loads a stream of entries and reports accurate counts", async () => {
      const loader = await factory();
      await loader.initialize({});
      const entries = [makeJsonl(), makeJsonl(), makeJsonl()];
      const result = await loader.load(toAsyncIterable(entries), "run-1");
      expect(result.totalEntries).toBe(3);
      expect(result.loaded).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.runId).toBe("run-1");
    });

    it("is idempotent — re-running the same run skips already-processed entries", async () => {
      const loader = await factory();
      await loader.initialize({});
      const entries = [makeJsonl(), makeJsonl()];
      await loader.load(toAsyncIterable(entries), "run-2");
      const second = await loader.load(toAsyncIterable(entries), "run-2");
      expect(second.skipped).toBe(2);
      expect(second.loaded).toBe(0);
    });

    it("tracks processed entries by (entryId, runId)", async () => {
      const loader = await factory();
      await loader.initialize({});
      const entry = makeJsonl();
      expect(await loader.hasProcessed(entry.id, "run-3")).toBe(false);
      await loader.loadSingle(entry, "run-3");
      expect(await loader.hasProcessed(entry.id, "run-3")).toBe(true);
      // Same entry id, different run, is a separate unit of work.
      expect(await loader.hasProcessed(entry.id, "run-other")).toBe(false);
    });

    it("skips bad entries and continues (skip-and-continue, non-retriable)", async () => {
      const loader = await factory();
      await loader.initialize({});
      const good = makeJsonl();
      const bad = makeJsonl();
      delete (bad as Partial<JsonlEntry>).data;
      const result = await loader.load(toAsyncIterable([good, bad]), "run-4");
      expect(result.loaded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors[0]?.retriable).toBe(false);
      // The good entry still loaded despite the bad one.
      expect(await loader.hasProcessed(good.id, "run-4")).toBe(true);
    });

    it("rolls back a run, clearing its processed marks", async () => {
      const loader = await factory();
      await loader.initialize({});
      const entries = [makeJsonl(), makeJsonl()];
      await loader.load(toAsyncIterable(entries), "run-5");
      expect(await loader.hasProcessed(entries[0]!.id, "run-5")).toBe(true);
      await loader.rollbackRun("run-5");
      expect(await loader.hasProcessed(entries[0]!.id, "run-5")).toBe(false);
      // Re-loading after rollback loads fresh (not skipped).
      const after = await loader.load(toAsyncIterable(entries), "run-5");
      expect(after.loaded).toBe(2);
    });

    it("declares the JSONL fields it requires", async () => {
      const loader = await factory();
      expect(Array.isArray(loader.requiredFields)).toBe(true);
    });
  });
}
