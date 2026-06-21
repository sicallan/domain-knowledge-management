import { describe, expect, it } from "vitest";
import {
  CROSS_LAYER_RELATIONSHIP_DEFS,
  createFullRelationshipRegistry,
  RelationshipTypeRegistry,
  registerCrossLayerRelationships,
} from "../src/index";

// Feature 2.5 — the regulatory + structural cross-layer edge types are registered
// additively (a new defs list + helper, mirroring the behavioural pattern). They
// carry endpoint types (plan.md §Relationships) so the loader can validate endpoints
// at link time, and are forward-compatible with L2 (registered now, not gated on data).
describe("RelationshipTypeRegistry — cross-layer edge registration (additive)", () => {
  it("the default registry does not carry the cross-layer edge types out of the box", () => {
    const reg = new RelationshipTypeRegistry();
    for (const name of ["satisfiedBy", "obliges", "exposes", "usesReferenceData", "governs"]) {
      expect(reg.has(name)).toBe(false);
    }
  });

  it("registers exactly the five cross-layer edge types via the helper", () => {
    const reg = new RelationshipTypeRegistry();
    registerCrossLayerRelationships(reg);
    for (const def of CROSS_LAYER_RELATIONSHIP_DEFS) {
      expect(reg.has(def.name)).toBe(true);
    }
    expect(CROSS_LAYER_RELATIONSHIP_DEFS.map((d) => d.name).sort()).toEqual(
      ["exposes", "governs", "obliges", "satisfiedBy", "usesReferenceData"],
    );
  });

  it("carries endpoint types incl. the forward-compatible L2 ProjectSpec target on satisfiedBy", () => {
    const reg = new RelationshipTypeRegistry();
    registerCrossLayerRelationships(reg);
    const satisfiedBy = reg.get("satisfiedBy");
    expect(satisfiedBy?.sourceTypes).toContain("RegulatoryRequirement");
    expect(satisfiedBy?.targetTypes).toContain("Decision");
    expect(satisfiedBy?.targetTypes).toContain("ProjectSpec"); // L2 — registered, not gated on data
  });

  it("does not touch the previously-shipped DEFAULT_DEFS (evaluates/produces still enforced)", () => {
    const reg = new RelationshipTypeRegistry();
    registerCrossLayerRelationships(reg);
    expect(reg.checkMinimum("evaluates", 0).valid).toBe(false);
    expect(reg.checkMinimum("produces", 0).valid).toBe(false);
  });
});

// The single shared rule set the loader consumes: default + behavioural + cross-layer.
describe("createFullRelationshipRegistry — the loader's single shared rule set", () => {
  it("knows the decision-specific, behavioural and cross-layer edge types", () => {
    const reg = createFullRelationshipRegistry();
    for (const name of [
      "evaluates", // decision-specific (default)
      "belongsTo", // structural (default)
      "invokes", // behavioural
      "satisfiedBy", // regulatory cross-layer
      "usesReferenceData", // structural cross-layer
    ]) {
      expect(reg.has(name)).toBe(true);
    }
  });

  it("gives the decision-specific edges their endpoint types (so the loader can type-check them)", () => {
    const reg = createFullRelationshipRegistry();
    const evaluates = reg.get("evaluates");
    expect(evaluates?.sourceTypes).toContain("Decision");
    expect(evaluates?.targetTypes).toContain("Rule");
    const realizedBy = reg.get("realizedBy");
    expect(realizedBy?.sourceTypes).toContain("Decision");
    expect(realizedBy?.targetTypes).toContain("Service");
  });
});
