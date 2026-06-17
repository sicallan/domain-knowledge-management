import { describe, expect, it } from "vitest";
import { DefaultViewEngine, DomainMapProjector } from "../src/index";
import type { DomainMapView, ViewProjector } from "../src/index";
import { buildService, ctx, seededInMemoryGraph } from "./helpers";

/**
 * A projector implementing ONLY the closed-minimum port (viewType, project,
 * invalidatedBy) — no `describe`/`entriesIncluded`. Proves the spec-007 interface
 * verbatim is sufficient to register a new view with no engine change (OCP).
 */
class StubProjector implements ViewProjector<Record<string, unknown>, { ok: boolean }> {
  readonly viewType = "stub-view";
  async project(): Promise<{ ok: boolean }> {
    return { ok: true };
  }
  invalidatedBy(): boolean {
    return false;
  }
}

async function buildEngine(): Promise<DefaultViewEngine> {
  const service = buildService(await seededInMemoryGraph());
  const engine = new DefaultViewEngine(service);
  engine.registerProjector(new DomainMapProjector(service));
  return engine;
}

describe("DefaultViewEngine — registry & dispatch", () => {
  it("lists a registered projector's metadata", async () => {
    const engine = await buildEngine();
    const views = engine.listViews();
    const domainMap = views.find((v) => v.viewType === "domain-map");
    expect(domainMap).toBeDefined();
    expect(domainMap?.refreshPolicy).toBe("on-demand");
  });

  it("getView dispatches to the registered projector and wraps with metadata", async () => {
    const engine = await buildEngine();
    const result = await engine.getView<DomainMapView>("domain-map", {}, ctx());
    expect(result.metadata.viewType).toBe("domain-map");
    expect(result.metadata.cacheHit).toBe(false);
    expect(result.metadata.stale).toBe(false);
    expect(result.data.subdomains.length).toBeGreaterThan(0);
  });

  it("getView throws cleanly for an unknown viewType", async () => {
    const engine = await buildEngine();
    await expect(engine.getView("does-not-exist", {}, ctx())).rejects.toThrow(/does-not-exist/);
  });

  it("refreshView resolves for a known on-demand view and rejects an unknown viewType", async () => {
    const engine = await buildEngine();
    await expect(engine.refreshView("domain-map", {})).resolves.toBeUndefined();
    await expect(engine.refreshView("nope", {})).rejects.toThrow(/nope/);
  });
});

describe("DefaultViewEngine — OCP: a second projector does not disturb the first", () => {
  it("registers a closed-minimum stub projector with no engine change", async () => {
    const engine = await buildEngine();

    // Baseline: Domain Map works.
    const before = await engine.getView<DomainMapView>("domain-map", {}, ctx());
    const beforeSubdomains = before.data.subdomains.length;

    // Register a second, unrelated projector implementing only the verbatim port.
    engine.registerProjector(new StubProjector());

    // Both views are now listed.
    const types = engine.listViews().map((v) => v.viewType).sort();
    expect(types).toEqual(["domain-map", "stub-view"]);

    // The stub dispatches; the engine synthesises default metadata for it.
    const stub = await engine.getView<{ ok: boolean }>("stub-view", {}, ctx());
    expect(stub.data.ok).toBe(true);
    expect(stub.metadata.viewType).toBe("stub-view");
    expect(stub.metadata.cacheHit).toBe(false);

    // Existing Domain Map behaviour is unchanged.
    const after = await engine.getView<DomainMapView>("domain-map", {}, ctx());
    expect(after.data.subdomains.length).toBe(beforeSubdomains);
    expect(after.data).toEqual(before.data);
  });

  it("re-registering the same viewType replaces the projector (last wins)", async () => {
    const service = buildService(await seededInMemoryGraph());
    const engine = new DefaultViewEngine(service);
    engine.registerProjector(new StubProjector());
    engine.registerProjector(new StubProjector());
    expect(engine.listViews().filter((v) => v.viewType === "stub-view")).toHaveLength(1);
  });
});
