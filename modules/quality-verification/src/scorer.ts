import type { InventoryEntry, JsonSchema, SchemaRegistry } from "@dkm/schema";
import { QualityConfiguration } from "./config";
import type {
  AggregateQualityMetrics,
  DimensionScores,
  QualityAlert,
  QualityDimension,
  QualityPolicy,
  QualityScope,
  QualityScore,
  ScoringContext,
} from "./types";

const BASE_REQUIRED = ["id", "type", "version", "lifecycle_status", "validFrom", "evidencedBy"];
const MS_PER_DAY = 86_400_000;
const DIMENSION_ALERT_THRESHOLD = 0.6;
const DIMENSION_CRITICAL_THRESHOLD = 0.4;
const DIMENSION_ORDER: QualityDimension[] = [
  "accuracy",
  "completeness",
  "consistency",
  "timeliness",
  "provenance",
  "confidence",
];

interface CachedScore {
  score: QualityScore;
  type: string;
  sourceAuthority?: string;
}

/**
 * QualityScorer — computes the six-dimension composite quality score (spec 008)
 * for an inventory entry. Dimensions derivable from the entry alone are computed
 * directly; the rest (accuracy vs golden, consistency vs contradictions) accept a
 * {@link ScoringContext}. A SchemaRegistry, when supplied, drives schema-accurate
 * completeness.
 */
export class QualityScorer {
  private readonly cache = new Map<string, CachedScore>();

  constructor(
    private readonly config: QualityConfiguration = new QualityConfiguration(),
    private readonly registry?: SchemaRegistry,
  ) {}

  async scoreEntry(entry: InventoryEntry, context: ScoringContext = {}): Promise<QualityScore> {
    const dimensions = this.computeDimensions(entry, context);
    const weights = this.config.getWeights(entry.type);
    const composite = round(weightedAverage(dimensions, weights));
    const thresholds = this.config.getThresholds(entry.type);
    const policy = toPolicy(composite, thresholds.autoPublish, thresholds.reviewRequired);
    const alerts = buildAlerts(dimensions);

    const score: QualityScore = {
      entryId: entry.id,
      composite,
      dimensions,
      computedAt: context.now ?? new Date().toISOString(),
      policy,
      alerts,
    };
    this.cache.set(entry.id, {
      score,
      type: entry.type,
      sourceAuthority: entry.evidencedBy?.[0]?.sourceAuthority,
    });
    return score;
  }

  async scoreBatch(entries: InventoryEntry[]): Promise<Map<string, QualityScore>> {
    const result = new Map<string, QualityScore>();
    for (const entry of entries) {
      result.set(entry.id, await this.scoreEntry(entry));
    }
    return result;
  }

  async getScore(entryId: string): Promise<QualityScore | null> {
    return this.cache.get(entryId)?.score ?? null;
  }

  async getAggregateScores(scope: QualityScope): Promise<AggregateQualityMetrics> {
    const matching = [...this.cache.values()].filter((c) => this.inScope(c, scope));
    const entryCount = matching.length;
    const distribution = { excellent: 0, good: 0, acceptable: 0, poor: 0 };
    const dimensionTotals: Record<string, number> = {};
    let compositeTotal = 0;
    let alertCount = 0;

    for (const { score } of matching) {
      compositeTotal += score.composite;
      alertCount += score.alerts.length;
      bucket(distribution, score.composite);
      for (const dim of DIMENSION_ORDER) {
        dimensionTotals[dim] = (dimensionTotals[dim] ?? 0) + score.dimensions[dim];
      }
    }

    const dimensionAverages: Record<string, number> = {};
    for (const dim of DIMENSION_ORDER) {
      dimensionAverages[dim] = entryCount ? round((dimensionTotals[dim] ?? 0) / entryCount) : 0;
    }

    return {
      scope,
      entryCount,
      averageComposite: entryCount ? round(compositeTotal / entryCount) : 0,
      dimensionAverages,
      distribution,
      alertCount,
    };
  }

  // ---- Dimensions ------------------------------------------------------------

  private computeDimensions(entry: InventoryEntry, context: ScoringContext): DimensionScores {
    return {
      accuracy: clamp(context.goldenAccuracy ?? entry.confidence ?? 0),
      completeness: clamp(context.completeness ?? this.completeness(entry)),
      consistency: clamp(this.consistency(context)),
      timeliness: clamp(this.timeliness(entry, context)),
      provenance: entry.evidencedBy && entry.evidencedBy.length > 0 ? 1 : 0,
      confidence: clamp(entry.confidence ?? 0),
    };
  }

