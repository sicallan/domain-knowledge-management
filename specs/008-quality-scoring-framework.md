# 008 — Quality Scoring Framework

## Purpose & Scope

The Quality Scoring Framework measures and tracks the quality of every fact in the knowledge graph across six dimensions: accuracy, completeness, consistency, timeliness, provenance, and confidence. It produces composite quality scores that drive automation decisions (auto-merge thresholds), surface quality issues for human review, and provide trend visibility.

**In scope:**
- Quality dimension definitions and measurement methods
- Composite score computation (weighted combination)
- Quality threshold configuration (per inventory type, per use case)
- Quality trend tracking over time
- Golden dataset management (for accuracy/completeness benchmarking)
- Quality alerting (entries falling below threshold)

**Out of scope:**
- Contradiction detection logic (that's the Contradiction Agent spec)
- Correction proposal logic (that's the Correction Agent)
- UI presentation of quality data (that's the Admin Console spec)

---

## Inputs

| Input | Source | Format |
|-------|--------|--------|
| Inventory entry | Graph store / extraction pipeline | Entry with metadata (confidence, provenance, timestamps) |
| Golden dataset | Maintained by data stewards | `{ expectedEntities, expectedRelationships }` per domain area |
| Graph mutation events | Event log | For triggering re-scoring |
| Quality configuration | Admin | Weights, thresholds, policies per inventory type |

---

## Outputs

| Output | Consumer | Format |
|--------|----------|--------|
| Quality score (per entry) | All consumers; stored as entry metadata | `{ composite: 0.0–1.0, dimensions: {...} }` |
| Quality alerts | Admin console, notification system | `{ entryId, dimension, currentScore, threshold }` |
| Aggregate quality metrics | Dashboard, reporting | Per-type, per-context, per-layer aggregations |
| Quality trend data | Dashboard | Time series of scores per scope |

---

## Behaviour

### Quality Dimensions

| Dimension | Definition | Measurement Method | Range |
|-----------|-----------|-------------------|-------|
| **Accuracy** | Is the extracted fact correct? | Precision against golden dataset (where available); otherwise, based on extraction confidence | 0.0–1.0 |
| **Completeness** | Are all expected fields populated? | Required fields present / total required fields; relationships present / expected relationships | 0.0–1.0 |
| **Consistency** | Does this fact agree with related facts? | 1.0 if no contradictions detected; reduced proportionally to contradiction count and severity | 0.0–1.0 |
| **Timeliness** | Is the fact current? | Decay function based on time since last evidence refresh; configurable half-life per type | 0.0–1.0 |
| **Provenance** | Can the fact be traced to evidence? | 1.0 if all claims have evidence links; reduced per claim without evidence | 0.0–1.0 |
| **Confidence** | How certain is the extraction? | Raw extraction confidence from the pipeline; calibrated against golden dataset | 0.0–1.0 |

### Composite Score Computation

```
compositeScore = Σ(weight_i × dimension_i) / Σ(weight_i)
```

Default weights (configurable per inventory type):

| Dimension | Default Weight | Rationale |
|-----------|---------------|-----------|
| Accuracy | 0.25 | Most important: wrong facts are worse than missing ones |
| Completeness | 0.15 | Partial entries are still useful |
| Consistency | 0.20 | Contradictions erode trust |
| Timeliness | 0.15 | Staleness matters but doesn't invalidate facts |
| Provenance | 0.15 | Traceability is essential for compliance |
| Confidence | 0.10 | Already reflected in accuracy; avoid double-counting |

### Timeliness Decay Function

```
timeliness = exp(-λ × daysSinceLastEvidence)
```

Where `λ` (decay rate) is configurable per inventory type:
- Regulatory requirements: `λ = 0.001` (slow decay — regulations change infrequently)
- Operational evidence: `λ = 0.02` (fast decay — runtime reality changes frequently)
- Vendor documentation: `λ = 0.005` (moderate decay — vendor releases quarterly)

### Threshold Policies

| Policy | Threshold | Action |
|--------|-----------|--------|
| **Auto-publish** | composite ≥ 0.8 | Entry accepted without review |
| **Review required** | 0.6 ≤ composite < 0.8 | Entry queued for human review |
| **Reject** | composite < 0.6 | Entry not loaded; reported as quality failure |

Thresholds are configurable per:
- Inventory type (decisions may require higher quality than generic concepts)
- Source authority (regulatory sources get tighter thresholds)
- Layer (L3 operational evidence may tolerate lower completeness)

### Scoring Triggers

Quality scores are recomputed when:
1. **Entry created/updated** — initial scoring on extraction
2. **Related entry changes** — consistency dimension may change
3. **Time passes** — timeliness decays (periodic batch recomputation)
4. **Contradiction detected** — consistency dimension drops
5. **Golden dataset updated** — accuracy dimension recalibrated

---

## Interfaces & Contracts

### QualityScorer

```typescript
interface QualityScorer {
  // Score a single entry
  scoreEntry(entry: InventoryEntry, context?: ScoringContext): Promise<QualityScore>;
  
  // Batch score (efficient for bulk operations)
  scoreBatch(entries: InventoryEntry[]): Promise<Map<string, QualityScore>>;
  
  // Get current score for an already-scored entry
  getScore(entryId: string): Promise<QualityScore | null>;
  
  // Aggregate scores by scope
  getAggregateScores(scope: QualityScope): Promise<AggregateQualityMetrics>;
  
  // Get trend data
  getTrend(scope: QualityScope, period: { from: string; to: string }): Promise<QualityTrend>;
}

interface QualityScore {
  entryId: string;
  composite: number;                   // 0.0–1.0
  dimensions: {
    accuracy: number;
    completeness: number;
    consistency: number;
    timeliness: number;
    provenance: number;
    confidence: number;
  };
  computedAt: string;                  // ISO 8601
  policy: 'auto-publish' | 'review-required' | 'reject';
  alerts: QualityAlert[];
}

interface QualityAlert {
  dimension: string;
  currentValue: number;
  threshold: number;
  message: string;
  severity: 'warning' | 'critical';
}

interface QualityScope {
  type?: InventoryType;
  layer?: 'L0' | 'L1' | 'L2' | 'L3';
  boundedContext?: string;
  sourceAuthority?: string;
}

interface AggregateQualityMetrics {
  scope: QualityScope;
  entryCount: number;
  averageComposite: number;
  dimensionAverages: Record<string, number>;
  distribution: {
    excellent: number;    // ≥ 0.9
    good: number;         // 0.8–0.9
    acceptable: number;   // 0.6–0.8
    poor: number;         // < 0.6
  };
  alertCount: number;
}
```

### QualityConfiguration

```typescript
interface QualityConfiguration {
  // Get weights for an inventory type
  getWeights(type: InventoryType): DimensionWeights;
  
  // Get thresholds for a context
  getThresholds(type: InventoryType, sourceAuthority: string): ThresholdPolicy;
  
  // Get decay rate for timeliness
  getDecayRate(type: InventoryType): number;
  
  // Update configuration
  updateWeights(type: InventoryType, weights: DimensionWeights): Promise<void>;
  updateThresholds(type: InventoryType, thresholds: ThresholdPolicy): Promise<void>;
}
```

---

## Dependencies

| Depends on | Reason |
|------------|--------|
| Schema Module | Determines which fields are required (completeness dimension) |
| Graph Persistence Port (event log) | Triggers re-scoring on mutations |
| Golden datasets | Accuracy measurement baseline |

| Depended on by | Reason |
|----------------|--------|
| Loader orchestrator | Quality gates (reject entries below threshold) |
| Extraction pipeline | Confidence scoring feeds into quality |
| Admin console | Displays quality dashboards and alerts |
| Auto-merge policy | Uses quality score to decide auto-approve vs review |
| Staleness detection | Timeliness dimension drives staleness alerts |

---

## Key Decisions

### Decision 1: Score Storage Location

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Stored as entry metadata (in graph)** | Co-located with data; queryable alongside entries; single source of truth | Graph mutations for every score update; score history bloats graph; coupling |
| **Separate quality store (PostgreSQL table)** | Independent; no graph bloat; easy time-series queries; efficient aggregation | Separate system; data locality lost; must join for filtered queries |
| **Cached in-memory with persistence** | Fast reads; no storage coupling; simple computation model | Lost on restart; must rebuild; not suitable for historical trend analysis |

**Recommendation: Separate quality store (PostgreSQL table) with score summary on entry**

*Rationale*: Quality scores are recomputed frequently (timeliness decay, related entry changes) and need time-series history for trend analysis. Storing full score history in the graph would bloat it. A dedicated PostgreSQL table gives efficient aggregation, time-series queries, and reporting. The entry in the graph carries only the current composite score (for query-time filtering) — the detailed breakdown lives in the quality store.

---

### Decision 2: Golden Dataset Management

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **File-based (JSON fixtures in repo)** | Version-controlled; reviewable in PRs; simple; works offline | Limited to development team; no admin UI; harder to maintain at scale |
| **Database-managed (admin UI for curation)** | Data stewards can maintain directly; supports large datasets; live evaluation | More infrastructure; must build curation UI; access control needed |
| **Hybrid (seed from files, evolve via admin UI)** | Initial datasets from repo; stewards extend/correct via UI; version snapshots | More complex; two management paths; must keep in sync |

**Recommendation: File-based initially, evolve to hybrid in Phase 5**

*Rationale*: In Phase 0–2, the golden dataset is small and managed by the development team. File-based fixtures in the repo are sufficient and benefit from version control and CI integration. When data stewards are onboarded (Phase 5), an admin UI for golden dataset curation becomes necessary. The file format remains the canonical schema — the admin UI produces the same JSON structure.

---

### Decision 3: Scoring Frequency for Timeliness

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Real-time (continuous decay computation)** | Always accurate; no lag | Expensive; unnecessary precision; constant recomputation |
| **Daily batch** | Simple; predictable; bounded compute cost | Up to 24h staleness in the timeliness dimension itself; batch job management |
| **On-access (lazy recomputation)** | Only compute when someone looks; efficient for rarely-accessed entries | First access may be slow; aggregate reports require full scan; inconsistent |
| **Event-triggered + daily floor** | Recompute on relevant events; daily sweep for timeliness decay | Responsive to changes; bounded daily cost; timeliness never more than 24h stale |

**Recommendation: Event-triggered + daily batch for timeliness decay**

*Rationale*: Most quality dimensions should update immediately when their inputs change (contradiction detected → consistency drops; entry updated → completeness recalculated). Timeliness is the exception — it changes continuously by definition. A daily batch job recomputes timeliness for all entries efficiently. This gives responsive scoring for active changes while bounding the cost of passive decay.

---

## Open Questions

1. **Accuracy without golden dataset**: For inventory types where no golden dataset exists yet, how do we measure accuracy? Use confidence as a proxy? Default to 1.0 (assume correct until contradicted)?
2. **Score history retention**: How long do we keep historical scores? Indefinitely (for trend analysis) or with a retention policy?
3. **Cross-entry quality**: Some quality concerns are graph-level, not entry-level (e.g., "the graph is missing 40% of expected services"). Should there be a graph-health score separate from per-entry scores?
