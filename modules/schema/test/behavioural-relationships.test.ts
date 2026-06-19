import { describe, expect, it } from "vitest";
import { loadModule } from "./helpers";
import { loadParityFixtures, relationshipCase } from "./parity-fixtures";

const { validator } = loadModule();
const BEHAVIOURAL = "https://dkm.dev/schemas/relationships/behavioural.schema.json";

/**
 * Feature 2.1 — behavioural relationship schema (acceptance criterion 6). Each kind
 * validates only for its allowed {sourceType, targetType}; bad endpoints fail.
 */
describe("behavioural relationship schema — endpoint constraints", () => {
  for (const c of loadParityFixtures().relationships.filter((c) => c.schemaId === BEHAVIOURAL)) {
    it(`${c.name} → valid=${c.expectValid}`, () => {
      expect(validator.validateAgainstSchemaId(c.schemaId, c.payload).valid).toBe(c.expectValid);
    });
  }

  it("accepts a triggers edge Event → OrchestrationFlow", () => {
    const c = relationshipCase("behavioural/triggers-valid");
    expect(validator.validateAgainstSchemaId(c.schemaId, c.payload).valid).toBe(true);
  });

  it("rejects a triggers edge with an invalid source endpoint type", () => {
    const c = relationshipCase("behavioural/triggers-bad-source-endpoint");
    expect(validator.validateAgainstSchemaId(c.schemaId, c.payload).valid).toBe(false);
  });

  it("rejects a relationshipType outside the behavioural enum (e.g. evaluates)", () => {
    const c = relationshipCase("behavioural/invalid-kind-not-in-enum");
    expect(validator.validateAgainstSchemaId(c.schemaId, c.payload).valid).toBe(false);
  });
});