  private completeness(entry: InventoryEntry): number {
    const expected = this.expectedFields(entry.type);
    if (expected.length === 0) return 1;
    const present = expected.filter((f) => isPresent(entry[f])).length;
    return present / expected.length;
  }

  private consistency(context: ScoringContext): number {
    if (context.consistency !== undefined) return context.consistency;
    if (context.contradictionCount !== undefined) {
      return 1 - 0.25 * context.contradictionCount;
    }
    return 1;
  }

  private timeliness(entry: InventoryEntry, context: ScoringContext): number {
    const now = context.now ? Date.parse(context.now) : Date.now();
    const lastEvidence = this.latestEvidenceTime(entry);
    if (lastEvidence === null) return 1;
    const days = Math.max(0, (now - lastEvidence) / MS_PER_DAY);
    const lambda = this.config.getDecayRate(entry.type);
    return Math.exp(-lambda * days);
  }

  private latestEvidenceTime(entry: InventoryEntry): number | null {
    const times: number[] = [];
    for (const e of entry.evidencedBy ?? []) {
      const t = Date.parse(e.fetchedAt);
      if (!Number.isNaN(t)) times.push(t);
    }
    if (times.length === 0) {
      const fallback = entry.validFrom ? Date.parse(entry.validFrom) : NaN;
      return Number.isNaN(fallback) ? null : fallback;
    }
    return Math.max(...times);
  }

  private expectedFields(type: string): string[] {
    const set = new Set(BASE_REQUIRED);
    if (!this.registry || !this.registry.hasType(type)) {
      return [...set];
    }
    const schema = this.registry.getSchema(type);
    collectRequired(schema, set);
    return [...set];
  }

  private inScope(cached: CachedScore, scope: QualityScope): boolean {
    if (scope.type && cached.type !== scope.type) return false;
    if (scope.sourceAuthority && cached.sourceAuthority !== scope.sourceAuthority) return false;
    if (scope.layer && this.registry && this.registry.layerOf(cached.type) !== scope.layer) return false;
    return true;
  }
}

function collectRequired(schema: JsonSchema, into: Set<string>): void {
  const req = (schema as { required?: unknown }).required;
  if (Array.isArray(req)) {
    for (const r of req) if (typeof r === "string") into.add(r);
  }
  const allOf = (schema as { allOf?: unknown[] }).allOf;
  if (Array.isArray(allOf)) {
    for (const branch of allOf) {
      if (branch && typeof branch === "object") collectRequired(branch as JsonSchema, into);
    }
  }
}

function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.length > 0;
  return true;
}

function weightedAverage(dimensions: DimensionScores, weights: Record<QualityDimension, number>): number {
  let weighted = 0;
  let total = 0;
  for (const dim of DIMENSION_ORDER) {
    const w = weights[dim] ?? 0;
    weighted += w * dimensions[dim];
    total += w;
  }
  return total === 0 ? 0 : weighted / total;
}

function toPolicy(composite: number, autoPublish: number, reviewRequired: number): QualityPolicy {
  if (composite >= autoPublish) return "auto-publish";
  if (composite >= reviewRequired) return "review-required";
  return "reject";
}

function buildAlerts(dimensions: DimensionScores): QualityAlert[] {
  const alerts: QualityAlert[] = [];
  for (const dim of DIMENSION_ORDER) {
    const value = dimensions[dim];
    if (value < DIMENSION_ALERT_THRESHOLD) {
      alerts.push({
        dimension: dim,
        currentValue: round(value),
        threshold: DIMENSION_ALERT_THRESHOLD,
        message: `${dim} (${round(value)}) is below the acceptable threshold (${DIMENSION_ALERT_THRESHOLD})`,
        severity: value < DIMENSION_CRITICAL_THRESHOLD ? "critical" : "warning",
      });
    }
  }
  return alerts;
}

function bucket(dist: { excellent: number; good: number; acceptable: number; poor: number }, composite: number): void {
  if (composite >= 0.9) dist.excellent += 1;
  else if (composite >= 0.8) dist.good += 1;
  else if (composite >= 0.6) dist.acceptable += 1;
  else dist.poor += 1;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
