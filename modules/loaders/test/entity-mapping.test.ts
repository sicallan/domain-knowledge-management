import { describe, expect, it } from "vitest";
import type { JsonlEntry } from "@dkm/schema";
import { entryToNode } from "../src/index";

function entry(overrides: Partial<JsonlEntry> = {}): JsonlEntry {
  return {
    id: "e-1",
    type: "DomainConcept",
    version: "1.0.0",
    source: { file: "spec.md", location: "§1", fetchedAt: "2026-01-01T00:00:00Z", sourceAuthority: "scheme" },
    confidence: 0.9,
    extractedAt: "2026-01-02T00:00:00Z",
    data: { name: "Payment", conceptType: "aggregate" },
    ...overrides,
  };
}

describe("entryToNode — inventory JSONL entry → graph node", () => {
  it("carries the type-specific data fields onto the node", () => {
    const node = entryToNode(entry());
    expect(node.name).toBe("Payment");
    expect(node.conceptType).toBe("aggregate");
  });

  it("takes id/type/version from the entry's fixed core (authoritative over data)", () => {
    const node = entryToNode(
      entry({ id: "core-id", type: "Decision", version: "2.1.0", data: { id: "stale", type: "Rule", name: "x" } }),
    );
    expect(node.id).toBe("core-id");
    expect(node.type).toBe("Decision");
    expect(node.version).toBe("2.1.0");
  });

  it("defaults lifecycle/temporal fields when the payload omits them", () => {
    const node = entryToNode(entry());
    expect(node.lifecycle_status).toBe("active");
    expect(node.validFrom).toBe("2026-01-02T00:00:00Z"); // falls back to extractedAt
    expect(node.validTo).toBeNull();
  });

  it("preserves explicit lifecycle/temporal fields embedded in data", () => {
    const node = entryToNode(
      entry({ data: { name: "P", lifecycle_status: "deprecated", validFrom: "2025-06-01T00:00:00Z" } }),
    );
    expect(node.lifecycle_status).toBe("deprecated");
    expect(node.validFrom).toBe("2025-06-01T00:00:00Z");
  });

  it("derives evidencedBy from source provenance when data has none", () => {
    const node = entryToNode(entry());
    expect(node.evidencedBy).toEqual([
      { source: "spec.md", location: "§1", fetchedAt: "2026-01-01T00:00:00Z", sourceAuthority: "scheme" },
    ]);
  });

  it("uses the entry's top-level confidence", () => {
    const node = entryToNode(entry({ confidence: 0.42 }));
    expect(node.confidence).toBe(0.42);
  });
});
