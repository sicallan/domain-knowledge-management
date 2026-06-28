import { describe, expect, it } from "vitest";
import {
  colourOfLayer,
  layerOfType,
  layoutNameFor,
  layoutOptionsFor,
} from "../src/explorer/encoding";

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
    // Force uses fcose — a separation-aware force layout that doesn't clump/overlap at scale.
    expect(layoutNameFor("force")).toBe("fcose");
    expect(layoutNameFor("hierarchical")).toBe("breadthfirst");
    expect(layoutNameFor("radial")).toBe("concentric");
  });
});

describe("layout options — no node/label overlap (enhancement)", () => {
  it("every mode sizes nodes to include their labels and pads the viewport", () => {
    for (const mode of ["force", "hierarchical", "radial"] as const) {
      const opts = layoutOptionsFor(mode);
      expect(opts.name).toBe(layoutNameFor(mode));
      // Treating the label box as part of the node is what prevents labels overlapping neighbours.
      expect(opts.nodeDimensionsIncludeLabels).toBe(true);
      expect(typeof opts.padding).toBe("number");
    }
  });

  it("force (fcose) separates and repels nodes generously", () => {
    const opts = layoutOptionsFor("force");
    expect(opts.name).toBe("fcose");
    expect(Number(opts.nodeSeparation)).toBeGreaterThanOrEqual(80);
    expect(Number(opts.nodeRepulsion)).toBeGreaterThan(4500); // above the fcose default
  });

  it("the built-in hierarchical/radial layouts avoid overlap with extra spacing", () => {
    const hierarchical = layoutOptionsFor("hierarchical");
    expect(hierarchical.avoidOverlap).toBe(true);
    expect(Number(hierarchical.spacingFactor)).toBeGreaterThan(1);

    const radial = layoutOptionsFor("radial");
    expect(radial.avoidOverlap).toBe(true);
    expect(Number(radial.minNodeSpacing)).toBeGreaterThan(0);
  });
});
