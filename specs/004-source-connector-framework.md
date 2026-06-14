# 004 — Source Connector Framework

## Purpose & Scope

The Source Connector Framework provides a plugin-based architecture for ingesting documents from diverse source systems into the extraction pipeline. Each connector adapts a specific source type (filesystem, wiki, git repo, API) into a canonical internal representation that the enrichment pipeline can process uniformly.

**In scope:**
- Source connector port interface (abstract contract)
- Canonical document representation (what connectors output)
- Source registration and configuration
- Incremental ingestion (detect changes since last run)
- Source metadata and provenance tracking
- Plugin discovery and lifecycle management

> **Proposed (pending [ADR-0001](../docs/adr/0001-intermediate-jsonl-vs-okf-interchange.md)):** an **OKF connector** that ingests [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) Knowledge Bundles (Markdown + YAML frontmatter) as a source type. Bundles may be authored by humans or exported from existing catalogs (Dataplex, Unity Catalog, Collibra), then flow through normal extraction into typed JSONL. Implementation deferred to the proposed *spec 017 — OKF Import/Export Adapter*; this is the natural ingestion home for it.

**Out of scope:**
- Extraction/enrichment logic (what happens after ingestion) — see Enrichment Pipeline spec
- Document parsing (PDF→text, XML→structured) — separate parsing utilities consumed by connectors
- Source system authentication management — delegated to credential store
- Scheduling and triggering of ingestion runs — orchestration concern

---

## Inputs

| Input | Source | Format |
|-------|--------|--------|
| Source configuration | Admin console / config file | `{ type, connectionDetails, credentials, filters, schedule }` |
| Trigger signal | Scheduler, webhook, manual trigger | Event or API call |
| Previous ingestion state | Internal state store | Cursor/checkpoint for incremental ingestion |

---

## Outputs

| Output | Consumer | Format |
|--------|----------|--------|
| Canonical documents | Enrichment pipeline | `CanonicalDocument[]` (see Interfaces) |
| Ingestion manifest | Audit trail, admin console | `{ runId, source, documentsIngested, duration, errors }` |
| Source metadata update | Provenance tracking | Updated cursors, hashes, timestamps |

---

## Behaviour

### Connector Lifecycle

1. **Registration**: Connector plugin registered with framework (auto-discovered or explicit)
2. **Configuration**: Source instance configured with connection details and filters
3. **Health check**: Validate connectivity and access before ingestion
4. **Ingestion**: Fetch documents (full or incremental)
5. **Normalisation**: Transform source-native format into canonical document representation
6. **Checkpointing**: Record what was ingested for incremental next run

### Canonical Document Representation

Every connector produces documents in this format, regardless of source:

```typescript
interface CanonicalDocument {
  id: string;                          // Deterministic ID (source + path + version)
  sourceType: string;                  // Connector type that produced this
  sourcePath: string;                  // Path/URL within the source system
  sourceVersion: string;               // Version identifier (commit SHA, page version, timestamp)
  fetchedAt: string;                   // ISO 8601 when fetched
  sourceAuthority: SourceAuthority;    // regulatory | scheme | vendor | project | operational
  
  // Content
  content: string;                     // Extracted text content
  contentType: 'markdown' | 'plaintext' | 'structured';
  structuredContent?: object;          // For structured sources (JSON, CSV, XML → parsed)
  
  // Metadata
  title?: string;
  author?: string;
  lastModified?: string;
  tags?: string[];
  
  // Chunking hints (for large documents)
  sections?: DocumentSection[];        // Pre-identified logical sections
}

interface DocumentSection {
  id: string;
  title: string;
  content: string;
  startOffset: number;
  endOffset: number;
  level: number;                       // Heading level (1–6)
}

type SourceAuthority = 'regulatory' | 'scheme' | 'vendor' | 'project' | 'operational';
```

### Incremental Ingestion

Connectors support incremental fetching to avoid re-processing unchanged documents:

