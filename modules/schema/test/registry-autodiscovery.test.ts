import { describe, expect, it } from "vitest";
import { loadDefaultRegistry } from "../src/index";

/**
 * Feature 2.1 — acceptance criterion 5 (OCP gate). Dropping the four new L3 behaviour
 * schema files into schemas/inventory/L3 makes them discoverable with ZERO edits to the
 * registry code or any manifest. This test loads the registry from the canonical /schemas
 * directory exactly as production does and asserts the new types are present.
 */
describe("SchemaRegistry — auto-discovers the new L3 behaviour types (OCP)", () => {
  const registry = loadDefaultRegistry();
  const newTypes = ["OrchestrationFlow", "OrchestrationStep", "Event", "StateTransition"];

  for (const type of newTypes) {
    it(`hasType('${type}') is true and listTypes() includes it`, () => {
      expect(registry.hasType(type)).toBe(true);
      expect(registry.listTypes().map((t) => t.type)).toContain(type);
    });

    it(`reports '${type}' at layer L3`, () => {
      expect(registry.layerOf(type)).toBe("L3");
    });
  }

  it("still discovers the previously-shipped types (no regression)", () => {
    for (const type of ["Decision", "DomainConcept", "Rule", "BusinessInvariant"]) {
      expect(registry.hasType(type)).toBe(true);
    }
  });
});
