# Feature 01 — Filesystem / Markdown Source Connector

## 1. Feature

- **Name**: Filesystem / Markdown Source Connector
- **Plan step**: 1.1 — *Source connector: file/markdown ingestion adapter (plugin interface)*
- **Spec(s) expanded**: [specs/004-source-connector-framework.md](../../../specs/004-source-connector-framework.md)
  (the `filesystem` connector, the `SourceConnector` port, and the `CanonicalDocument` representation)

## 2. Summary & scope

Deliver the **first source connector** plus the **connector framework port** it implements. The
connector walks a configured filesystem root, reads Markdown/plaintext files matching its
include/exclude filters, and emits `CanonicalDocument[]` for the enrichment pipeline. It is the
front door of the Phase 1 vertical slice (source → JSONL → loader → graph → view).

**In scope**
- `SourceConnector` port interface (verbatim from spec 004).
- `ConnectorRegistry` with **explicit registration** (spec 004 Decision 4).
- `filesystem` connector: glob-based discovery, read, Markdown section parsing, provenance.
- `CanonicalDocument` + `DocumentSection` production, including `sourceAuthority` tagging.
- Document-level incremental ingestion via content hash + mtime (spec 004 Decision 3).
- `IngestionState` checkpointing and `IngestionResult` reporting.
- Skip-and-continue error handling for unreadable/unparseable files.