- **Filesystem**: File modification timestamp, content hash
- **Git**: Commit SHA (fetch files changed since last processed commit)
- **Wiki/Confluence**: Page version number, last-modified timestamp
- **API**: Cursor/pagination token, last-sync timestamp

The framework stores ingestion state per source instance:

```typescript
interface IngestionState {
  sourceId: string;
  lastRunId: string;
  lastRunAt: string;
  checkpoint: Record<string, unknown>;  // Connector-specific cursor
  documentsProcessed: number;
  lastDocumentId: string;
}
```

### Error Handling

- **Connection failure**: Retry with exponential backoff (configurable max retries)
- **Partial failure**: If 3/100 documents fail to fetch, report errors but continue with the 97 that succeeded
- **Format error**: If a document can't be parsed, skip it with an error record (don't block the run)
- **Timeout**: Per-document timeout; timed-out documents are skipped and reported

---

## Interfaces & Contracts

### SourceConnector Port

```typescript
interface SourceConnector {
  // Metadata
  readonly type: string;                         // e.g., "filesystem", "git", "confluence"
  readonly supportedFormats: string[];           // e.g., ["md", "pdf", "json", "csv"]
  
  // Lifecycle
  initialize(config: SourceConfig): Promise<void>;
  healthCheck(): Promise<HealthStatus>;
  
  // Ingestion
  ingest(state?: IngestionState): Promise<IngestionResult>;
  
  // Discovery (list available documents without fetching content)
  discover(filters?: DiscoveryFilter[]): Promise<DocumentReference[]>;
}

interface SourceConfig {
  id: string;                           // Unique source instance ID
  type: string;                         // Connector type
  connectionDetails: Record<string, unknown>;  // Type-specific config
  credentialRef?: string;               // Reference to credential store entry
  filters: SourceFilter[];              // Include/exclude patterns
  sourceAuthority: SourceAuthority;     // Authority level of this source
}

interface SourceFilter {
  type: 'include' | 'exclude';
  pattern: string;                      // Glob or regex
  field: 'path' | 'name' | 'extension' | 'tag';
}

interface IngestionResult {
  runId: string;
  documents: CanonicalDocument[];
  state: IngestionState;                // Updated checkpoint
  errors: IngestionError[];
  stats: {
    total: number;
    fetched: number;
    skipped: number;                    // Unchanged since last run
    failed: number;
    duration: number;
  };
}

interface IngestionError {
  documentPath: string;
  error: string;
  retriable: boolean;
}
```

### Connector Registry

```typescript
interface ConnectorRegistry {
  register(connector: SourceConnector): void;
  getConnector(type: string): SourceConnector;
  listConnectors(): ConnectorMetadata[];
  hasConnector(type: string): boolean;
}
```

### Planned Connector Implementations

| Connector | Source | Priority | Phase |
|-----------|--------|----------|-------|
| `filesystem` | Local/mounted file system | P0 | Phase 1 |
| `git` | Git repositories (clone + read) | P1 | Phase 1 |
| `confluence` | Atlassian Confluence wiki | P2 | Phase 3 |
| `jira` | Atlassian Jira (issues, ADRs) | P2 | Phase 3 |
| `api-json` | Generic JSON REST API | P2 | Phase 3 |
| `sharepoint` | SharePoint document libraries | P3 | Phase 4 |

---

## Dependencies

| Depends on | Reason |
|------------|--------|
| Credential store | Securely retrieve connection credentials |
| Document parsers | PDF→text, XML→structured, etc. |

| Depended on by | Reason |
|----------------|--------|
| Enrichment pipeline | Consumes canonical documents for extraction |
| Admin console | Manages source configuration; displays ingestion history |
| Ingestion orchestrator | Triggers and monitors connector runs |

---

## Key Decisions

### Decision 1: Document Parsing Responsibility

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Connector handles parsing** | Self-contained; each connector fully owns its source format; fewer moving parts | Parsing logic duplicated across connectors; PDF parsing is complex and shouldn't be reinvented per connector |
| **Separate parsing layer (shared utilities)** | Reusable parsers (PDF, XML, CSV); connectors focus on fetching; single place to improve parsing quality | Additional layer; connector→parser dependency; parsing library choices shared across connectors |
| **Parsing as a pipeline stage after connector** | Connector outputs raw bytes/files; separate parsing step normalises to text | Clean separation; parsers independently testable; connector is trivially simple | Two-step process; intermediate raw storage needed; more moving parts |

