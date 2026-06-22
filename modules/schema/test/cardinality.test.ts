import { describe, expect, it } from "vitest";
import {
  BEHAVIOURAL_RELATIONSHIP_DEFS,
  L2_STRUCTURAL_RELATIONSHIP_DEFS,
  RelationshipTypeRegistry,
  createFullRelationshipRegistry,
  registerBehaviouralRelationships,
  registerL2Relationships,
} from "../src/index";

describe("RelationshipTypeRegistry — cardinality enforcement", () => {
  const reg = new RelationshipTypeRegistry();

  it("allows the first belongsTo edge from a source", () => {
    expect(reg.canAddEdge("belongsTo", 0).valid).toBe(true);
  });

  it("rejects a second belongsTo edge (N:1 — a service belongs to exactly one context)", () => {
    const result = reg.canAddEdge("belongsTo", 1);
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.keyword).toBe("maxCardinality");
  });

  it("allows unbounded evaluates edges (1:N)", () => {
    expect(reg.canAddEdge("evaluates", 5).valid).toBe(true);
  });

  it("flags a Decision with zero evaluates edges as incomplete (≥1 required)", () => {
    const result = reg.checkMinimum("evaluates", 0);
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.keyword).toBe("minCardinality");
  });

  it("accepts a Decision with one evaluates edge", () => {
    expect(reg.checkMinimum("evaluates", 1).valid).toBe(true);
  });

  it("treats unknown relationship types as unconstrained", () => {
    expect(reg.canAddEdge("madeUpRelation", 99).valid).toBe(true);
    expect(reg.checkMinimum("madeUpRelation", 0).valid).toBe(true);
  });

  it("supports registering a new relationship type without modifying existing logic (OCP)", () => {
    expect(reg.has("approves")).toBe(false);
    reg.register({ name: "approves", maxTargetsPerSource: 1, minTargetsPerSource: 1 });
    expect(reg.has("approves")).toBe(true);
    expect(reg.canAddEdge("approves", 1).valid).toBe(false);
    expect(reg.checkMinimum("approves", 0).valid).toBe(false);
  });

  // Feature 2.1 — acceptance criterion 8: every Decision must have ≥1 produces (outcome) edge.
  it("flags a Decision with zero produces edges as incomplete (≥1 required)", () => {
    const result = reg.checkMinimum("produces", 0);
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.keyword).toBe("minCardinality");
  });

  it("accepts a Decision with one produces edge", () => {
    expect(reg.checkMinimum("produces", 1).valid).toBe(true);
  });
});

// Feature 2.1 — behavioural edge types are added additively via register() (task §3 / OCP).
describe("RelationshipTypeRegistry — behavioural edge registration (additive)", () => {
  it("the default registry does not carry the behavioural edge types out of the box", () => {
    const reg = new RelationshipTypeRegistry();
    for (const name of ["triggers", "transitionsTo", "compensates", "invokes"]) {
      expect(reg.has(name)).toBe(false);
    }
  });

  it("registers exactly the four behavioural edge types not already present", () => {
    const reg = new RelationshipTypeRegistry();
    registerBehaviouralRelationships(reg);
    for (const def of BEHAVIOURAL_RELATIONSHIP_DEFS) {
      expect(reg.has(def.name)).toBe(true);
    }
    expect(BEHAVIOURAL_RELATIONSHIP_DEFS.map((d) => d.name).sort()).toEqual(
      ["compensates", "invokes", "transitionsTo", "triggers"],
    );
  });

  it("does not touch the previously-shipped DEFAULT_DEFS (evaluates/produces still enforced)", () => {
    const reg = new RelationshipTypeRegistry();
    registerBehaviouralRelationships(reg);
    expect(reg.checkMinimum("evaluates", 0).valid).toBe(false);
    expect(reg.checkMinimum("produces", 0).valid).toBe(false);
  });
});

// Feature 3.1 — L2 structural edge types are added additively via register() (OCP).
describe("RelationshipTypeRegistry — L2 structural edge registration (additive)", () => {
  it("the default registry does not carry the L2 edge types out of the box", () => {
    const reg = new RelationshipTypeRegistry();
    for (const name of ["fulfils", "specifies", "realizesVendorCap"]) {
      expect(reg.has(name)).toBe(false);
    }
  });

  it("registers exactly the three L2 structural edge types", () => {
    const reg = new RelationshipTypeRegistry();
    registerL2Relationships(reg);
    for (const def of L2_STRUCTURAL_RELATIONSHIP_DEFS) {
      expect(reg.has(def.name)).toBe(true);
    }
    expect(L2_STRUCTURAL_RELATIONSHIP_DEFS.map((d) => d.name).sort()).toEqual(
      ["fulfils", "realizesVendorCap", "specifies"],
    );
  });

  it("carries the endpoint types in the L2 defs (link-gate typing)", () => {
    const reg = new RelationshipTypeRegistry();
    registerL2Relationships(reg);
    expect(reg.get("fulfils")?.sourceTypes).toContain("VendorProduct");
    expect(reg.get("fulfils")?.targetTypes).toContain("BusinessCapability");
    expect(reg.get("realizesVendorCap")?.targetTypes).toContain("VendorCapabilityMapping");
  });

  it("does not touch the previously-shipped DEFAULT_DEFS (evaluates/produces still enforced)", () => {
    const reg = new RelationshipTypeRegistry();
    registerL2Relationships(reg);
    expect(reg.checkMinimum("evaluates", 0).valid).toBe(false);
    expect(reg.checkMinimum("produces", 0).valid).toBe(false);
  });

  it("the full registry includes the L2 edges alongside behavioural + cross-layer (criterion 9)", () => {
    const reg = createFullRelationshipRegistry();
    for (const name of ["fulfils", "specifies", "realizesVendorCap"]) {
      expect(reg.has(name)).toBe(true);
    }
    // shared rule set still enforces the shipped decision minimums
    expect(reg.checkMinimum("evaluates", 0).valid).toBe(false);
    // and still carries the cross-layer + behavioural names
    expect(reg.has("satisfiedBy")).toBe(true);
    expect(reg.has("triggers")).toBe(true);
  });
});

// Feature 2.1 — acceptance criterion 9: conditional cross-field rule (spec 001 Open Q1).
// Enforced in the cardinality/quality layer, NOT in structural JSON Schema.
describe("RelationshipTypeRegistry — automated Decision requires a triggeredBy edge", () => {
  const reg = new RelationshipTypeRegistry();

  it("rejects an automated Decision with zero triggeredBy edges", () => {
    const result = reg.checkAutomatedDecisionTrigger("automated", 0);
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.keyword).toBe("conditionalCardinality");
  });

  it("accepts an automated Decision with one triggeredBy edge", () => {
    expect(reg.checkAutomatedDecisionTrigger("automated", 1).valid).toBe(true);
  });

  it("accepts a manual Decision with zero triggeredBy edges", () => {
    expect(reg.checkAutomatedDecisionTrigger("manual", 0).valid).toBe(true);
  });

  it("accepts a hybrid Decision with zero triggeredBy edges (rule is automated-only)", () => {
    expect(reg.checkAutomatedDecisionTrigger("hybrid", 0).valid).toBe(true);
  });
});
