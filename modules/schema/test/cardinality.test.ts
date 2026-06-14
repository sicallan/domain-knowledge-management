import { describe, expect, it } from "vitest";
import { RelationshipTypeRegistry } from "../src/index";

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
});
