import { describe, expect, it } from "vitest";
import { loadModule } from "./helpers";
import { l2EntryCase, loadL2ParityFixtures } from "./parity-fixtures";

const { validator } = loadModule();

/**
 * Feature 3.1 — the three new L2 vendor/project schemas (acceptance criteria 1–5).
 * Fixtures live in the unified cross-validator set (`fixtures/parity/l2/cases.json`) so
 * the same data also proves Ajv ↔ jsonschema parity (criterion 6).
 */
describe("L2 vendor/project schema validation", () => {
  const l2Types = ["VendorProduct", "VendorCapabilityMapping", "ProjectSpec"];

  describe("each new L2 type has a valid fixture and ≥2 invalid fixtures", () => {
    for (const type of l2Types) {
      it(`${type}: registered, with ≥1 valid and ≥2 invalid fixtures`, () => {
        const cases = loadL2ParityFixtures().entries.filter((c) => c.type === type);
        expect(cases.some((c) => c.expectValid)).toBe(true);
        expect(cases.filter((c) => !c.expectValid).length).toBeGreaterThanOrEqual(2);
      });
    }
  });

  describe("fixtures validate to their expected verdict", () => {
    for (const c of loadL2ParityFixtures().entries) {
      it(`${c.name} → valid=${c.expectValid}`, () => {
        expect(validator.validate(c.payload, c.type).valid).toBe(c.expectValid);
      });
    }
  });

  it("criterion 2 — a VendorProduct missing `vendor` yields a precise required-keyword error", () => {
    const c = l2EntryCase("VendorProduct/invalid-missing-vendor");
    const result = validator.validate(c.payload, c.type);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.keyword === "required")).toBe(true);
  });

  it("criterion 5 — VendorCapabilityMapping enforces the coverage enum", () => {
    const bad = l2EntryCase("VendorCapabilityMapping/invalid-bad-coverage-enum");
    const result = validator.validate(bad.payload, bad.type);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.keyword === "enum")).toBe(true);
  });

  it("criterion 5 — coveragePercentage is bounded 0–100", () => {
    const bad = l2EntryCase("VendorCapabilityMapping/invalid-coveragePercentage-out-of-range");
    expect(validator.validate(bad.payload, bad.type).valid).toBe(false);
  });

  it("criterion 4 — ProjectSpec uses the specType discriminator (not type) and enforces its enum", () => {
    const bad = l2EntryCase("ProjectSpec/invalid-bad-specType-enum");
    const result = validator.validate(bad.payload, bad.type);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.keyword === "enum")).toBe(true);
  });

  it("criterion 4 — VendorProduct carries productVersion (distinct from the base-entry version)", () => {
    const valid = l2EntryCase("VendorProduct/valid");
    expect(valid.payload).toHaveProperty("productVersion");
    // The base-entry lifecycle version is a separate, semver-shaped field.
    expect(valid.payload.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(validator.validate(valid.payload, valid.type).valid).toBe(true);
  });

  describe("criterion 3 — base-entry inheritance applies to every new L2 type", () => {
    for (const type of l2Types) {
      it(`${type} rejects a missing provenance (evidencedBy)`, () => {
        const valid = loadL2ParityFixtures().entries.find((c) => c.type === type && c.expectValid);
        if (!valid) throw new Error(`no valid fixture for ${type}`);
        const noEvidence = { ...valid.payload, evidencedBy: [] };
        expect(validator.validate(noEvidence, type).valid).toBe(false);
      });

      it(`${type} rejects a missing temporal validFrom`, () => {
        const valid = loadL2ParityFixtures().entries.find((c) => c.type === type && c.expectValid);
        if (!valid) throw new Error(`no valid fixture for ${type}`);
        const noValidFrom = { ...valid.payload };
        delete (noValidFrom as Record<string, unknown>).validFrom;
        expect(validator.validate(noValidFrom, type).valid).toBe(false);
      });
    }
  });
});
