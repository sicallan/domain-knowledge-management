import { describe, expect, it } from "vitest";
import { loadModule } from "./helpers";
import { loadParityFixtures } from "./parity-fixtures";

const { validator } = loadModule();

/**
 * Feature 2.1 — acceptance criterion 4 (spec 001 Decision 3). The unified fixture set is
 * run through Ajv here; the identical file is run through Python `jsonschema` in
 * modules/enrichment/tests/test_cross_validator_parity.py. Both assert the same
 * `expectValid` verdict, so a semantic divergence between the validators fails CI in one
 * ecosystem or the other.
 *
 * This TS side is the Ajv leg: it proves every fixture's Ajv verdict equals the declared
 * expectation. (Format keywords are asserted by ajv-formats here but not by the default
 * Python validator, so all fixtures keep well-formed uuid/date-time values and invalid
 * cases fail only on format-agnostic keywords.)
 */
describe("cross-validator parity — Ajv (TypeScript) leg", () => {
  const { entries, relationships } = loadParityFixtures();

  describe("entry fixtures", () => {
    for (const c of entries) {
      it(`${c.name} → ${c.expectValid ? "valid" : "invalid"}`, () => {
        expect(validator.validate(c.payload, c.type).valid).toBe(c.expectValid);
      });
    }
  });

  describe("relationship fixtures", () => {
    for (const c of relationships) {
      it(`${c.name} → ${c.expectValid ? "valid" : "invalid"}`, () => {
        expect(validator.validateAgainstSchemaId(c.schemaId, c.payload).valid).toBe(c.expectValid);
      });
    }
  });
});
