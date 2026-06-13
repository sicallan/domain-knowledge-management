# 010 — Contradiction Detection Agent

## Purpose & Scope

The Contradiction Detection Agent identifies conflicting facts within the knowledge graph — cases where multiple sources or extractions assert incompatible information about the same domain concept. It surfaces contradictions for resolution, enabling the knowledge graph to maintain internal consistency.

**In scope:**
- Contradiction detection across sources (same concept, different assertions)
- Contradiction classification (type, severity, scope)
- Resolution suggestion generation (which assertion to keep, based on authority/recency/confidence)
- Contradiction tracking and lifecycle management
- Integration with quality scoring (consistency dimension)

**Out of scope:**
- Actually resolving contradictions (that's the correction agent + human review)
- UI presentation (that's the Admin Console spec)
- General data quality beyond contradictions (that's the Quality Framework spec)

---

## Inputs

| Input | Source | Format |
|-------|--------|--------|
| New/updated entries | Graph mutation events (event log) | Entry with provenance and confidence |
| Existing graph state | Graph Persistence Port | Entries that may contradict the new one |
| Contradiction rules | Configuration | Defines what constitutes a contradiction per type |
| Resolution history | Contradiction store | Previously resolved contradictions (learning input) |

---

## Outputs

| Output | Consumer | Format |
|--------|----------|--------|
| Detected contradictions | Contradiction queue (admin console) | `Contradiction` objects (see Interfaces) |
| Resolution suggestions | Admin console, auto-merge policy | Ranked resolution options with rationale |
| Consistency score updates | Quality scoring framework | Updated consistency dimension per affected entry |
| Contradiction events | Event log, notifications | Alert that a contradiction was detected |

---

## Behaviour

### Detection Triggers

The agent runs when:
1. **New entry loaded**: Check if it contradicts any existing entry of the same type in the same scope
2. **Entry updated**: Check if the update introduces contradictions with related entries
3. **Periodic scan**: Scheduled sweep for contradictions that may have been missed (e.g., introduced by concurrent loads)

### Contradiction Types

| Type | Description | Example |
|------|-------------|---------|
| **Value conflict** | Same attribute, different values | Amount limit: Source A says €15,000, Source B says €100,000 |
| **Temporal overlap** | Same entity with overlapping valid periods and different states | Two "active" versions of the same rule with overlapping validFrom/validTo |
| **Relationship conflict** | Incompatible relationships | Service X `belongsTo` Context A AND `belongsTo` Context B (cardinality: N:1) |
| **Lifecycle conflict** | Incompatible status assertions | One source says "active", another says "deprecated" |
| **Semantic conflict** | Conceptually incompatible assertions (detected via LLM) | Rule A: "transactions above limit must be rejected"; Rule B: "all transactions must be processed" |

### Detection Strategies

#### 1. Attribute Comparison (deterministic)
- For entries of the same type with matching identifiers (same entity)
- Compare each attribute; flag differences
- Fast, cheap, high precision

#### 2. Cardinality Violation (deterministic)
- Check relationship cardinality constraints (from schema)
- If a relationship type has max cardinality 1 and multiple edges exist, that's a contradiction
- Definitive; no false positives

#### 3. Temporal Logic (deterministic)
- Entries representing the same concept with overlapping valid periods must not have conflicting attribute values
- Applies bi-temporal rules: valid time must not overlap for incompatible states

#### 4. Semantic Analysis (LLM-based)
- For complex contradictions that can't be detected by attribute comparison
- Compare the semantic meaning of related entries (e.g., rules that govern the same concept but make incompatible assertions)
- Higher recall but lower precision; more expensive
- Run as a batch job on subsets, not on every entry

### Resolution Suggestion Logic

When a contradiction is detected, suggest resolution based on:

1. **Source authority hierarchy**: `regulatory > scheme > vendor > project > operational`
2. **Temporal recency**: More recent source wins (when authority is equal)
3. **Confidence score**: Higher extraction confidence wins (when authority and time are equal)
4. **Corroboration**: Assertion supported by multiple sources is preferred
5. **Version**: Later version of same document supersedes earlier version

The suggestion includes:
- Which assertion to keep (with rationale)
- What to do with the losing assertion (archive, mark as superseded, delete)
- Confidence in the suggestion itself

---

## Interfaces & Contracts

### ContradictionAgent

```typescript
interface ContradictionAgent {
  // Check a specific entry against existing graph
  checkEntry(entry: InventoryEntry): Promise<Contradiction[]>;
  
  // Run periodic scan over a scope
  scanScope(scope: ContradictionScope): Promise<ContradictionScanResult>;
  
  // Generate resolution suggestion for a detected contradiction
  suggestResolution(contradictionId: string): Promise<ResolutionSuggestion>;
  
  // Get all active contradictions
  listContradictions(filters?: ContradictionFilter): Promise<Contradiction[]>;
}

interface Contradiction {
  id: string;
  detectedAt: string;
  type: 'value_conflict' | 'temporal_overlap' | 'relationship_conflict' | 'lifecycle_conflict' | 'semantic_conflict';
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'resolved' | 'dismissed' | 'auto-resolved';
  
  // The conflicting parties
  entries: {
    entryId: string;
    attribute?: string;          // Which attribute conflicts
    value: unknown;              // The conflicting value
    source: SourceProvenance;
    confidence: number;
    extractedAt: string;
  }[];
  
  // Context
  affectedConcept: string;       // What domain concept is contradicted
  affectedType: InventoryType;
  boundedContext?: string;
  
  // Resolution
  resolution?: {
    resolvedAt: string;
    resolvedBy: string;          // User or 'auto'
    action: 'keep_a' | 'keep_b' | 'merge' | 'dismiss';
    rationale: string;
  };
}

interface ResolutionSuggestion {
  contradictionId: string;
  suggestedAction: 'keep_a' | 'keep_b' | 'merge' | 'escalate';
  confidence: number;           // How confident is the suggestion
  rationale: string;            // Human-readable explanation
  factors: {
    authorityComparison: string;
    recencyComparison: string;
    confidenceComparison: string;
    corroborationComparison: string;
  };
}

interface ContradictionScope {
  types?: InventoryType[];
  boundedContexts?: string[];
  sinceTimestamp?: string;       // Only check entries added/modified since this time
  strategy: 'deterministic' | 'semantic' | 'all';
}

interface ContradictionScanResult {
  scope: ContradictionScope;
  scannedEntries: number;
  contradictionsFound: number;
  newContradictions: Contradiction[];
  duration: number;
}
```

---

## Dependencies

| Depends on | Reason |
|------------|--------|
| Graph Persistence Port | Query existing entries for comparison |
| Graph Persistence Port (event log) | Trigger detection on new entries |
| Schema Module | Understand cardinality constraints and required fields |
| LLM Gateway | Semantic contradiction detection |
| Quality Scoring Framework | Update consistency scores |

| Depended on by | Reason |
|----------------|--------|
| Quality Scoring Framework | Consistency dimension updated on detection |
| Admin Console (Corrections Queue) | Surfaces contradictions for review |
| Auto-merge Policy | May auto-resolve high-confidence contradictions |
| Notification system | Alerts stewards of new contradictions |

---

## Key Decisions

### Decision 1: Detection Timing

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Synchronous (at load time)** | Contradictions caught immediately; never enters graph undetected; consistent state guaranteed | Increases load latency; blocks ingestion; may be expensive for large batches |
| **Asynchronous (event-triggered, after load)** | Non-blocking ingestion; batch-efficient; load latency unaffected | Contradictions briefly exist in graph undetected; eventual consistency; slightly complex |
| **Hybrid (fast deterministic at load, slow semantic async)** | Best of both: cheap checks are immediate; expensive checks are background; good UX | Two code paths; must handle both detection timings; slightly more complex |

**Recommendation: Hybrid (deterministic checks at load time, semantic checks async)**

*Rationale*: Attribute comparison and cardinality checks are cheap and deterministic — they should run at load time to prevent obvious contradictions from entering the graph silently. Semantic analysis (LLM-based) is expensive and better suited to batch processing. The hybrid approach gives immediate protection against structural contradictions while allowing the more nuanced semantic detection to run at its own pace.

---

### Decision 2: Semantic Contradiction Detection Approach

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Embedding similarity + threshold** | Fast; scalable; catches paraphrased contradictions | High false positive rate (similar ≠ contradictory); threshold tuning needed |
| **LLM classification (pairwise)** | Nuanced; handles complex logic; low false positives | Expensive (O(n²) comparisons); slow; non-deterministic |
| **LLM classification with candidate pre-filtering** | Embedding pre-filter reduces candidate pairs; LLM confirms | Efficient; accurate; best of both | More complex pipeline; pre-filter may miss some candidates |
| **Rule-based semantic rules** | Fast; deterministic; no LLM cost | Can't handle novel contradictions; extensive rule authoring needed; brittle |

**Recommendation: LLM classification with embedding pre-filtering**

*Rationale*: Pure pairwise LLM comparison is O(n²) and unaffordable. Embedding similarity efficiently identifies candidate pairs (entries that are semantically similar enough to potentially contradict). The LLM then evaluates only these candidates — a much smaller set — for actual contradiction. This gives us the precision of LLM reasoning with the efficiency of vector-based pre-filtering.

---

### Decision 3: Auto-Resolution Policy

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Never auto-resolve (always human review)** | Maximum safety; no incorrect auto-resolutions; full audit trail | Slow; queue builds up; blocks on human availability; simple cases waste reviewer time |
| **Always auto-resolve (based on authority rules)** | Fast; no queue buildup; fully automated | Risk of incorrect resolution; no human oversight; may resolve nuanced cases incorrectly |
| **Configurable threshold (auto-resolve if suggestion confidence > X)** | High-confidence cases resolved automatically; low-confidence gets review; tunable | Must set threshold correctly; still some risk of auto-errors; threshold management |

**Recommendation: Configurable threshold with type-specific policies**

*Rationale*: Some contradictions are unambiguous (same entity, newer version supersedes older version from same source = always auto-resolve). Others are genuinely ambiguous (two authoritative sources disagree on a business rule). Per-type policies let us auto-resolve the easy cases (version supersession, same-source updates) while requiring review for cross-source conflicts and regulatory-impacting contradictions.

---

## Open Questions

1. **Contradiction scope**: Should the agent only compare entries within the same bounded context, or also detect cross-context contradictions?
2. **Performance at scale**: With 100K+ entries, how do we efficiently identify potential contradiction pairs without comparing everything to everything?
3. **Learning from resolutions**: Should the agent learn from historical resolution patterns to improve future suggestions? If so, what's the feedback mechanism?
