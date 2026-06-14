# Phase 1 — Feature Definitions

**Goal**: one complete vertical slice — *source document → intermediate JSONL → loader → graph →
queryable Domain Map view* — plus OCP validation (a second connector and a second loader).

Source of truth: [plan.md §Phase 1](../../../plan.md), the Phase 1 specs in [specs/](../../../specs/),
and the locked [Phase 1 decisions](../../phase-1/decisions.md). These docs **expand** those specs into
buildable feature definitions; they do not restate or contradict them.

## Feature index

| # | Feature | Plan step | Spec(s) | Lang | One-line summary |
|---|---------|-----------|---------|------|------------------|
| [01](01-filesystem-markdown-connector.md) | Filesystem / Markdown connector | 1.1 | [004](../../../specs/004-source-connector-framework.md) | TS | First source connector + connector port/registry; emits `CanonicalDocument`. |
| [02](02-llm-extraction-pipeline.md) | LLM extraction pipeline → JSONL | 1.2 | [005](../../../specs/005-enrichment-extraction-pipeline.md), [003](../../../specs/003-intermediate-jsonl-and-loaders.md) | Py | Documents → typed intermediate JSONL via Claude behind a thin gateway; golden-dataset evals. |
| [03](03-graph-loader.md) | Graph loader (JSONL → graph) | 1.3 | [003](../../../specs/003-intermediate-jsonl-and-loaders.md), [002](../../../specs/002-graph-persistence-port.md) | TS | First `LoaderPort`; populates graph via in-memory + Neo4j adapters; idempotent. |
| [04](04-query-interface.md) | Query interface | 1.4 | [006](../../../specs/006-query-interface.md) | TS | Typed lookup + relationship traversal over the graph port; cursor pagination. |
| [05](05-domain-map-view.md) | Domain Map view projection | 1.5 | [007](../../../specs/007-view-projection-engine.md) | TS | View engine + first projector; renders the Domain Map — the visible end of the slice. |
| [06](06-json-connector-ocp.md) | JSON connector (OCP) | OCP | [004](../../../specs/004-source-connector-framework.md) | TS | **OCP gate**: second connector added with zero core edits. |
| [07](07-vector-loader-stub-ocp.md) | Vector-loader stub (OCP) | OCP | [003](../../../specs/003-intermediate-jsonl-and-loaders.md) | TS | **OCP gate**: second loader ("load many") added with zero core edits. |

## Slice flow

```
[01 fs/md connector] ─┐
[06 json connector]  ─┴─► CanonicalDocument[] ─► [02 extraction] ─► intermediate JSONL ─┬─► [03 graph loader] ─► graph ─► [04 query] ─► [05 Domain Map]
                                                                                         └─► [07 vector stub]  ─► index   (OCP "load many")
```

## Locked decisions applied across all features

See [docs/phase-1/decisions.md](../../phase-1/decisions.md):

- **D-P1.1** — LLM access is **Claude behind a thin gateway** (default `claude-sonnet-4-6`, escalate
  low-confidence re-runs to `claude-opus-4-8`). Applies to Features 02, 07.
- **D-P1.2** — Graph store gets **two adapters**: in-memory + Neo4j, both behind the 0b port. Applies
  to Features 03, 04, 05.
- **D-P1.3** — **TypeScript** slice; **Python** extraction; integrated only across the JSONL/file
  boundary. Applies to all.
- **D-P1.4** — This round is **flesh-out only**: feature docs + issues, no code.
- **OCP targets** — second connector (Feature 06) and second loader (Feature 07).

## Cross-cutting open questions for the team

- **Phase 1 extraction precision/recall target** is unset — must be agreed before Feature 02's eval
  tests are meaningful (top project risk).
- **Vector DB ADR** (due Phase 1): kept open; Feature 07 captures the requirements it places on the
  loader port without committing to a product.
- **Production graph DB choice** stays an ADR; Neo4j is only the Phase 1 integration target above a
  clean port.
- **`git` connector**: spec 004 marks it Phase 1; decisions.md scopes it out — treated as Phase 3.