**Recommendation: Separate parsing layer (shared utilities)**

*Rationale*: PDF parsing, XML extraction, and CSV handling are complex, reusable concerns. A connector for Confluence and a connector for SharePoint both need to handle PDF attachments — duplicating that logic would be wasteful and error-prone. Shared parsing utilities keep connectors focused on fetch/auth/incremental logic. The parsing utilities are injected into connectors as dependencies.

---

### Decision 2: Canonical Document Content Format

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Always plaintext** | Simplest for downstream LLM processing; uniform interface | Loses structure (headings, tables, lists); harder for extraction pipeline to locate specific content |
| **Always markdown** | Preserves structure; LLMs handle markdown well; human-readable | Some sources don't map cleanly to markdown (CSV, XML); conversion can be lossy |
| **Typed content (plaintext OR markdown OR structured)** | Each source uses its natural representation; extraction pipeline handles all three | More complex downstream handling; extraction must support multiple formats |

**Recommendation: Typed content (with markdown as the preferred format)**

*Rationale*: Some sources are naturally structured (CSV → tabular data, JSON → object tree) and flattening to markdown loses information. The `contentType` field tells the extraction pipeline what it's dealing with. Markdown is the preferred/default for document sources; structured sources retain their structure in the `structuredContent` field. The extraction pipeline's prompt templates adapt based on content type.

---

### Decision 3: Incremental Ingestion Granularity

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Document-level (re-ingest entire changed document)** | Simple; no need to diff within documents; clear provenance | Large documents are fully re-processed even for small changes; more extraction cost |
| **Section-level (re-ingest only changed sections)** | Efficient for large documents; less extraction cost; finer provenance | Complex diff logic; section boundaries may change; harder to maintain context for extraction |
| **Source-level (re-ingest entire source if anything changed)** | Simplest; guaranteed consistency; no diff logic | Very wasteful for sources with many documents; slow for large wikis/repos |

**Recommendation: Document-level incremental ingestion**

*Rationale*: Document-level is the right granularity — it's simple enough to implement reliably, efficient enough for our scale (hundreds to low thousands of documents per source, not millions), and provides clear provenance (a document version maps to a set of extracted entries). Section-level optimisation can be added later if extraction costs become a concern, but the LLM extraction step is the real cost — and it benefits from full-document context regardless.

---

### Decision 4: Plugin Discovery Mechanism

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Explicit registration in code** | Type-safe; clear dependencies; no magic; easy to trace | Adding a connector requires code change in the registration module; technically violates OCP |
| **Convention-based auto-discovery (directory scan)** | True OCP; adding a connector = adding a file; no registration code to modify | Magic; harder to trace; potential for broken connectors to be discovered; needs naming convention |
| **Configuration-driven (list in config file)** | Explicit; no code change to add; deployable without rebuild | Config can drift from available code; runtime errors if configured connector doesn't exist |

**Recommendation: Explicit registration in code (with a plugin loader module)**

*Rationale*: At our scale (< 10 connectors for the foreseeable future), the overhead of explicit registration is minimal. It gives us type safety, clear dependency graphs, and no surprises. The registration point is a single `registerConnectors()` function that imports and registers all available connectors — adding one requires a one-line addition to this function. If the connector ecosystem grows significantly, we can introduce auto-discovery later.

---

## Open Questions

1. **Credential management**: Do we build a credential store, or integrate with an existing secrets manager (Vault, AWS Secrets Manager)?
2. **Rate limiting**: For API-based sources (Confluence, Jira), should rate limiting be a connector concern or a framework concern (middleware)?
3. **Large file handling**: For very large documents (100+ page PDFs), should the connector pre-chunk at fetch time, or pass the full document to the extraction pipeline which handles its own chunking?
