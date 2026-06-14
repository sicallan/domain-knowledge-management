# Phase 0 — Foundation

This is the engineering foundation the seven Phase 1 features build on. It delivers
**only** the Phase 0a/0b scaffold and ports — no Phase 1 features (no source
connectors, extraction pipeline, concrete loaders, query service, or views).

## What was built

| Area | Package | Spec | Notes |
|---|---|---|---|
| Monorepo scaffold | (root) | — | pnpm workspaces, TypeScript, Vitest, ESLint, GitHub Actions CI |
| Schema Module | `@dkm/schema` (`modules/schema`) | [001](../../specs/001-schema-module.md) | JSON Schema (Draft 2020-12) for the six core L1 types + Relationship; auto-discovery registry; Ajv validator; lifecycle FSM; relationship cardinality registry |
| Graph Persistence Port | `@dkm/knowledge-graph` (`modules/knowledge-graph`) | [002](../../specs/002-graph-persistence-port.md) | Abstract `GraphPort`, adapter-agnostic contract suite, in-memory adapter with event log |
| Loader Port | `@dkm/loaders` (`modules/loaders`) | [003 §Loader Port Interface](../../specs/003-intermediate-jsonl-and-loaders.md) | Abstract `LoaderPort`, contract suite, in-memory stub |
| Quality Scoring | `@dkm/quality` (`modules/quality-verification`) | [008](../../specs/008-quality-scoring-framework.md) | Six-dimension composite scoring, configurable weights/thresholds/decay |

JSON Schemas live in top-level `/schemas` (per spec 001); the validation/registry
**code** lives in `modules/schema`.

## Engineering principles honoured

- **TDD** — every module is covered by tests that pin its behavioural contract.
  Schema validation (valid pass / invalid reject), graph-port contract tests, loader
  contract tests, and quality-scoring dimension tests all run green in CI.
- **OCP** — proven, not asserted:
  - A new inventory type (`Widget`) is added in `ocp-extension.test.ts` by dropping a
    schema file into an extra directory — no registry/validator/existing-schema edits.
  - The base entry schema is an **open** schema: unknown additive fields are accepted.
  - New relationship types register via `RelationshipTypeRegistry.register()`.
  - New graph adapters slot in behind `GraphPort` and reuse the same contract suite.
  - Per-type quality weights/thresholds/decay are configured, not coded.
- **Schemas evolve additively** — semver `version` on every entry; bi-temporal
  `validFrom`/`validTo`; required `evidencedBy` provenance; `lifecycle_status`.

## Decisions made

- **Package manager**: pnpm (via Corepack) with workspaces.
- **Test runner**: Vitest. **Validator**: Ajv 2020 + ajv-formats (spec 001 Decision 3).
- **Schema language**: JSON Schema Draft 2020-12, schema-first (spec 001 Decisions 1–2).
- **Cross-module types** live in `@dkm/schema` (the foundational, dependency-free module).
- **Event log**: the in-memory adapter records mutation events inline. Spec 002
  Decision 2 favours a separate append-only store (PostgreSQL) for production; that is
  a Phase 3 concern and is not contradicted — the port surfaces events via `getEvents`.

## Decisions deferred (Last Responsible Moment)

- **Graph database choice** (Neo4j vs Neptune vs …) — due end of Phase 0, to be captured
  as an ADR. The `GraphPort` abstraction and contract suite exist so the choice changes
  no calling code.
- **Neo4j adapter** — **not built this run** (would require a live service). The clear
  extension point: implement `GraphPort` and call
  `runGraphPortContractTests("Neo4j", () => new Neo4jAdapter(...))` — the identical
  suite the in-memory adapter passes (D-P1.2).
- **Vector DB / PostgreSQL / workflow engine / LLM provider / deployment** — per
  `CLAUDE.md` and `plan.md`, deferred to their phases.

## Spec deviations

- **`GraphPort.patternMatch`** (spec 002) is deferred to Phase 1, when concrete query
  patterns exist; `traverse` / `findByType` / `findPath` cover the foundation's needs.
- **`LoaderPort.load`/`loadSingle`** take an explicit `runId` argument (the orchestrator
  owns run identifiers; idempotency and rollback are keyed by `(entryId, runId)`).
- **`LoaderOrchestrator`** (spec 003) is not implemented this run — only the `LoaderPort`
  contract + in-memory stub are in scope for the foundation (plan step 0b.4).

## Running it

```bash
corepack enable          # provides pnpm
pnpm install
pnpm run validate        # typecheck + lint + tests (mirrors CI)
```
