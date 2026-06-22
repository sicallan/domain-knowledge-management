import { describe, expect, it } from "vitest";
import { loadModule } from "./helpers";
import { l2RelationshipCase, loadL2ParityFixtures } from "./parity-fixtures";

const { validator } = loadModule();
const L2_STRUCTURAL = "https://dkm.dev/schemas/relationships/l2-structural.schema.json";

/**
 * Feature 3.1 — L2 structural relationship schema (acceptance criterion 8). Each kind
 * (`fulfils`/`specifies`/`realizesVendorCap`) validates only for its allowed
 * {sourceType, targetType}; bad endpoints and out-of-enum kinds fail.
 */
describe("L2 structural relationship schema — endpoint constraints", () => {
  for (const c of loadL2ParityFixtures().relationships.filter((c) => c.schemaId === L2_STRUCTURAL)) {
    it(`${c.name} → valid=${c.expectValid}`, () => {
      expect(validator.validateAgainstSchemaId(c.schemaId, c.payload).valid).toBe(c.expectValid);
    });
  }

  it("accepts a fulfils edge VendorProduct → BusinessCapability", () => {
    const c = l2RelationshipCase("l2-structural/fulfils-valid");
    expect(validator.validateAgainstSchemaId(c.schemaId, c.payload).valid).toBe(true);
  });

  it("rejects a fulfils edge with an invalid target endpoint type (VendorProduct → DomainConcept)", () => {
    const c = l2RelationshipCase("l2-structural/fulfils-bad-target-endpoint");
    expect(validator.validateAgainstSchemaId(c.schemaId, c.payload).valid).toBe(false);
  });

  it("rejects a specifies edge with an invalid source endpoint type (Rule → DomainConcept)", () => {
    const c = l2RelationshipCase("l2-structural/specifies-bad-source-endpoint");
    expect(validator.validateAgainstSchemaId(c.schemaId, c.payload).valid).toBe(false);
  });

  it("accepts a realizesVendorCap edge Service → VendorCapabilityMapping", () => {
    const c = l2RelationshipCase("l2-structural/realizesVendorCap-valid");
    expect(validator.validateAgainstSchemaId(c.schemaId, c.payload).valid).toBe(true);
  });

  it("rejects a relationshipType outside the L2 structural enum (e.g. triggers)", () => {
    const c = l2RelationshipCase("l2-structural/invalid-kind-not-in-enum");
    expect(validator.validateAgainstSchemaId(c.schemaId, c.payload).valid).toBe(false);
  });
});
