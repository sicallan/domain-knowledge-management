import { describe, expect, it } from "vitest";
import type { JsonlEntry } from "@dkm/schema";
import { entryToEdge, isRelationship, MappingError } from "../src/index";

function relEntry(data: Record<string, unknown>, overrides: Partial<JsonlEntry> = {}): JsonlEntry {
  return {
    id: "r-1",
    type: "Relationship",
    version: "1.0.0",
    source: { file: "spec.md", location: "§2", fetchedAt: "2026-01-01T00:00:00Z", sourceAuthority: "scheme" },
    confidence: 0.88,
    extractedAt: "2026-01-02T00:00:00Z",
    data,
    ...overrides,
  };
}

describe("isRelationship", () => {
  it("is true only for the fixed Relationship type", () => {
    expect(isRelationship(relEntry({ relationshipType: "evaluates", sourceEntityId: "a", targetEntityId: "b" }))).toBe(true);
    expect(isRelationship({ ...relEntry({}), type: "DomainConcept" })).toBe(false);
  });
});

describe("entryToEdge — relationship JSONL entry → typed edge", () => {
  it("maps relationshipType / sourceEntityId / targetEntityId onto a typed edge", () => {
    const edge = entryToEdge(relEntry({ relationshipType: "evaluates", sourceEntityId: "dec-1", targetEntityId: "rule-1" }));
    expect(edge.type).toBe("Relationship");
    expect(edge.relationshipType).toBe("evaluates");
    expect(edge.sourceId).toBe("dec-1");
    expect(edge.targetId).toBe("rule-1");
    expect(edge.id).toBe("r-1");
    expect(edge.confidence).toBe(0.88);
  });

  it("derives evidencedBy from source provenance", () => {
    const edge = entryToEdge(relEntry({ relationshipType: "consumes", sourceEntityId: "a", targetEntityId: "b" }));
    expect(edge.evidencedBy).toEqual([
      { source: "spec.md", location: "§2", fetchedAt: "2026-01-01T00:00:00Z", sourceAuthority: "scheme" },
    ]);
  });

  it("carries relationship metadata when present", () => {
    const edge = entryToEdge(
      relEntry({ relationshipType: "evaluates", sourceEntityId: "a", targetEntityId: "b", metadata: { weight: 1 } }),
    );
    expect(edge.metadata).toEqual({ weight: 1 });
  });

  it.each([
    ["relationshipType", { sourceEntityId: "a", targetEntityId: "b" }],
    ["sourceEntityId", { relationshipType: "evaluates", targetEntityId: "b" }],
    ["targetEntityId", { relationshipType: "evaluates", sourceEntityId: "a" }],
  ])("throws a non-retriable MappingError when %s is missing", (_field, data) => {
    let caught: unknown;
    try {
      entryToEdge(relEntry(data));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(MappingError);
    expect((caught as MappingError).retriable).toBe(false);
  });
});
