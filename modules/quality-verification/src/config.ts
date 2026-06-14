import type { DimensionWeights, ThresholdPolicy } from "./types";

/** Default dimension weights (spec 008 "Composite Score Computation"). */
export const DEFAULT_WEIGHTS: DimensionWeights = {
  accuracy: 0.25,
  completeness: 0.15,
  consistency: 0.2,
  timeliness: 0.15,
  provenance: 0.15,
  confidence: 0.1,
};

/** Default threshold bands (spec 008 "Threshold Policies"). */
export const DEFAULT_THRESHOLDS: ThresholdPolicy = {
  autoPublish: 0.8,
  reviewRequired: 0.6,
};

/** Default timeliness decay rate λ (per day) and per-type overrides (spec 008). */
export const DEFAULT_DECAY_RATE = 0.005;

const DECAY_RATES: Record<string, number> = {
  RegulatoryRequirement: 0.001,
  VendorProduct: 0.005,
  // Operational/runtime evidence decays fast.
  Service: 0.02,
  Event: 0.02,
};

/**
 * QualityConfiguration — weights, thresholds, and decay rates, with per-type
 * overrides. Adding/overriding a type's configuration never requires touching the
 * scorer (OCP): pass overrides at construction or via the setters.
 */
export class QualityConfiguration {
  private readonly weights = new Map<string, DimensionWeights>();
  private readonly thresholds = new Map<string, ThresholdPolicy>();
  private readonly decayRates = new Map<string, number>(Object.entries(DECAY_RATES));

  constructor(overrides?: {
    weights?: Record<string, DimensionWeights>;
    thresholds?: Record<string, ThresholdPolicy>;
    decayRates?: Record<string, number>;
  }) {
    for (const [type, w] of Object.entries(overrides?.weights ?? {})) this.weights.set(type, w);
    for (const [type, t] of Object.entries(overrides?.thresholds ?? {})) this.thresholds.set(type, t);
    for (const [type, r] of Object.entries(overrides?.decayRates ?? {})) this.decayRates.set(type, r);
  }

  getWeights(type: string): DimensionWeights {
    return this.weights.get(type) ?? DEFAULT_WEIGHTS;
  }

  getThresholds(type: string): ThresholdPolicy {
    return this.thresholds.get(type) ?? DEFAULT_THRESHOLDS;
  }

  getDecayRate(type: string): number {
    return this.decayRates.get(type) ?? DEFAULT_DECAY_RATE;
  }

  setWeights(type: string, weights: DimensionWeights): void {
    this.weights.set(type, weights);
  }

  setThresholds(type: string, thresholds: ThresholdPolicy): void {
    this.thresholds.set(type, thresholds);
  }
}
