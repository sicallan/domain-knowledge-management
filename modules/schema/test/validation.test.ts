import { describe, expect, it } from "vitest";
import { loadModule, makeEntry } from "./helpers";

const { validator } = loadModule();

describe("L1 inventory schema validation — valid fixtures pass", () => {
  const validCases: Array<[string, Record<string, unknown>]> = [
    ["DomainConcept", { name: "Payment", conceptType: "aggregate", boundedContext: "Authorisation" }],
    ["BusinessCapability", { name: "Accept Payments", level: 1 }],
    ["BusinessInvariant", { statement: "Captured amount must not exceed authorised amount", severity: "critical", scope: "context-specific" }],
    ["Rule", { expression: "amount <= dailyLimit", ruleType: "validation", source: "scheme-rulebook" }],
    ["ReferenceData", { name: "BIN Ranges", owner: "Data Steward", updateFrequency: "daily" }],
    ["Decision", { name: "Authorise Transaction", decisionType: "automated", outcomes: ["approve", "decline"] }],
  ];

  for (const [type, payload] of validCases) {
    it(`accepts a valid ${type}`, () => {
      const result = validator.validate(makeEntry(type, payload), type);
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    });
  }
});

describe("L1 inventory schema validation — invalid fixtures rejected", () => {
  it("rejects an entry missing a required type-specific field (Decision.outcomes)", () => {
    const entry = makeEntry("Decision", { name: "Authorise", decisionType: "automated" });
    const result = validator.validate(entry, "Decision");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.keyword === "required")).toBe(true);
  });

  it("rejects an entry with no provenance (empty evidencedBy)", () => {
    const entry = makeEntry("DomainConcept", { name: "Payment", conceptType: "aggregate" });
    entry.evidencedBy = [];
    const result = validator.validate(entry, "DomainConcept");
    expect(result.valid).toBe(false);
  });

  it("rejects an entry missing the required temporal validFrom field", () => {
    const entry = makeEntry("DomainConcept", { name: "Payment", conceptType: "aggregate" });
    delete (entry as Record<string, unknown>).validFrom;
    const result = validator.validate(entry, "DomainConcept");
    expect(result.valid).toBe(false);
  });

  it("rejects a bad enum value (conceptType)", () => {
    const entry = makeEntry("DomainConcept", { name: "Payment", conceptType: "not-a-real-kind" });
    const result = validator.validate(entry, "DomainConcept");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.keyword === "enum")).toBe(true);
  });

  it("rejects a malformed semver version", () => {
    const entry = makeEntry("Rule", { expression: "x > 0", ruleType: "validation" });
    entry.version = "v1";
    const result = validator.validate(entry, "Rule");
    expect(result.valid).toBe(false);
  });

  it("rejects an invalid lifecycle_status", () => {
    const entry = makeEntry("Rule", { expression: "x > 0", ruleType: "validation" });
    (entry as Record<string, unknown>).lifecycle_status = "archived";
    const result = validator.validate(entry, "Rule");
    expect(result.valid).toBe(false);
  });

  it("rejects a confidence outside 0..1", () => {
    const entry = makeEntry("Rule", { expression: "x > 0", ruleType: "validation" });
    entry.confidence = 1.5;
    const result = validator.validate(entry, "Rule");
    expect(result.valid).toBe(false);
  });

  it("rejects validation against an unknown type", () => {
    const result = validator.validate({}, "NotARealType");
    expect(result.valid).toBe(false);
  });
});

describe("open schema — additive extension is permitted", () => {
  it("accepts unknown additional top-level fields (OCP additive evolution)", () => {
    const entry = makeEntry("DomainConcept", {
      name: "Payment",
      conceptType: "aggregate",
      futureField: { added: "later" },
    });
    const result = validator.validate(entry, "DomainConcept");
    expect(result.valid).toBe(true);
  });
});

describe("relationship validation", () => {
  const relBase = {
    id: "22222222-2222-4222-8222-222222222222",
    type: "Relationship" as const,
    version: "1.0.0",
    evidencedBy: [{ source: "spec.md", fetchedAt: "2026-01-01T00:00:00Z" }],
  };

  it("accepts a valid relationship", () => {
    const result = validator.validateRelationship({
      ...relBase,
      relationshipType: "evaluates",
      sourceId: "decision-1",
      targetId: "rule-1",
      direction: "directed",
    });
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("rejects a relationship missing endpoints", () => {
    const result = validator.validateRelationship({ ...relBase, relationshipType: "evaluates" });
    expect(result.valid).toBe(false);
  });

  it("rejects a relationship with the wrong type discriminator", () => {
    const result = validator.validateRelationship({
      ...relBase,
      type: "DomainConcept",
      relationshipType: "evaluates",
      sourceId: "a",
      targetId: "b",
    });
    expect(result.valid).toBe(false);
  });
});

describe("lifecycle transition validation", () => {
  it("permits draft → active", () => {
    expect(validator.validateTransition("draft", "active").valid).toBe(true);
  });

  it("permits active → deprecated → retired", () => {
    expect(validator.validateTransition("active", "deprecated").valid).toBe(true);
    expect(validator.validateTransition("deprecated", "retired").valid).toBe(true);
  });

  it("rejects retired → active (terminal state)", () => {
    expect(validator.validateTransition("retired", "active").valid).toBe(false);
  });

  it("rejects skipping straight from draft → deprecated", () => {
    expect(validator.validateTransition("draft", "deprecated").valid).toBe(false);
  });
});
