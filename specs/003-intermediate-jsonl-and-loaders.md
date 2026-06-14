# 003 — Intermediate JSONL & Loader Architecture

## Purpose & Scope

This component defines the canonical intermediate format (JSONL) that all extraction pipelines produce, and the pluggable loader architecture that consumes it to populate downstream storage systems. It is the critical integration boundary between extraction and persistence — the "extract once, load many" principle.

**In scope:**
- Intermediate JSONL schema (fixed core + extensible payload)
- JSONL file lifecycle (creation, immutability, archival)
- Loader port interface (abstract contract all loaders implement)
- Loader orchestration (running multiple loaders against the same JSONL)
- Idempotency and replay semantics
- Error handling and partial failure recovery

**Out of scope:**
- Extraction logic (how JSONL is produced) — see Enrichment Pipeline spec
- Storage-specific internals (how a loader maps to Neo4j/PostgreSQL/vector) — adapter concern
- JSONL file storage infrastructure (S3, local FS) — deployment concern

---

## Inputs

| Input | Source | Format |
|-------|--------|--------|
| JSONL file | Extraction/enrichment pipeline | Newline-delimited JSON, one entry per line |
| Loader configuration | Deployment config | Which loaders to run, their target store connection details |
| Replay request | Admin/operator | Re-run a loader against a previously produced JSONL file |

---

## Outputs

| Output | Consumer | Format |
|--------|----------|--------|
| Loaded entries in target store | Graph DB, vector store, PostgreSQL | Store-native format (adapter transforms) |
| Load report | Admin console, observability | `{ runId, file, loader, entriesProcessed, entriesSkipped, errors, duration }` |
| Load events | Event log | Per-entry load result (for audit and retry) |

---

## Behaviour

### JSONL File Format

Each line is a self-contained JSON object. The schema has a **fixed core** (required) and an **open extension** (additional fields permitted).

#### Fixed Core Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string (UUID v4) | Yes | Unique identifier for this extraction |
| `type` | string (InventoryType enum) | Yes | What kind of entry this is |
| `version` | string (semver) | Yes | Schema version this entry conforms to |
| `source` | SourceProvenance | Yes | Where this was extracted from |
| `confidence` | number (0.0–1.0) | Yes | Extraction confidence score |
| `extractedAt` | string (ISO 8601) | Yes | When extraction occurred |
| `data` | object | Yes | The typed payload (schema varies by `type`) |
| `metadata` | object | No | Pipeline-specific annotations |

#### SourceProvenance Object

```typescript
interface SourceProvenance {
  file: string;              // Source document path/identifier
  location: string;          // Location within document (page, section, row, line)
  fetchedAt: string;         // When source was retrieved
  sourceAuthority: 'regulatory' | 'scheme' | 'vendor' | 'project' | 'operational';
}
```

#### Relationship Entries

Relationships are also JSONL entries with `type: "Relationship"`:

```json
{
  "id": "rel-uuid",
  "type": "Relationship",
  "version": "1.0.0",
  "source": { ... },
  "confidence": 0.88,
  "extractedAt": "...",
  "data": {
    "relationshipType": "evaluates",
    "sourceEntityId": "decision-uuid",
    "targetEntityId": "rule-uuid",
    "metadata": {}
  }
}
```

### File Lifecycle

1. **Created**: Extraction pipeline completes a run → writes JSONL file to output directory
2. **Immutable**: Once written, the file is never modified. Re-extraction produces a new file.
3. **Consumed**: Loaders read the file and populate their stores
4. **Archived**: After successful consumption by all configured loaders, file is archived (not deleted)
5. **Replayable**: Any archived file can be re-fed to any loader for recovery or new store bootstrapping

### File Naming Convention

```
{runId}-{type}.jsonl
```

Examples:
- `run-001-extractions.jsonl` — inventory entries
- `run-001-relationships.jsonl` — relationship entries

### Loader Port Interface

```typescript
interface LoaderPort {
  // Metadata
  readonly name: string;                    // e.g., "graph-loader", "vector-loader"
  readonly targetStore: string;             // e.g., "neo4j", "pgvector", "postgresql"
  readonly requiredFields: string[];        // JSONL fields this loader needs beyond core

  // Lifecycle
  initialize(config: LoaderConfig): Promise<void>;
  healthCheck(): Promise<HealthStatus>;

  // Core operations
  load(entries: AsyncIterable<JsonlEntry>): Promise<LoadResult>;
  loadSingle(entry: JsonlEntry): Promise<EntryLoadResult>;

  // Idempotency
  hasProcessed(entryId: string, runId: string): Promise<boolean>;
  
  // Cleanup / rollback
  rollbackRun(runId: string): Promise<void>;
}

interface LoadResult {
  runId: string;
  totalEntries: number;
  loaded: number;
  skipped: number;           // Already processed (idempotency)
  failed: number;
  errors: LoadError[];
  duration: number;          // ms
}

interface LoadError {
  entryId: string;
  error: string;
  retriable: boolean;
}
```

### Loader Orchestration

The orchestrator coordinates running multiple loaders against the same JSONL:

1. **Parallel by default**: Independent loaders run concurrently against the same file
2. **Independent failure**: One loader failing does not block others
3. **Retry policy**: Failed entries can be retried (configurable per loader: immediate, exponential backoff, dead-letter)
4. **Completion tracking**: Each loader reports its completion status independently
5. **All-loaders-complete gate**: Archival only occurs when all configured loaders report success

```typescript
interface LoaderOrchestrator {
  registerLoader(loader: LoaderPort): void;
  
  // Run all registered loaders against a JSONL file
  executeRun(jsonlPath: string, runId: string): Promise<OrchestratorResult>;
  
  // Replay a specific loader against a previously processed file
  replayLoader(loaderName: string, jsonlPath: string, runId: string): Promise<LoadResult>;
  
  // Get status of a run
  getRunStatus(runId: string): Promise<RunStatus>;
}
```

