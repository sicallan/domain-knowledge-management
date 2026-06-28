import { describe, expect, it } from "vitest";
import { knownInventoryTypes, layerOfType } from "../src/explorer/encoding";
import {
  LAYERS,
  conceptModel,
  conceptsByLayer,
  relationshipModel,
} from "../src/overview/model";

/**
 * The Overview's conceptual model is the single source the layered diagram and the concepts
 * table both read, so it must stay in step with the graph's type→layer encoding: every
 * inventory type the explorer knows must appear, in its correct layer, with a description.
 */
describe("overview conceptual model", () => {
  it("covers every known inventory type, in its encoding layer, with a description", () => {
    const byType = new Map(conceptModel().map((c) => [c.type, c]));
    for (const type of knownInventoryTypes()) {
      const concept = byType.get(type);
      expect(concept, `missing concept entry for ${type}`).toBeDefined();
      expect(concept?.layer).toBe(layerOfType(type));
      expect(concept?.description.length ?? 0).toBeGreaterThan(0);
      expect(concept?.status).toBe("active");
    }
  });

  it("includes the (planned) L0 strategic layer concepts", () => {
    const initiative = conceptModel().find((c) => c.type === "Initiative");
    expect(initiative?.layer).toBe("L0");
    expect(initiative?.status).toBe("planned");
  });

  it("marks Decision as the highest-value L1 node", () => {
    const decision = conceptModel().find((c) => c.type === "Decision");
    expect(decision?.layer).toBe("L1");
    expect(decision?.description.toLowerCase()).toContain("highest-value");
  });

  it("groups concepts by the four layers in L0→L3 order", () => {
    const groups = conceptsByLayer();
    expect(groups.map((g) => g.layer.id)).toEqual(["L0", "L1", "L2", "L3"]);
    expect(groups[0]?.concepts.every((c) => c.status === "planned")).toBe(true); // L0 all planned
    expect(groups.find((g) => g.layer.id === "L1")?.concepts.some((c) => c.type === "Decision")).toBe(
      true,
    );
    expect(LAYERS).toHaveLength(4);
  });
});

describe("overview relationship model", () => {
  it("lists key relationship types with a category, endpoints and meaning", () => {
    const rels = relationshipModel();
    expect(rels.length).toBeGreaterThanOrEqual(8);
    for (const rel of rels) {
      expect(rel.type.length).toBeGreaterThan(0);
      expect(rel.category.length).toBeGreaterThan(0);
      expect(rel.connects).toMatch(/→/); // "Source → Target"
      expect(rel.description.length).toBeGreaterThan(0);
    }
    const types = rels.map((r) => r.type);
    expect(types).toContain("governs");
    expect(types).toContain("fulfils");
  });
});
