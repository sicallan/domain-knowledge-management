import { buildSchema } from "graphql";
import { describe, expect, it } from "vitest";
import { sdl } from "../src/schema/sdl";

/**
 * The SDL **is** the contract (UI-D2 / criterion 1). This snapshot guards it: any change
 * to a type or resolver signature shows up as a reviewed snapshot diff, and the studio's
 * codegen reads the same emitted SDL so client and server can't drift.
 */
describe("GraphQL SDL contract", () => {
  it("matches the committed snapshot", () => {
    expect(sdl).toMatchSnapshot();
  });

  it("is a valid, parseable schema including the core inventory/view/deferred types", () => {
    // Re-parsing the emitted SDL proves it is self-consistent (criterion 1).
    expect(() => buildSchema(sdl)).not.toThrow();
    for (const typeName of [
      "InventoryEntry",
      "Relationship",
      "Subgraph",
      "EntryConnection",
      "VendorCoverageView",
      "GapAnalysisView",
      "DomainMapView",
      "BehaviourFlowView",
      "BackendUnavailable",
      "SearchResult",
      "ImpactResult",
    ]) {
      expect(sdl).toContain(typeName);
    }
  });
});
