import type { Layer } from "@dkm/schema";

export type QualityDimension =
  | "accuracy"
  | "completeness"
  | "consistency"
  | "timeliness"
  | "provenance"
  | "confidence";

export type DimensionScores = Record<QualityDimension, number>;
export type DimensionWeights = Record<QualityDimension, number>;

export type QualityPolicy = "auto-publish" | "review-required" | "reject";

export interface ThresholdPolicy {
  /** composite ≥ autoPublish → auto-publish. */
  autoPublish: number;
  /** composite ≥ reviewRequired (and < autoPublish) → review; else reject. */
  reviewRequired: number;
}

export interface QualityAlert {
  dimension: QualityDimension;
  currentValue: number;
  threshold: number;
  message: string;
  severity: "warning" | "critical";
}

export interface QualityScore {
  entryId: string;
  composite: number;
  dimensions: DimensionScores;
  computedAt: string;
  policy: QualityPolicy;
  alerts: QualityAlert[];
}

/** Per-scoring inputs that the dimensions cannot derive from the entry alone. */
export interface ScoringContext {
  /** Reference "now" for timeliness decay (defaults to the current time). */
  now?: string;
  /** Accuracy against a golden dataset, when available (overrides the confidence proxy). */
  goldenAccuracy?: number;
  /** Number of detected contradictions touching this entry. */
  contradictionCount?: number;
  /** Explicit consistency override (0..1). */
  consistency?: number;
  /** Explicit completeness override (0..1), bypassing schema-derived completeness. */
  completeness?: number;
}

export interface QualityScope {
  type?: string;
  layer?: Layer;
  boundedContext?: string;
  sourceAuthority?: string;
}

export interface AggregateQualityMetrics {
  scope: QualityScope;
  entryCount: number;
  averageComposite: number;
  dimensionAverages: Record<string, number>;
  distribution: {
    excellent: number;
    good: number;
    acceptable: number;
    poor: number;
  };
  alertCount: number;
}
