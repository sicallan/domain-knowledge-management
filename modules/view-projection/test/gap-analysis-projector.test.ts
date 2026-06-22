import { describe, expect, it } from "vitest";
import type { GraphMutationEvent } from "@dkm/knowledge-graph";
import { GapAnalysisProjector } from "../src/index";
import type { GapAnalysisParams, GapAnalysisView } from "../src/index";
import { buildService, ctx, seededCoverageGraph } from "./helpers";

async function project(params: GapAnalysisParams = {}): Promise<GapAnalysisView> {
  const projector = new GapAnalysisProjector(buildService(await seededCoverageGraph()));
  return projector.project(params, ctx());
}

const ids = (view: GapAnalysisView): string[] => view.gaps.map((g) => g.id);

describe("GapAnalysisProjector — identifies known gaps (criterion 2)", () => {
  it("reports unrealised elements and omits the fully realised ones", async () => {
    const view = await project();
    expect(ids(view)).toContain("cap-report");
    expect(ids(view)).toContain("dc-ledger");
    expect(ids(view)).not.toContain("cap-auth"); // L2 + L3 realised
    expect(ids(view)).not.toContain("dc-payment"); // L2 + L3 realised
  });

  it("totals the assessed population independent of the layer filter", async () => {
    const view = await project();
    expect(view.summary).toEqual({
      totalAssessed: 7,
      functionalGaps: 3, // cap-fraud, cap-report, dc-ledger
      technicalGaps: 4, // cap-fraud, cap-report, cap-settle, dc-notify
      fullyRealised: 2, // cap-auth, dc-payment
    });
  });
});

describe("GapAnalysisProjector — missingLayers + reason (criterion 3)", () => {
  it("annotates which realisation layers are absent, with a computed reason", async () => {
    const view = await project();
    const gap = (id: string) => view.gaps.find((g) => g.id === id);

    expect(gap("cap-report")?.missingLayers).toEqual(["L2", "L3"]);
    expect(gap("cap-settle")?.missingLayers).toEqual(["L3"]);
    expect(gap("dc-ledger")?.missingLayers).toEqual(["L2"]);

    expect(gap("dc-ledger")?.reason).toBe(
      "No functional realisation (no fulfils/specifies edge or vendor mapping); technically realised at L3.",
    );
    expect(gap("dc-notify")?.reason).toBe(
      "Functionally realised at L2 but not technically realised (no implementing service).",
    );
    expect(gap("cap-report")?.reason).toBe(
      "No functional realisation (no fulfils/specifies edge or vendor mapping) and no technical realisation (no implementing service).",
    );
  });
});

describe("GapAnalysisProjector — layer filter (criteria 4–5)", () => {
  it("layer=functional reports an L3-realised-but-not-L2 element as a functional gap", async () => {
    const view = await project({ layer: "functional" });
    expect(ids(view)).toEqual(["dc-ledger", "cap-fraud", "cap-report"]); // all missing L2, priority-sorted
    expect(ids(view)).toContain("dc-ledger"); // technically realised, functionally not
    expect(ids(view)).not.toContain("cap-settle"); // L2 present
  });

  it("layer=technical reports an L2-realised-but-not-L3 element as a technical gap", async () => {
    const view = await project({ layer: "technical" });
    expect(ids(view)).toEqual(["cap-settle", "dc-notify", "cap-fraud", "cap-report"]);
    expect(ids(view)).toContain("dc-notify"); // functionally realised, technically not
    expect(ids(view)).not.toContain("dc-ledger"); // L3 present
  });
});

describe("GapAnalysisProjector — domain filter (criterion 6)", () => {
  it("assesses only the requested domain", async () => {
    const view = await project({ domain: "payments" });
    expect(ids(view)).not.toContain("cap-fraud"); // risk domain
    expect(view.summary.totalAssessed).toBe(6);
  });
});

describe("GapAnalysisProjector — prioritisation (criterion 7)", () => {
  it("ranks deterministically by incoming-edge (dependent) count, then id", async () => {
    const view = await project();
    expect(ids(view)).toEqual(["cap-settle", "dc-ledger", "dc-notify", "cap-fraud", "cap-report"]);
    const gap = (id: string) => view.gaps.find((g) => g.id === id);
    expect(gap("cap-settle")?.priority).toBe(2); // two incoming fulfils edges
    expect(gap("cap-report")?.priority).toBe(0); // no dependents
  });
});

describe("GapAnalysisProjector — port hooks", () => {
  it("declares a stable viewType + on-demand policy and counts gaps for freshness", async () => {
    const projector = new GapAnalysisProjector(buildService(await seededCoverageGraph()));
    expect(projector.viewType).toBe("gap-analysis");
    expect(projector.describe().refreshPolicy).toBe("on-demand");
    const view = await projector.project({}, ctx());
    expect(projector.entriesIncluded(view)).toBe(view.gaps.length);
  });

  it("invalidatedBy is total and true for the relevant nodes/edges", async () => {
    const projector = new GapAnalysisProjector(buildService(await seededCoverageGraph()));
    const base: GraphMutationEvent = {
      eventId: "e",
      timestamp: "2026-01-01T00:00:00Z",
      mutationType: "NodeCreated",
      entityType: "DomainConcept",
      entityId: "dc-x",
      previousState: null,
      newState: null,
      trigger: { type: "loader", identity: "t" },
      confidence: 1,
      transactionId: "tx",
    };
    expect(projector.invalidatedBy(base)).toBe(true);
    expect(projector.invalidatedBy({ ...base, mutationType: "EdgeRemoved", entityType: "Relationship:implements" })).toBe(true);
    expect(projector.invalidatedBy({ ...base, entityType: "OrchestrationFlow" })).toBe(false);
  });
});
