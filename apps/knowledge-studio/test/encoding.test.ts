import { describe, expect, it } from "vitest";
import { colourOfLayer, layerOfType, layoutNameFor } from "../src/explorer/encoding";

describe("visual encoding (criterion 7)", () => {
  it("maps inventory types to their domain layer", () => {
    expect(layerOfType("DomainConcept")).toBe("L1");
    expect(layerOfType("Decision")).toBe("L1");
    expect(layerOfType("VendorProduct")).toBe("L2");
    expect(layerOfType("OrchestrationStep")).toBe("L3");
  });

  it("falls back to L1 for an unknown type", () => {
    expect(layerOfType("SomethingNew")).toBe("L1");
  });

  it("gives each layer a distinct colour", () => {
    const colours = new Set(["L0", "L1", "L2", "L3"].map(colourOfLayer));
    expect(colours.size).toBe(4);
  });
});

describe("layout modes (criterion 6)", () => {
  it("maps each mode to a deterministic Cytoscape layout name", () => {
    expect(layoutNameFor("force")).toBe("cose");
    expect(layoutNameFor("hierarchical")).toBe("breadthfirst");
    expect(layoutNameFor("radial")).toBe("concentric");
  });
});
