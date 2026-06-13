# 005 — Enrichment & Extraction Pipeline

## Purpose & Scope

The Enrichment & Extraction Pipeline transforms canonical documents into structured, typed inventory entries and relationships. It uses LLM-based extraction to identify domain concepts, decisions, rules, behaviours, and their interconnections — producing intermediate JSONL as output.

**In scope:**
- Pipeline orchestration (document → extraction stages → JSONL output)
- LLM prompt engineering and extraction strategy
- Entity extraction (inventory entries from text)
- Relationship extraction (edges between entities)
- Confidence scoring for extracted facts
- Entity resolution (deduplication across documents)
- Golden dataset evaluation framework
- Multi-pass extraction (structural → behavioural → cross-reference)

**Out of scope:**
- Source document fetching (Source Connector's job)
- JSONL consumption/loading (Loader's job)
- LLM provider infrastructure (abstracted behind gateway)
- Training/fine-tuning models (use pre-trained via prompting)

---

## Inputs

| Input | Source | Format |
|-------|--------|--------|
| Canonical documents | Source Connector Framework | `CanonicalDocument[]` |
| Extraction configuration | Config / admin | Target types to extract, confidence thresholds, model selection |
| Schema definitions | Schema Module | JSON Schema for target inventory types |
| Existing graph state | Graph Persistence Port (optional) | For entity resolution — known entities to match against |

---

## Outputs

| Output | Consumer | Format |
|--------|----------|--------|
| Extraction JSONL (entities) | Loader orchestrator | `{runId}-extractions.jsonl` |
| Extraction JSONL (relationships) | Loader orchestrator | `{runId}-relationships.jsonl` |
| Extraction report | Admin console, quality monitoring | `{ runId, stats, qualityMetrics }` |
| Evaluation metrics | Quality framework | Precision, recall, F1 against golden dataset |

---

## Behaviour

### Pipeline Stages

```
CanonicalDocument
    │
    ▼
┌─────────────────────┐
│ 1. Pre-processing   │  Chunk large documents; identify sections; classify document type
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 2. Entity Extraction│  LLM extracts typed inventory entries from each chunk
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 3. Relationship     │  LLM identifies relationships between extracted entities
│    Extraction       │  (and links to previously known entities)
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 4. Entity Resolution│  Deduplicate: match extracted entities to existing ones
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 5. Confidence       │  Score each extraction; flag low-confidence for review
│    Scoring          │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 6. Schema Validation│  Validate all entries against their type schemas
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 7. JSONL Emission   │  Write validated entries to intermediate JSONL files
└─────────────────────┘
```

### Stage 1: Pre-processing

- **Document classification**: Determine document type (rulebook, technical design, decision log, API spec, etc.) to select appropriate extraction prompts
- **Chunking**: Split large documents into processable chunks (respecting section boundaries)
- **Section identification**: Parse headings/structure to provide location provenance
- **Chunk size**: Target 2000–4000 tokens per chunk (model-dependent); overlap of 200 tokens between chunks to preserve context at boundaries

### Stage 2: Entity Extraction

- **Prompt template per document type**: Tailored prompts that instruct the LLM what to look for based on document classification
- **Structured output**: LLM returns JSON conforming to the inventory type schema (using function calling / structured output mode)
- **Multi-type extraction**: A single chunk may yield multiple entity types (e.g., a decision log entry yields a Decision + related Rules + ReferenceData references)
- **Provenance attachment**: Every extracted entity records its source chunk location

### Stage 3: Relationship Extraction

- **Within-document**: Relationships between entities extracted from the same document
- **Cross-document**: Relationships between newly extracted entities and previously known entities (requires graph state access)
- **Implicit relationships**: Some relationships are inferred from co-occurrence or structural context (e.g., entities in the same section of a technical design are likely related)

### Stage 4: Entity Resolution

- **Matching criteria**: Name similarity, type match, context overlap, attribute similarity
- **Conservative approach**: Only merge when confidence > configurable threshold (default: 0.85)
- **Actions**: Merge (same entity, combine provenance), Link (related but distinct), Create (genuinely new)
- **Human escalation**: Below-threshold matches are flagged for manual review

### Stage 5: Confidence Scoring

Each extracted entry receives a confidence score based on:
- **Extraction clarity**: How unambiguous was the source text?
- **Schema completeness**: What proportion of expected fields were populated?
- **Source authority**: Higher authority sources yield higher confidence
- **Corroboration**: Entity mentioned in multiple sources gets boosted confidence
- **Model self-assessment**: LLM's own confidence indication (calibrated against golden dataset)

### Stage 6: Schema Validation

- Every entry validated against its type schema using the Schema Module
- Invalid entries are logged and excluded from JSONL output
- Validation errors feed back into prompt refinement

### Stage 7: JSONL Emission

- Write entries to `{runId}-extractions.jsonl`
- Write relationships to `{runId}-relationships.jsonl`
- Files are written streamingly (one entry at a time as it passes validation)
- Run metadata (model, config, stats) written to `{runId}-metadata.json`

---

## Interfaces & Contracts

### ExtractionPipeline

```typescript
interface ExtractionPipeline {
  // Execute a full extraction run
  run(documents: CanonicalDocument[], config: ExtractionConfig): Promise<ExtractionRunResult>;
  
  // Execute extraction on a single document (for testing/debugging)
  extractSingle(document: CanonicalDocument, config: ExtractionConfig): Promise<ExtractionResult>;
  
  // Evaluate pipeline against golden dataset
  evaluate(goldenDataset: GoldenDataset): Promise<EvaluationMetrics>;
}

interface ExtractionConfig {
  targetTypes: InventoryType[];        // Which types to extract
  confidenceThreshold: number;         // Minimum confidence to include (default: 0.5)
  entityResolution: boolean;           // Whether to match against existing graph
  model: string;                       // LLM model identifier
  maxConcurrency: number;              // Parallel chunk processing limit
}

interface ExtractionRunResult {
  runId: string;
  outputFiles: {
    extractions: string;               // Path to extractions JSONL
    relationships: string;             // Path to relationships JSONL
    metadata: string;                  // Path to run metadata
  };
  stats: {
    documentsProcessed: number;
    chunksProcessed: number;
    entitiesExtracted: number;
    relationshipsExtracted: number;
    entitiesResolved: number;          // Merged with existing
    validationFailures: number;
    averageConfidence: number;
    duration: number;
  };
}
```

### LLM Gateway Interface

```typescript
interface LLMGateway {
  // Structured extraction (returns typed JSON)
  extractStructured<T>(prompt: string, schema: JsonSchema, options?: LLMOptions): Promise<LLMResponse<T>>;
  
  // Embedding generation (for entity resolution similarity)
  embed(text: string): Promise<number[]>;
}

interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  retryPolicy?: RetryPolicy;
}

interface LLMResponse<T> {
  result: T;
  usage: { inputTokens: number; outputTokens: number; };
  latency: number;
  modelUsed: string;
}
```

### Golden Dataset Format

```typescript
interface GoldenDataset {
  id: string;
  name: string;
  documents: CanonicalDocument[];
  expectedEntities: ExpectedEntity[];
  expectedRelationships: ExpectedRelationship[];
}

interface EvaluationMetrics {
  precision: number;        // Correct extractions / total extractions
  recall: number;           // Correct extractions / expected extractions
  f1: number;              // Harmonic mean
  perType: Record<InventoryType, { precision: number; recall: number; f1: number }>;
  confidenceCalibration: number;  // How well confidence predicts correctness
}
```

---

## Dependencies

| Depends on | Reason |
|------------|--------|
| Source Connector Framework | Provides canonical documents as input |
| Schema Module | Validates extracted entries; provides schema for structured output |
| Graph Persistence Port | Entity resolution requires querying existing graph (optional) |
| LLM Gateway | LLM inference for extraction |

| Depended on by | Reason |
|----------------|--------|
| Loader Orchestrator | Consumes the JSONL output |
| Quality Framework | Receives evaluation metrics |
| Admin Console | Displays extraction run status and history |

---

## Key Decisions

### Decision 1: Extraction Approach

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Prompt-based (zero/few-shot with structured output)** | No training data needed; works immediately; adaptable to new types by changing prompts; transparent logic | Lower precision than fine-tuned; prompt engineering effort; token cost per extraction; model-dependent behaviour |
| **Fine-tuned model** | Higher precision for specific domain; lower inference cost once trained; consistent behaviour | Requires labelled training data (expensive to create); retraining needed for new types; less transparent |
| **Hybrid (prompt-based + classifier)** | Prompt for extraction; lightweight classifier for type classification; best of both | More components; classifier needs training data; integration complexity |
| **Rule-based (regex/NLP patterns)** | Deterministic; fast; no LLM cost; predictable | Brittle; doesn't generalise; massive effort for complex documents; can't handle ambiguity |

**Recommendation: Prompt-based with structured output (zero/few-shot)**

*Rationale*: We don't have labelled training data at project start. Prompt engineering against golden datasets gives us rapid iteration. The structured output mode (function calling) ensures type-safe responses. As golden datasets grow through Phase 1–2, we can evaluate fine-tuning if prompt-based precision plateaus. The LLM Gateway abstraction means switching to a fine-tuned model later requires no pipeline changes.

---

### Decision 2: Entity Resolution Strategy

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Embedding similarity (vector matching)** | Handles synonyms and paraphrasing; language-agnostic; scalable | May produce false positives for similar-but-distinct concepts; threshold tuning needed |
| **Name + type matching (deterministic)** | Simple; fast; predictable; no ML needed | Misses paraphrases and synonyms; brittle to naming variations |
| **LLM-based resolution (ask the model)** | Understands context and nuance; handles complex cases | Expensive (LLM call per candidate pair); slow; non-deterministic |
| **Hybrid (name match → embedding → LLM for ambiguous)** | Cascade: cheap methods first, expensive only when needed; best precision | Most complex; multiple systems; harder to debug resolution decisions |

**Recommendation: Hybrid cascade (name+type → embedding similarity → LLM for ambiguous cases)**

*Rationale*: Most entity resolution is straightforward (same name, same type = same entity). Embedding similarity catches paraphrases efficiently. LLM resolution is reserved for genuinely ambiguous cases where the cost is justified. The cascade naturally reduces cost while maintaining precision. Conservative thresholds at each stage prevent false merges.

---

### Decision 3: Chunking Strategy

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Fixed token count** | Simple; predictable; works for any document | Splits mid-sentence/mid-section; loses context; may split an entity description across chunks |
| **Section-based (heading boundaries)** | Respects document structure; keeps related content together; better extraction context | Sections may be too large or too small; unstructured documents have no sections |
| **Semantic (topic-based splitting)** | Optimal context per chunk; groups related information | Requires embedding + clustering; adds complexity and latency; non-deterministic boundaries |
| **Section-based with size limits (split large sections)** | Respects structure where possible; handles edge cases; predictable | Slightly more complex than pure section-based; still breaks some context |

**Recommendation: Section-based with size limits**

*Rationale*: Documents in our domain (technical specs, rulebooks, design docs) are typically well-structured with headings. Section-based chunking keeps related content together, which improves extraction quality. For oversized sections, we split at paragraph boundaries within the section. For unstructured documents, we fall back to paragraph-based splitting. The pre-processing stage's section identification feeds directly into chunk boundaries.

---

### Decision 4: LLM Model Selection Strategy

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Single model for all extraction** | Simple; consistent behaviour; one set of prompts to maintain | Expensive if using top-tier model; overkill for simple extractions; single point of failure |
| **Tiered models by complexity** | Cost-efficient (small model for simple tasks, large for complex); better resource utilisation | More prompts to maintain; routing logic needed; quality differences between tiers |
| **Model per extraction type** | Each type gets optimal model; independent iteration | Operational complexity; many models to manage; harder to reason about overall quality |

**Recommendation: Tiered models (two tiers initially)**

*Rationale*: Entity extraction from well-structured documents (CSV, JSON, tables) can be handled by a smaller/faster/cheaper model. Complex extraction (nuanced decisions from prose, implicit relationships, cross-reference resolution) benefits from the most capable model. Two tiers keep operational complexity manageable. The LLM Gateway abstracts model routing — the pipeline specifies "extraction complexity" and the gateway routes to the appropriate tier.

---

## Open Questions

1. **Prompt versioning**: How do we version and test prompts? Should prompts be stored as files alongside code, with golden dataset regression tests per prompt version?
2. **Incremental extraction**: When a document is re-ingested with minor changes, should we re-extract everything or attempt to diff and extract only new/changed entities?
3. **Context window management**: For entity resolution against a large existing graph, how do we efficiently surface relevant existing entities without exceeding context limits?
4. **Cost tracking**: Should the pipeline track LLM cost per extraction run, and should there be budget controls (abort if cost exceeds threshold)?
