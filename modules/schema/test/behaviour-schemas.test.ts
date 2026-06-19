import { describe, expect, it } from "vitest";
import { loadModule } from "./helpers";
import { entryCase, loadParityFixtures } from "./parity-fixtures";

const { validator } = loadModule();

/**
 * Feature 2.1 — the four new L3 behaviour schemas (acceptance criteria 1–3).
 * Fixtures live in the unified cross-validator set so the same data also proves
 * Ajv ↔ jsonschema parity (criterion 4).
 */
describe("L3 behaviour schema validation", () => {
  const behaviourTypes = ["OrchestrationFlow", "OrchestrationStep", "Event", "StateTransition"];

  describe("each new L3 type has a valid fixture and ≥2 invalid fixtures", () => {
    for (const type of behaviourTypes) {
      it(`${type}: registered, with ≥1 valid and ≥2 invalid fixtures`, () => {
        const cases = loadParityFixtures().entries.filter((c) => c.type === type);
        expect(cases.some((c) => c.expectValid)).toBe(true);
        expect(cases.filter((c) => !c.expectValid).length).toBeGreaterThanOrEqual(2);
      });
    }
  });

  describe("fixtures validate to their expected verdict", () => {
    for (const c of loadParityFixtures().entries.filter((c) => behaviourTypes.includes(c.type))) {
      it(`${c.name} → valid=${c.expectValid}`, () => {
        expect(validator.validate(c.payload, c.type).valid).toBe(c.expectValid);
      });
    }
  });

  it("criterion 2 — an invalid fixture yields a precise required-keyword error", () => {
    const c = entryCase("StateTransition/invalid-missing-toState");
    const result = validator.validate(c.payload, c.type);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.keyword === "required")).toBe(true);
  });

  it("Event uses the eventType discriminator (not type) and enforces its enum", () => {
    const bad = entryCase("Event/invalid-bad-eventType-enum");
    const result = validator.validate(bad.payload, bad.type);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.keyword === "enum")).toBe(true);
  });

  describe("criterion 3 — base-entry inheritance applies to every new type", () => {
    for (const type of behaviourTypes) {
      it(`${type} rejects a missing provenance (evidencedBy)`, () => {
        const valid = loadParityFixtures().entries.find((c) => c.type === type && c.expectValid);
        if (!valid) throw new Error(`no valid fixture for ${type}`);
        const noEvidence = { ...valid.payload, evidencedBy: [] };
        expect(validator.validate(noEvidence, type).valid).toBe(false);
      });

      it(`${type} rejects a missing temporal validFrom`, () => {
        const valid = loadParityFixtures().entries.find((c) => c.type === type && c.expectValid);
        if (!valid) throw new Error(`no valid fixture for ${type}`);
        const noValidFrom = { ...valid.payload };
        delete (noValidFrom as Record<string, unknown>).validFrom;
        expect(validator.validate(noValidFrom, type).valid).toBe(false);
      });
    }
  });
});
