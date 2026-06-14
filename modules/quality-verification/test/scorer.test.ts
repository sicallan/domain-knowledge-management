import { describe, expect, it } from "vitest";
import { loadDefaultRegistry } from "@dkm/schema";
import type { Evidence, InventoryEntry } from "@dkm/schema";
import { QualityConfiguration, QualityScorer } from "../src/index";

const NOW = "2026-06-14T00:00:00.000Z";
const MS_PER_DAY = 86_400_000;

function evidence(fetchedAt = NOW): Evidence[] {
  return [{ source: "spec.md", location: "§1", fetchedAt, sourceAuthority: "scheme" }];
}

function makeEntry(overrides: Partial<InventoryEntry> & { id?: string } = {}): InventoryEntry {
  return {
    id: overrides.id ?? "entry-1",
    type: "DomainConcept",
    version: "1.0.0",
    lifecycle_status: "active",
    validFrom: NOW,
    validTo: null,
    evidencedBy: evidence(),
    confidence: 0.9,
    name: "Payment",
    conceptType: "aggregate",
    ...overrides,
  } as InventoryEntry;
}

describe("QualityScorer — composite of known dimensions", () => {
  it("computes the weighted composite from controlled dimension inputs", async () => {
    const scorer = new QualityScorer();
    const score = await scorer.scoreEntry(makeEntry({ confidence: 0.9 }), {
      now: NOW,
      goldenAccuracy: 0.8,
      completeness: 1.0,
      consistency: 1.0,
    });
    // .25*.8 + .15*1 + .2*1 + .15*1 (timeliness, days=0) + .15*1 (provenance) + .1*.9
    expect(score.dimensions.accuracy).toBe(0.8);
    expect(score.dimensions.provenance).toBe(1);
    expect(score.dimensions.timeliness).toBeCloseTo(1, 6);
    expect(score.composite).toBeCloseTo(0.94, 6);
    expect(score.policy).toBe("auto-publish");
    expect(score.alerts).toEqual([]);
  });
});

describe("QualityScorer — timeliness decay", () => {
  it("applies exp(-λ·days) using the per-type decay rate", async () => {
    const scorer = new QualityScorer();
    const fetchedAt = new Date(Date.parse(NOW) - 100 * MS_PER_DAY).toISOString();
    const entry = makeEntry({ type: "Service", evidencedBy: evidence(fetchedAt) });
    const score = await scorer.scoreEntry(entry, { now: NOW });
    // Service λ = 0.02, 100 days → exp(-2) ≈ 0.135335
    expect(score.dimensions.timeliness).toBeCloseTo(Math.exp(-0.02 * 100), 5);
  });

  it("treats fresh evidence (days=0) as fully timely", async () => {
    const scorer = new QualityScorer();
    const score = await scorer.scoreEntry(makeEntry(), { now: NOW });
    expect(score.dimensions.timeliness).toBeCloseTo(1, 6);
  });
});

describe("QualityScorer — provenance", () => {
  it("scores provenance 1.0 when evidence exists and 0 when absent", async () => {
    const scorer = new QualityScorer();
    const withEvidence = await scorer.scoreEntry(makeEntry(), { now: NOW });
    expect(withEvidence.dimensions.provenance).toBe(1);

    const withoutEvidence = await scorer.scoreEntry(makeEntry({ id: "e2", evidencedBy: [] }), { now: NOW });
    expect(withoutEvidence.dimensions.provenance).toBe(0);
    expect(withoutEvidence.alerts.some((a) => a.dimension === "provenance" && a.severity === "critical")).toBe(true);
  });
});

describe("QualityScorer — schema-derived completeness", () => {
  const scorer = new QualityScorer(new QualityConfiguration(), loadDefaultRegistry());

  it("scores 1.0 when all required fields are present", async () => {
    const decision = makeEntry({
      id: "d1",
      type: "Decision",
      name: "Authorise",
      decisionType: "automated",
      outcomes: ["approve", "decline"],
    });
    const score = await scorer.scoreEntry(decision, { now: NOW });
    expect(score.dimensions.completeness).toBe(1);
  });

  it("drops below 1.0 when a required field is missing", async () => {
    const decision = makeEntry({
      id: "d2",
      type: "Decision",
      name: "Authorise",
      decisionType: "automated",
      // outcomes missing → 8 of 9 expected fields present
    });
    delete (decision as Record<string, unknown>).outcomes;
    const score = await scorer.scoreEntry(decision, { now: NOW });
    expect(score.dimensions.completeness).toBeCloseTo(8 / 9, 6);
  });
});

describe("QualityScorer — threshold policy bands", () => {
  const scorer = new QualityScorer();

  it("classifies a mid-range entry as review-required", async () => {
    const score = await scorer.scoreEntry(makeEntry({ id: "r1", confidence: 0.6 }), {
      now: NOW,
      goldenAccuracy: 0.6,
      completeness: 0.6,
      consistency: 0.6,
    });
    expect(score.composite).toBeCloseTo(0.72, 6);
    expect(score.policy).toBe("review-required");
  });

  it("classifies a poor entry as reject", async () => {
    const score = await scorer.scoreEntry(makeEntry({ id: "r2", confidence: 0.2, evidencedBy: [] }), {
      now: NOW,
      goldenAccuracy: 0.2,
      completeness: 0.2,
      consistency: 0.2,
    });
    expect(score.composite).toBeLessThan(0.6);
    expect(score.policy).toBe("reject");
  });
});

describe("QualityScorer — consistency from contradictions", () => {
  it("reduces consistency proportionally to contradiction count", async () => {
    const scorer = new QualityScorer();
    const score = await scorer.scoreEntry(makeEntry({ id: "c1" }), { now: NOW, contradictionCount: 2 });
    expect(score.dimensions.consistency).toBeCloseTo(0.5, 6);
  });
});

describe("QualityScorer — per-type weight overrides (OCP config)", () => {
  it("changes the composite when a type's weights are overridden", async () => {
    const config = new QualityConfiguration({
      weights: {
        Decision: { accuracy: 1, completeness: 0, consistency: 0, timeliness: 0, provenance: 0, confidence: 0 },
      },
    });
    const scorer = new QualityScorer(config);
    const score = await scorer.scoreEntry(
      makeEntry({ id: "w1", type: "Decision", confidence: 0.1 }),
      { now: NOW, goldenAccuracy: 0.42 },
    );
    // Composite is driven entirely by accuracy under the override.
    expect(score.composite).toBeCloseTo(0.42, 6);
  });
});

describe("QualityScorer — batch and aggregate", () => {
  it("scores a batch and aggregates by scope", async () => {
    const scorer = new QualityScorer();
    await scorer.scoreBatch([
      makeEntry({ id: "a1", type: "Decision", confidence: 0.95 }),
      makeEntry({ id: "a2", type: "Decision", confidence: 0.3, evidencedBy: [] }),
    ]);
    const agg = await scorer.getAggregateScores({ type: "Decision" });
    expect(agg.entryCount).toBe(2);
    expect(agg.averageComposite).toBeGreaterThan(0);
    expect(await scorer.getScore("a1")).not.toBeNull();
    expect(await scorer.getScore("missing")).toBeNull();
  });
});
