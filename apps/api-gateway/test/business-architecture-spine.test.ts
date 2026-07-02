import { InMemoryGraphAdapter } from "@dkm/knowledge-graph";
import { concatJsonl, GraphLoader } from "@dkm/loaders";
import { loadDefaultRegistry, SchemaValidator } from "@dkm/schema";
import type { InventoryEntry, ValidationError } from "@dkm/schema";
import { beforeAll, describe, expect, it } from "vitest";
import { SPINE_JSONL_PATH } from "../src/seed";

/**
 * Feature 08 (#86, ADR-0009) — the curated Business-Architecture reference spine seed.
 * Loaded through the **real `GraphLoader`** (the exact pipeline the gateway seed runs, not a
 * hand-rolled fixture): asserts the ~11 L1 domains + ~28 L2 capabilities land as valid
 * `ReferenceCapability` nodes with correct L1/L2 parenting (criterion 2).
 *
 * The spine is the loader's CONSUMER contract for `BusinessArchitectureProjector`: L1 nodes
 * are roots (no `parent`); every L2 node names an existing L1 as its `parent`; parents are
 * denormalised **name** references (resolved at read time by the projector).
 */

const validator = new SchemaValidator(loadDefaultRegistry());

/**
 * Schema errors bar the one base-entry annotation the entire seed corpus shares: `id` is a
 * human-readable slug (`ref-portfolio-management`), not a UUID — the convention across every
 * `demo/*.jsonl` file, which the `GraphLoader` does not enforce. Every *other* constraint
 * (name/level/framework/parent, the `type` const, evidence) is asserted in full.
 */
function schemaErrorsBarSeedId(node: InventoryEntry): ValidationError[] {
  const { errors } = validator.validate(node, "ReferenceCapability");
  return errors.filter((e) => !(e.keyword === "format" && e.path === "/id"));
}

describe("Business-Architecture reference-spine seed", () => {
  let nodes: InventoryEntry[];
  let byName: Map<string, InventoryEntry>;

  beforeAll(async () => {
    const graph = new InMemoryGraphAdapter();
    const loader = new GraphLoader(graph);
    await loader.initialize({});
    const result = await loader.load(concatJsonl([SPINE_JSONL_PATH]), "spine-seed-test");
    expect(result.failed).toBe(0);

    nodes = (await graph.findByType("ReferenceCapability")) as InventoryEntry[];
    byName = new Map(nodes.map((n) => [n.name as string, n]));
  });

  it("loads only ReferenceCapability nodes, all schema-valid", () => {
    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) {
      expect(node.type).toBe("ReferenceCapability");
      expect(schemaErrorsBarSeedId(node)).toEqual([]);
    }
  });

  it("has 11 curated L1 enterprise domains (roots, no parent)", () => {
    const l1 = nodes.filter((n) => n.level === 1);
    expect(l1).toHaveLength(11);
    for (const domain of l1) expect(domain.parent).toBeUndefined();
    expect(l1.map((n) => n.name).sort()).toEqual(
      [
        "Corporate Services",
        "Data & Analytics",
        "External Relationships",
        "Investment Management",
        "Investment Stewardship & Responsible Investment",
        "Operations & Fund Administration",
        "Product & Client Management",
        "Risk & Compliance",
        "Strategy & Enterprise Governance",
        "Sustainability & ESG",
        "Technology & Digital Services",
      ].sort(),
    );
  });

  it("has 28 curated L2 capabilities, each parented to an existing L1 domain", () => {
    const l1Names = new Set(nodes.filter((n) => n.level === 1).map((n) => n.name));
    const l2 = nodes.filter((n) => n.level === 2);
    expect(l2).toHaveLength(28);
    for (const cap of l2) {
      expect(typeof cap.parent).toBe("string");
      expect(l1Names.has(cap.parent as string)).toBe(true);
    }
  });

  it("has no spine node below L2 (the spine is L1+L2 only)", () => {
    expect(nodes.every((n) => n.level === 1 || n.level === 2)).toBe(true);
  });

  it("parents the canonical exemplar capabilities correctly", () => {
    expect(byName.get("Portfolio Management")?.parent).toBe("Investment Management");
    expect(byName.get("Stewardship")?.parent).toBe("Investment Stewardship & Responsible Investment");
    expect(byName.get("Compliance")?.parent).toBe("Risk & Compliance");
    expect(byName.get("Investment Operations")?.parent).toBe("Operations & Fund Administration");
  });

  it("attributes every curated node to a reference framework", () => {
    for (const node of nodes) expect(node.framework).toBe("BIZBOK");
  });
});
