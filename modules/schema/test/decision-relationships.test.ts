import { describe, expect, it } from "vitest";
import { loadModule } from "./helpers";
import { loadParityFixtures, relationshipCase } from "./parity-fixtures";

const { validator } = loadModule();
const DECISION_SPECIFIC = "https://dkm.dev/schemas/relationships/decision-specific.schema.json";

/**
 * Feature 2.1 — decision-specific relationship schema. Each kind validates only for
 * its allowed {sourceType, targetType} endpoints (plan.md §Relationship Cardinality).
 */
describe("decision-specific relationship schema — endpoint constraints", () => {
  for (const c of loadParityFixtures().relationships.filter((c) => c.schemaId === DECISION_SPECIFIC)) {
    it(`${c.name} → valid=${c.expectValid}`, () => {
      expect(validator.validateAgainstSchemaId(c.schemaId, c.payload).valid).toBe(c.expectValid);
    });
  }

  it("accepts evaluates Decision → Rule and Decision → BusinessInvariant", () => {
    expect(
      validator.validateAgainstSchemaId(DECISION_SPECIFIC, relationshipCase("decision-specific/evaluates-rule-valid").payload).valid,
    ).toBe(true);
    expect(
      validator.validateAgainstSchemaId(DECISION_SPECIFIC, relationshipCase("decision-specific/evaluates-invariant-valid").payload).valid,
    ).toBe(true);
  });

  it("rejects evaluates with a non-evaluable target endpoint (Service)", () => {
    const c = relationshipCase("decision-specific/evaluates-bad-target-endpoint");
    expect(validator.validateAgainstSchemaId(c.schemaId, c.payload).valid).toBe(false);
  });

  it("rejects a relationshipType outside the decision-specific enum (e.g. triggers)", () => {
    const c = relationshipCase("decision-specific/invalid-kind-not-in-enum");
    expect(validator.validateAgainstSchemaId(c.schemaId, c.payload).valid).toBe(false);
  });
});
