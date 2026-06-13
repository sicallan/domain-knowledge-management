# 009 — Impact Assessment Agent

## Purpose & Scope

The Impact Assessment Agent analyses what is affected when something changes in the domain — a new regulation, a vendor version update, a schema change, or a strategic initiative shift. It traverses the knowledge graph from a trigger point outward, scoring and reporting affected entities across all layers.

**In scope:**
- Trigger document ingestion (regulation, strategy doc, change request)
- Obligation/directive extraction from trigger documents
- Multi-hop graph traversal from trigger to affected entities
- Impact scoring (severity, breadth, confidence)
- Structured impact report generation
- Blast radius visualisation data

**Out of scope:**
- General knowledge extraction (that's the Enrichment Pipeline)
- Remediation recommendations (future capability)
- Change execution (this agent reports impact, it doesn't make changes)

---

## Inputs

| Input | Source | Format |
|-------|--------|--------|
| Trigger document | User upload, source connector | Document containing changes/new requirements |
| Trigger entity | UI selection | Existing graph entity that has changed or will change |
| Assessment parameters | User / API caller | `{ depth, edgeTypes, scoreThreshold, scope }` |
| Knowledge graph | Graph Persistence Port | Current graph state for traversal |

---

## Outputs

| Output | Consumer | Format |
|--------|----------|--------|
| Impact report | UI (Impact Assessment wizard), export service | Structured `ImpactReport` (see Interfaces) |
| Affected subgraph | Knowledge Explorer (visualisation) | `Subgraph` with impact annotations |
| Impact events | Event log, notification system | Per-affected-entity impact event |

---

## Behaviour

### Assessment Flow

```
Trigger (Document or Entity)
    │
    ▼
┌────────────────────────┐
│ 1. Trigger Analysis    │  Extract obligations/directives from trigger document
│                        │  OR identify what changed on the trigger entity
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────┐
│ 2. Initial Matching    │  Map extracted obligations to existing graph entities
│                        │  (semantic matching + explicit relationship following)
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────┐
│ 3. Impact Traversal    │  From matched entities, traverse graph outward
│                        │  following impact-propagating relationships
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────┐
│ 4. Impact Scoring      │  Score each affected entity: severity, confidence,
│                        │  distance from trigger, relationship strength
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────┐
│ 5. Report Generation   │  Assemble structured report with provenance,
│                        │  grouping by layer/context/severity
└──────────────────────────┘
```

### Stage 1: Trigger Analysis

**Document trigger:**
- Extract obligations, directives, and changes from the document using the extraction pipeline (targeted prompts for change/impact language)
- Classify each extracted item: new requirement, modified requirement, removed requirement, deadline change

**Entity trigger:**
- Diff the entity's current state with its previous state (or hypothetical change)
- Identify which attributes changed and their semantic significance

### Stage 2: Initial Matching

- For each extracted obligation/change, find existing graph entities it relates to
- **Explicit matching**: Follow existing relationships (e.g., `obliges(Regulation → DomainConcept)`)
- **Semantic matching**: Use embedding similarity to find conceptually related entities when no explicit link exists
- **Type-guided matching**: An obligation about "payment limits" matches entities with relevant attributes/names

### Stage 3: Impact Traversal

From each initially matched entity, traverse outward along impact-propagating relationships:

**Impact propagation rules:**

| Starting Layer | Relationship | Propagates To | Direction |
|----------------|-------------|---------------|-----------|
| L1 (Domain) | `implements` | L3 Services | Downstream |
| L1 (Domain) | `fulfils` | L2 Vendor mappings | Downstream |
| L1 (Decision) | `realizedBy` | L3 Services | Downstream |
| L1 (Decision) | `evaluates` | L1 Rules | Lateral |
| L2 (Spec) | `specifies` | L1 Domain concepts | Upstream |
| L3 (Service) | `emits/consumes` | L3 Events/Services | Lateral |
| L3 (Service) | `belongsTo` | L1 Bounded Context | Upstream |
| L0 (Initiative) | `targets` | L0/L1 Value Streams | Downstream |
| L0 (Roadmap) | `dependsOn` | L0 Roadmap milestones | Lateral |

**Traversal constraints:**
- Maximum depth (configurable, default: 5 hops)
- Edge type filtering (only follow relevant relationship types)
- Score threshold pruning (stop traversing paths below minimum impact score)
- Cycle detection (don't revisit nodes)

### Stage 4: Impact Scoring

Each affected entity receives a composite impact score:

```
impactScore = baseSeverity × distanceDecay × relationshipStrength × confidence
```

- **baseSeverity**: How critical is this type of change? (0.0–1.0, configured per obligation type)
- **distanceDecay**: Score decreases with graph distance from trigger. `decay = 1 / (1 + distance × 0.3)`
- **relationshipStrength**: Strong relationships (implements, realizedBy) propagate more impact than weak ones (relatedTo)
- **confidence**: Confidence of the matching that connected this entity to the impact chain

### Stage 5: Report Generation

The report groups affected entities by:
- **Layer** (L0, L1, L2, L3)
- **Severity** (critical, high, medium, low)
- **Bounded context** (which teams/areas are affected)
- **Type** (what kinds of entities are affected)

Each affected entity in the report includes:
- The impact path (how the impact reaches this entity from the trigger)
- The impact score and its breakdown
- Recommended action category (review, update, test, no action needed)

---

## Interfaces & Contracts

### ImpactAssessmentAgent

```typescript
interface ImpactAssessmentAgent {
  // Assess impact from a document
  assessFromDocument(document: CanonicalDocument, params: AssessmentParams): Promise<ImpactReport>;
  
  // Assess impact from an entity change
  assessFromEntity(entityId: string, change: EntityChange, params: AssessmentParams): Promise<ImpactReport>;
  
  // Assess impact from a hypothetical change (what-if)
  assessHypothetical(hypothetical: HypotheticalChange, params: AssessmentParams): Promise<ImpactReport>;
}

interface AssessmentParams {
  maxDepth: number;                    // Maximum traversal hops (default: 5)
  edgeTypes?: string[];                // Which relationships to follow (default: all)
  minScore?: number;                   // Minimum impact score to include (default: 0.1)
  scope?: {
    layers?: string[];                 // Restrict to specific layers
    contexts?: string[];               // Restrict to specific bounded contexts
  };
}

interface ImpactReport {
  id: string;
  createdAt: string;
  trigger: {
    type: 'document' | 'entity' | 'hypothetical';
    description: string;
    extractedObligations: Obligation[];
  };
  summary: {
    totalAffected: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    layerBreakdown: Record<string, number>;
    contextBreakdown: Record<string, number>;
  };
  affectedEntities: AffectedEntity[];
  subgraph: {
    nodes: AnnotatedNode[];
    edges: AnnotatedEdge[];
  };
}

interface AffectedEntity {
  entity: InventoryEntry;
  impactScore: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  impactPath: string[];                // IDs from trigger to this entity
  pathDescription: string;             // Human-readable path explanation
  scoringBreakdown: {
    baseSeverity: number;
    distanceDecay: number;
    relationshipStrength: number;
    confidence: number;
  };
  recommendedAction: 'review' | 'update' | 'test' | 'monitor' | 'none';
}

interface Obligation {
  id: string;
  statement: string;
  type: 'new' | 'modified' | 'removed' | 'deadline';
  severity: number;
  matchedEntities: string[];           // IDs of graph entities this obligation maps to
  matchConfidence: number;
}
```

---

## Dependencies

| Depends on | Reason |
|------------|--------|
| Graph Persistence Port | Traversal and entity retrieval |
| Query Interface | Complex graph queries and path finding |
| Enrichment Pipeline (extraction) | Extract obligations from trigger documents |
| Schema Module | Understand entity types for scoring |

| Depended on by | Reason |
|----------------|--------|
| GraphQL API Layer | Serves impact reports via API |
| UI Impact Assessment wizard | Displays results |
| Export service | Generates impact report PDFs |
| Notification system | Alerts affected context owners |

---

## Key Decisions

### Decision 1: Impact Scoring Model

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Distance-decay model (as proposed)** | Intuitive; configurable; cheap to compute; explains itself well | May not capture all real-world impact patterns; linear/exponential decay may not match reality |
| **PageRank-style (node importance)** | Considers graph topology; important nodes get higher impact; sophisticated | Expensive; hard to explain; may over-weight highly-connected nodes regardless of actual impact |
| **LLM-assessed (ask the model per entity)** | Nuanced; considers context; handles edge cases | Extremely expensive; slow; non-deterministic; hard to explain scoring decisions |
| **Rule-based (explicit rules per relationship type)** | Predictable; fully transparent; no ML needed | Rigid; many rules needed; hard to maintain as graph grows; misses emergent patterns |

**Recommendation: Distance-decay model with configurable relationship weights**

*Rationale*: Impact assessment must be explainable — a compliance officer needs to understand why an entity scored 0.7 and another scored 0.3. The distance-decay model is transparent (every score has a traceable breakdown) and performant (pure graph computation, no LLM calls during scoring). Relationship weights can be tuned based on observed accuracy against real impact scenarios.

---

### Decision 2: Trigger Document Processing

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Reuse enrichment pipeline (same extraction, different prompts)** | No new extraction code; shared infrastructure; consistent extraction quality | Enrichment pipeline is optimised for entity extraction, not obligation/change extraction; may need significant prompt adaptation |
| **Dedicated impact extraction module** | Purpose-built prompts for obligation/change language; cleaner separation; optimised for impact use case | Additional module to maintain; potential duplication with enrichment pipeline |
| **Enrichment pipeline with impact extraction mode** | Shared infrastructure; mode flag selects prompt templates and output schemas; DRY | Modal code can become complex; testing surface area larger; must ensure modes don't interfere |

**Recommendation: Enrichment pipeline with impact extraction mode**

*Rationale*: The extraction infrastructure (chunking, LLM gateway, schema validation, JSONL output) is reusable. The only difference is the prompt templates (extract obligations and changes vs. extract entities and relationships) and the output schema (Obligation vs. InventoryEntry). A mode parameter selects the appropriate prompt templates while reusing everything else.

---

### Decision 3: What-If Analysis Support

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Not supported (only assess actual changes)** | Simpler; no hypothetical state management; clear semantics | Can't answer "what if we deprecate Service X?" without actually changing it; limits planning use case |
| **Clone-and-modify (create temp graph copy, apply hypothetical, assess)** | Clean semantics; full graph integrity for hypothetical state; accurate | Expensive (graph copy); slow; resource-intensive for large graphs |
| **Virtual overlay (apply hypothetical as overlay without cloning)** | Efficient; no copy needed; hypothetical is a diff applied at query time | Complex query logic; potential inconsistencies; overlay semantics may be confusing |
| **Entity-level diff (assess impact of attribute changes without modifying graph)** | Lightweight; fast; no state management | Limited to single-entity changes; can't model multi-entity hypotheticals |

**Recommendation: Entity-level diff (initially), evolve to virtual overlay (Phase 5+)**

*Rationale*: The most common what-if scenario is "what if this entity changes?" (e.g., "what if we deprecate this service?"). Entity-level diff handles this without any graph state management — we simply assess impact as if the entity had the proposed new state. For multi-entity hypotheticals (which are rarer and more complex), virtual overlay can be added later without changing the core impact traversal logic.

---

## Open Questions

1. **Impact report persistence**: Should completed impact reports be stored permanently (for audit trail and comparison)? If so, where?
2. **Incremental assessment**: If a regulation was previously assessed and 3 months later a new service is added, should the system proactively re-assess and notify?
3. **Human override**: Should users be able to manually adjust impact scores or add/remove entities from a report?
