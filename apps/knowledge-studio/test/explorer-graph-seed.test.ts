import { describe, expect, it, vi } from "vitest";
import { findSeedIds, ROOT_SEED_TYPES } from "../src/explorer/useExplorerGraph";

/**
 * The canvas seeds from the **best available anchor type** rather than only `Subdomain`, so a
 * raw `dkm process` run (which the pipeline can't yet extract Subdomains/BoundedContexts from)
 * still renders its DomainConcepts and their edges instead of a blank graph. `findSeedIds`
 * probes anchor types in layer-priority order and returns the first non-empty set.
 */
describe("canvas root seeding — fallback through anchor layers", () => {
  it("seeds from Subdomain when subdomains exist (unchanged happy path)", async () => {
    const probe = vi.fn(async (type: string) => (type === "Subdomain" ? ["sd-1", "sd-2"] : []));
    expect(await findSeedIds(probe)).toEqual(["sd-1", "sd-2"]);
    expect(probe).toHaveBeenCalledWith("Subdomain");
  });

  it("falls back to the next anchor type when higher ones are empty", async () => {
    // No Subdomain/BoundedContext (a real document run) → seed from DomainConcept.
    const probe = vi.fn(async (type: string) => (type === "DomainConcept" ? ["c-1"] : []));
    expect(await findSeedIds(probe)).toEqual(["c-1"]);
    expect(probe).toHaveBeenCalledWith("Subdomain");
    expect(probe).toHaveBeenCalledWith("BoundedContext");
    expect(probe).toHaveBeenCalledWith("DomainConcept");
  });

  it("stops at the first non-empty type (no needless probing)", async () => {
    const probe = vi.fn(async (type: string) => (type === "Subdomain" ? ["sd-1"] : []));
    await findSeedIds(probe);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("returns no seeds when every type is empty", async () => {
    expect(await findSeedIds(async () => [])).toEqual([]);
  });

  it("prioritises L1 anchors first and is deduplicated", () => {
    expect(ROOT_SEED_TYPES.slice(0, 3)).toEqual(["Subdomain", "BoundedContext", "DomainConcept"]);
    expect(ROOT_SEED_TYPES.filter((t) => t === "DomainConcept")).toHaveLength(1);
  });
});