**Out of scope**
- LLM extraction / JSONL emission — Feature 02.
- The second (`json`) connector — Feature 06 (OCP validation).
- PDF/XML parsing utilities (Decision 1's shared parsing layer) — only Markdown/plaintext now.
- Credential store, scheduling, webhooks — orchestration concerns, not Phase 1.
- Confluence/Git/API connectors — Phase 3+ per the spec's connector table.

> Note: spec 004 lists `git` as P1/Phase 1. The locked Phase 1 scope ([decisions.md](../../phase-1/decisions.md))
> names only `filesystem` (1.1) and `json` (OCP). `git` is deferred to Phase 3 alongside the other
> remote connectors; see Open Questions.

## 3. Dependencies

- **Upstream specs**: 004 (this connector), and the `CanonicalDocument` contract consumed by spec 005.
- **Phase 0 deliverables relied on**: none hard — the connector emits `CanonicalDocument`, which is
  upstream of the schema/JSONL layer. (Schema Module from 0a is *not* required to ingest raw docs.)
- **Unblocks**: Feature 02 (extraction consumes `CanonicalDocument[]`), Feature 06 (second connector
  reuses this port unchanged to prove OCP).

## 4. Applied decisions

| decisions.md entry | How it constrains this feature |
|---|---|
| **D-P1.3 — language split** | This connector is **TypeScript** (connectors are TS). |
| **D-P1.4 — flesh out, don't build** | This document defines; no code is written this round. |
| **OCP target — second connector** | The port + registry designed here must allow Feature 06's `json` connector to be added **without modifying** this connector or the registry's existing code. |

Spec-level decisions applied: Decision 2 (typed content, Markdown preferred → `contentType` set
per file), Decision 3 (document-level incremental), Decision 4 (explicit registration).

## 5. User stories

- *As a knowledge engineer, I want to point the platform at a folder of Markdown specs, so that its
  contents enter the pipeline without manual copy-paste.*
- *As a platform developer, I want a uniform `CanonicalDocument` output regardless of source, so that
  the extraction pipeline never needs source-specific logic.*
- *As an operator, I want re-runs to skip unchanged files, so that re-ingestion is cheap and idempotent.*
- *As an auditor, I want every ingested document to carry provenance (path, version/hash, authority),
  so that every downstream fact is traceable to its source.*

## 6. Acceptance criteria (Given/When/Then)

1. **Discovery** — *Given* a root with 3 `.md` files and 1 `.txt` and an include filter `*.md`,
   *when* `discover()` runs, *then* exactly the 3 `.md` files are returned as `DocumentReference`s,
   no content fetched.
2. **Canonical output** — *Given* a Markdown file with `#`/`##` headings, *when* `ingest()` runs,
   *then* one `CanonicalDocument` is produced with `contentType: 'markdown'`, a deterministic `id`,
   `sections[]` reflecting the heading hierarchy with correct `level`/`startOffset`/`endOffset`.
3. **Provenance** — *Given* a configured `sourceAuthority: 'project'`, *when* a doc is ingested,
   *then* the `CanonicalDocument` carries that authority, the absolute `sourcePath`, a `sourceVersion`
   (content hash), and an ISO-8601 `fetchedAt`.
4. **Incremental skip** — *Given* a prior `IngestionState`, *when* `ingest(state)` re-runs and no file
   changed, *then* `stats.skipped == total` and `stats.fetched == 0`.
5. **Incremental change detection** — *Given* one file's content changed since last run, *when*
   `ingest(state)` runs, *then* only that file is re-emitted and the returned `state.checkpoint`
   advances for it.
6. **Partial failure** — *Given* one file is unreadable (permissions), *when* `ingest()` runs over 5
   files, *then* the other 4 succeed, the failure appears in `errors[]` with `retriable` set, and the
   run does not abort.
7. **Filter exclusion** — *Given* an exclude filter on path `**/drafts/**`, *when* ingest runs,
   *then* documents under `drafts/` are absent from the result.
8. **Registry** — *Given* the registry, *when* `getConnector('filesystem')` is called, *then* the
   connector instance is returned; `hasConnector('unknown') == false`.

## 7. Interface contracts

Reuse spec 004 verbatim. Key surfaces this feature realises:

```typescript
// Port (spec 004) — implemented by the filesystem connector
interface SourceConnector {
  readonly type: string;                 // "filesystem"
  readonly supportedFormats: string[];   // ["md", "markdown", "txt"]
  initialize(config: SourceConfig): Promise<void>;
  healthCheck(): Promise<HealthStatus>;
  ingest(state?: IngestionState): Promise<IngestionResult>;
  discover(filters?: DiscoveryFilter[]): Promise<DocumentReference[]>;
}

interface ConnectorRegistry {
  register(connector: SourceConnector): void;
  getConnector(type: string): SourceConnector;
  listConnectors(): ConnectorMetadata[];
  hasConnector(type: string): boolean;
}
```

Produces `CanonicalDocument` / `DocumentSection` / `IngestionState` / `IngestionResult` /
`IngestionError` exactly as defined in spec 004 §Interfaces. `id` is deterministic:
`hash(sourceType + sourcePath + sourceVersion)`.

## 8. TDD test plan (write these first)

- **Unit — `connector-registry.test.ts`**: register/get/has/list; duplicate registration error;
  unknown type throws. Asserts OCP: a stub second connector registers without touching existing tests.
- **Unit — `canonical-document.test.ts`**: deterministic id; `contentType` inference; ISO timestamps.
- **Unit — `markdown-section-parser.test.ts`**: heading hierarchy → `DocumentSection[]` with correct
  `level`, offsets, nested sections, and a no-heading fallback (single section).
- **Contract — `source-connector.contract.test.ts`**: a reusable suite every connector must pass
  (lifecycle order, `ingest` returns well-formed `IngestionResult`, errors are non-fatal). Feature 06
  reuses this same suite — that reuse *is* the OCP proof.
- **Integration — `filesystem-connector.int.test.ts`** against a fixture tree
  (`fixtures/payments-docs/`): full discover→ingest; incremental skip on re-run; change detection;
  exclude filter; unreadable-file partial failure.

## 9. Task breakdown

1. [ ] Define `SourceConnector`, `SourceConfig`, `SourceFilter`, `CanonicalDocument`,
   `DocumentSection`, `IngestionState`, `IngestionResult`, `IngestionError` types (from spec 004).
2. [ ] Write the connector contract test suite (failing).
3. [ ] Implement `ConnectorRegistry` (explicit registration) + tests.
4. [ ] Implement Markdown section parser + tests.
5. [ ] Implement `filesystem` connector: glob discovery, read, canonicalisation, provenance.
6. [ ] Implement incremental ingestion (hash + mtime checkpoint) + tests.
7. [ ] Implement skip-and-continue error handling + tests.
8. [ ] Wire `registerConnectors()` bootstrap registering `filesystem`.
9. [ ] Build the `fixtures/payments-docs/` golden tree for integration tests.

## 10. OCP extension points

- **Open**: new connector types via `registry.register()` and a one-line addition to
  `registerConnectors()` (spec 004 Decision 4). New `SourceFilter` field targets. New `contentType`
  values consumed downstream.
- **Closed**: the `SourceConnector` port signature, `CanonicalDocument` core fields, and the registry
  internals must not change to accommodate a new connector. Feature 06 must require **zero edits** here.

## 11. Open questions / risks

- Spec Open Q1 (credentials), Q2 (rate limiting) — not relevant to filesystem; defer.
- Spec Open Q3 (large-file pre-chunking) — Phase 1 passes whole documents; the extraction pipeline
  (Feature 02) owns chunking. Confirm no file-size cap is needed for the pilot corpus.
- `git` connector: spec marks it Phase 1 P1 but decisions.md scopes it out — **flagged** to the team;
  treat as Phase 3 unless re-prioritised.
- Decision 1 (shared parsing layer) is deferred — acceptable while only Markdown/plaintext are in scope.