### Idempotency

- Loaders track which entries they've processed (by `id` + `runId`)
- Re-running a loader against the same JSONL skips already-processed entries
- This enables safe retry and replay without duplication
- The idempotency record is stored by each loader in its own target store (implementation detail)

### Ordering

- Entries within a JSONL file are ordered by extraction sequence
- **Entity entries before relationship entries**: Loaders may process in order to ensure referenced entities exist before edges are created
- Loaders that don't care about ordering may process in any order (e.g., vector store)
- Loaders that need ordering declare `orderedProcessing: true` in their configuration

---

## Dependencies

| Depends on | Reason |
|------------|--------|
| Schema Module | Validates JSONL entries conform to their type schema |

| Depended on by | Reason |
|----------------|--------|
| Extraction Pipeline | Produces JSONL as its output |
| Graph Loader (adapter) | Consumes JSONL to populate graph store |
| Vector Loader (adapter) | Consumes JSONL to populate vector/RAG store |
| PostgreSQL Loader (adapter) | Consumes JSONL to populate relational store |
| Admin Console | Displays loader run status and history |

---

## Key Decisions

### Decision 1: JSONL vs Alternative Intermediate Formats

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **JSONL (newline-delimited JSON)** | Streamable; each line independently parseable; appendable; human-readable; widely supported; easy to debug | No schema enforcement in format itself; large files for big extractions; no compression built-in |
| **Parquet** | Columnar; compressed; schema-embedded; efficient for analytics | Not streamable line-by-line; binary (not human-readable); overkill for our use case; tooling heavier |
| **Protocol Buffers** | Compact; schema-enforced; fast serialisation | Binary; requires schema compilation step; not human-debuggable; overkill for document-scale data |
| **JSON array in a single file** | Simple; single parse | Not streamable; must load entire file into memory; can't append safely |

**Recommendation: JSONL**

*Rationale*: The extraction pipeline produces entries one at a time as it processes documents. JSONL allows streaming writes and reads — no need to buffer the entire result in memory. It's human-readable (critical for debugging LLM extraction), appendable, and can be processed with standard Unix tools. Schema validation happens at the consumer level using the Schema Module. For large files, gzip compression can be applied transparently.

---

### Decision 2: Relationship Entries — Inline or Separate File

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Separate files (entities and relationships)** | Clear separation; loaders can process entities first (ensuring references exist); relationships can be loaded in parallel once entities are settled | Two files per run; must coordinate processing order; more complex orchestration |
| **Single file (interleaved)** | Simpler file management; single stream to process; extraction pipeline doesn't need to buffer | Ordering matters (entity before its relationships); loaders need two-pass or buffering for referential integrity |
| **Single file with guaranteed entity-first ordering** | Best of both: single file + safe processing order | Extraction pipeline must buffer relationships until all entities are written; slightly constrains pipeline design |

**Recommendation: Separate files (entities and relationships)**

*Rationale*: The extraction pipeline naturally identifies entities and relationships at different stages (entities from individual document sections, relationships from cross-referencing). Separate files allow the graph loader to process entities first (creating nodes) then relationships (creating edges), without buffering or two-pass logic. Vector and PostgreSQL loaders typically only care about entities and can ignore the relationship file entirely.

---

### Decision 3: Loader Failure Strategy

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Fail-fast (abort on first error)** | Simple; no partial state; easy to reason about | A single bad entry blocks the entire load; wastes work already done; slow recovery |
| **Skip-and-continue (log errors, process remaining)** | Maximum throughput; one bad entry doesn't block others; error report at end | Partial state in store; must handle missing entries downstream; error accumulation |
| **Dead-letter queue (skip, log, retry later)** | Best of both: progress continues; failed entries get another chance; auditable | More complex; needs DLQ infrastructure; retry logic adds complexity |

**Recommendation: Skip-and-continue with dead-letter queue for retriable errors**

*Rationale*: In a knowledge extraction pipeline, some entries will have validation issues (confidence too low, malformed references). These shouldn't block the 99% that are valid. Non-retriable errors (schema violation) are logged and reported. Retriable errors (transient store connection failure) go to a DLQ for automatic retry. The load report clearly shows what succeeded, what was skipped, and what needs attention.

---

### Decision 4: JSONL File Size Management

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Unbounded (one file per run, any size)** | Simplest; one file = one run; clear lifecycle | Very large extractions produce huge files; memory pressure on loaders; harder to parallelise |
| **Chunked (split at N entries or M bytes)** | Parallelisable; bounded memory; can process chunks concurrently | More files to manage; ordering across chunks more complex; chunk boundary handling |
| **Unbounded with streaming** | Single file but processed as a stream (line by line); never fully in memory | Requires streaming support in all loaders; can't easily random-access or parallelise within a file |

**Recommendation: Unbounded with streaming (mandatory streaming interface)**

*Rationale*: The `AsyncIterable<JsonlEntry>` interface in the loader port enforces streaming consumption. Loaders never load the full file into memory. This gives us the simplicity of one-file-per-run with the memory safety of streaming. If files genuinely become too large (millions of entries), chunking can be introduced as an orchestrator concern without changing the loader interface.

---

## Open Questions

1. **Compression**: Should JSONL files be gzip-compressed by default, or only for archival? Streaming gzip is possible but adds complexity.
2. **Schema version in filename**: Should the JSONL filename include the schema version, to make it clear which schema version the entries conform to?
3. **Cross-run deduplication**: If the same entity is extracted in multiple runs (from updated sources), who is responsible for deduplication — the loader or a separate reconciliation step?
