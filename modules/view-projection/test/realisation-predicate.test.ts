import { describe, expect, it } from "vitest";
import {
  buildMappingIndex,
  isFunctionallyRealised,
  isTechnicallyRealised,
  maxCoveragePercentage,
  missingLayers,
  readElementRealisation,
  rollUpCoverage,
  rowCoverageStatus,
} from "../src/index";
import type { ElementRealisation } from "../src/index";
import { buildService, ctx, makeNode, seededCoverageGraph } from "./helpers";

function realisation(over: Partial<ElementRealisation> = {}): ElementRealisation {
  return { incomingFulfils: 0, incomingSpecifies: 0, mappingCoverages: [], incomingTechnical: 0, ...over };
}

describe("realisation predicate — functional (L2, D-P3.3)", () => {
  it("is realised by ≥1 fulfils edge", () => {
    expect(isFunctionallyRealised(realisation({ incomingFulfils: 1 }))).toBe(true);
  });

  it("is realised by ≥1 specifies edge", () => {
    expect(isFunctionallyRealised(realisation({ incomingSpecifies: 1 }))).toBe(true);
  });

  it("is realised by a mapping with coverage ≠ none", () => {
    expect(isFunctionallyRealised(realisation({ mappingCoverages: ["partial"] }))).toBe(true);
    expect(isFunctionallyRealised(realisation({ mappingCoverages: ["full"] }))).toBe(true);
  });

  it("a coverage of `none` does NOT count as realised", () => {
    expect(isFunctionallyRealised(realisation({ mappingCoverages: ["none"] }))).toBe(false);
    expect(isFunctionallyRealised(realisation())).toBe(false);
  });
});

describe("realisation predicate — technical (L3, D-P3.3)", () => {
  it("is realised only by ≥1 implements/realizedBy edge", () => {
    expect(isTechnicallyRealised(realisation({ incomingTechnical: 1 }))).toBe(true);
    expect(isTechnicallyRealised(realisation({ incomingFulfils: 5, mappingCoverages: ["full"] }))).toBe(false);
  });
});

describe("realisation predicate — missingLayers", () => {
  it("lists both layers when nothing realises the element", () => {
    expect(missingLayers(realisation())).toEqual(["L2", "L3"]);
  });

  it("lists only L3 for a functionally-but-not-technically realised element", () => {
    expect(missingLayers(realisation({ incomingSpecifies: 1 }))).toEqual(["L3"]);
  });

  it("lists only L2 for a technically-but-not-functionally realised element", () => {
    expect(missingLayers(realisation({ incomingTechnical: 1 }))).toEqual(["L2"]);
  });

  it("lists nothing for a fully realised element", () => {
    expect(missingLayers(realisation({ incomingFulfils: 1, incomingTechnical: 1 }))).toEqual([]);
  });
});

describe("realisation predicate — coverage roll-up (D-P3.2 worst-wins)", () => {
  it("maps full→covered, partial→partial, empty/none→uncovered", () => {
    expect(rollUpCoverage(["full"])).toBe("covered");
    expect(rollUpCoverage(["partial"])).toBe("partial");
    expect(rollUpCoverage(["none"])).toBe("uncovered");
    expect(rollUpCoverage([])).toBe("uncovered");
  });

  it("worst-wins for the gap signal: any none ⇒ uncovered; else any partial ⇒ partial", () => {
    expect(rollUpCoverage(["full", "none"])).toBe("uncovered");
    expect(rollUpCoverage(["full", "partial"])).toBe("partial");
    expect(rollUpCoverage(["full", "full"])).toBe("covered");
  });

  it("surfaces the max coverage percentage, ignoring undefined", () => {
    expect(maxCoveragePercentage([60, undefined, 75])).toBe(75);
    expect(maxCoveragePercentage([undefined])).toBeUndefined();
  });
});

describe("realisation predicate — row status", () => {
  it("uncovered when not functionally realised", () => {
    expect(rowCoverageStatus(realisation({ mappingCoverages: ["none"] }))).toBe("uncovered");
  });

  it("covered only when a full mapping is present", () => {
    expect(rowCoverageStatus(realisation({ mappingCoverages: ["full", "partial"] }))).toBe("covered");
  });

  it("partial when realised but no full mapping (e.g. via a specifies edge)", () => {
    expect(rowCoverageStatus(realisation({ incomingSpecifies: 1 }))).toBe("partial");
    expect(rowCoverageStatus(realisation({ mappingCoverages: ["partial"] }))).toBe("partial");
  });
});

describe("realisation reader — gathers inputs from the Query Interface", () => {
  it("indexes mappings by their mappedConcept.targetId", () => {
    const index = buildMappingIndex([
      makeNode("VendorCapabilityMapping", "m1", {
        vendorCapability: "A",
        mappedConcept: { targetType: "BusinessCapability", targetId: "cap-x" },
        coverage: "full",
        coveragePercentage: 90,
      }),
    ]);
    expect(index.get("cap-x")).toEqual([
      { mappingId: "m1", vendorCapability: "A", coverage: "full", coveragePercentage: 90, gaps: undefined },
    ]);
  });

  it("reads a real element's realisation from the seeded graph", async () => {
    const service = buildService(await seededCoverageGraph());
    const mappingIndex = buildMappingIndex(
      (await service.listEntries({ type: "VendorCapabilityMapping", limit: 100 }, ctx())).items,
    );

    // cap-auth: fulfils(acme) + full mapping + implements(svc-auth) → fully realised.
    const auth = await readElementRealisation(service, "cap-auth", mappingIndex, ctx());
    expect(auth.incomingFulfils).toBe(1);
    expect(auth.mappingCoverages).toEqual(["full"]);
    expect(auth.incomingTechnical).toBe(1);
    expect(isFunctionallyRealised(auth)).toBe(true);
    expect(isTechnicallyRealised(auth)).toBe(true);

    // dc-ledger: only an implementing service → technically but not functionally realised.
    const ledger = await readElementRealisation(service, "dc-ledger", mappingIndex, ctx());
    expect(missingLayers(ledger)).toEqual(["L2"]);
  });
});
