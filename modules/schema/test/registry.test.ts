import { describe, expect, it } from "vitest";
import { loadDefaultRegistry } from "../src/index";

const registry = loadDefaultRegistry();

describe("SchemaRegistry — filesystem auto-discovery", () => {
  it("discovers all six core L1 inventory types", () => {
    const types = registry.listTypes().map((t) => t.type);
    for (const expected of [
      "DomainConcept",
      "BusinessCapability",
      "BusinessInvariant",
      "Rule",
      "ReferenceData",
      "Decision",
    ]) {
      expect(types).toContain(expected);
    }
  });

  it("discovers the Relationship type", () => {
    expect(registry.hasType("Relationship")).toBe(true);
  });

  it("does not register support schemas (base-entry/provenance/temporal) as types", () => {
    const types = registry.listTypes().map((t) => t.type);
    expect(types).not.toContain("BaseEntry");
    expect(types).not.toContain("Provenance");
    expect(types).not.toContain("TemporalValidity");
  });

  it("reports the correct layer for an L1 type", () => {
    expect(registry.layerOf("DomainConcept")).toBe("L1");
  });

  it("returns a version history for a known type", () => {
    const history = registry.getVersionHistory("Decision");
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0]?.version).toBe("1.0.0");
  });

  it("exposes the schema $id for a type", () => {
    expect(registry.getSchemaId("Decision")).toContain("decision.schema.json");
  });

  it("throws for an unknown type lookup", () => {
    expect(() => registry.getSchema("Nope")).toThrow();
  });
});
