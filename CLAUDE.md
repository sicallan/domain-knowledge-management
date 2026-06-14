# CLAUDE.md

Guidance for Claude Code (and Archon agents) working in this repository.

## What this is

**Domain Knowledge Management** — a domain-agnostic enterprise platform that ingests
source material (docs + operational telemetry), continuously structures it into a living
**knowledge graph** of typed inventory entries, and exposes it for semantic search,
ontology-driven navigation, multi-layer views, and agentic analysis/correction. Initial
focus domain: **Payments**.

The repo is currently **plan + specs only** — no application code yet. The job is to build
it out, spec by spec, phase by phase.

Authoritative docs (read before implementing anything):
- [README.md](README.md) — vision, architecture (C4), ontology, tech-stack candidates
- [plan.md](plan.md) — the implementation plan: domain model, inventories, relationships, **phases 0a→6**
- [ui-backend-plan.md](ui-backend-plan.md) — UI & backend application workstream (starts Phase 3)
- [specs/](specs/) — 16 per-component technical specs ([specs/README.md](specs/README.md) is the index)

## Core mental model

> The system is **not a document store**. Every ingested artifact must contribute to
> populating, updating, or evidencing one or more **typed inventory entries** with explicit
> relationships. The document is the evidence; the inventory entry is the assertion; the
> graph connects assertions; views interpret the graph; agents reason over the graph.

**Decisions are the highest-value nodes** — where regulation bites and business logic
concentrates. The platform exists primarily to make decisions visible, traceable, and assessable.

### Four-layer domain model
- **L0 Strategic Alignment** — initiatives, value streams, stakeholder/value-impact maps, roadmaps (the "why")
- **L1 Pure Domain** — DDD canonical truth: domains, bounded contexts, aggregates, events, policies, invariants, **decisions** (vendor/tech agnostic; everything maps *to* this)
- **L2 Functional Realisation** — vendor products & project specs claiming to fulfil L1
- **L3 Technical Realisation** — systems, services, runtime behaviour, operational evidence

## Engineering principles — these are rules, not suggestions

1. **TDD — always.** Nothing gets built without a failing test first. Schema-validation
   tests before schemas; contract tests before APIs; golden-dataset tests before agents;
   integration tests before production wiring.
2. **Open-Closed (OCP).** Modules are open for extension (new inventory types, relations,
   agents, views, connectors, loaders) but closed for modification. Use plugin/adapter
   architecture and typed extension points; evolve schemas additively only. Each phase has
   an explicit OCP validation step — honour it.
3. **Product-management discipline.** Thin vertical slices that deliver a usable, deployable,
   demonstrable increment each phase. Build the minimum viable inventory first, then extend.

## Architecture commitments (made now)

- **TypeScript** for schemas, core modules, API/UI. **Python** for ML/NLP/agent workloads.
- **JSON Schema** as the schema language (testable, widely supported).
- **Git-based schema versioning** — schemas live in the repo, additive-only evolution (`major.minor.patch`).
- **GitHub Actions CI** from day one — every PR must pass schema validation + unit + contract tests.
- **Port/adapter everywhere** — graph persistence, loaders, connectors, LLM gateway are all abstract interfaces.
- **Extract once, load many** — extraction emits canonical **intermediate JSONL** (typed,
  schema-validated); pluggable loaders fan it out to graph / vector / relational stores. Never
  couple extraction to a store.
- **OKF at the edges, not the core** — [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
  (Markdown + YAML frontmatter) is adopted as an ingestion *source* and a publication/interchange
  *output*; the internal intermediate format stays typed JSONL. Don't propose OKF as a JSONL
  replacement — see [ADR-0001](docs/adr/0001-intermediate-jsonl-vs-okf-interchange.md).

### Deferred decisions (Last Responsible Moment — capture as ADRs in `docs/adr/`)
Graph DB (end of Phase 0) · Vector DB (Phase 1) · PostgreSQL (Phase 3) · Workflow engine
(Phase 2) · LLM provider/model (Phase 1, behind a gateway) · Deployment platform (Phase 1,
containerised from start). Do **not** hard-code a choice before its phase without an ADR.

## Phases (see plan.md for step-level detail)

| Phase | Theme | Weeks |
|---|---|---|
| 0a | Scaffold + core L1 schemas | 1–2 |
| 0b | Relationships, extension (OCP), graph & loader ports, quality scoring | 3–4 |
| 1 | First vertical slice: source → JSONL → loader → graph → view | 4–7 |
| 2 | Behaviour inventories + Decision as first-class | 8–11 |
| 3 | L2 vendor/project mapping **+ UI/backend workstream begins** | 12–14 |
| 4 | Impact assessment agent | 15–18 |
| 5 | Quality + scale: contradiction/correction agents, auto-merge, evals | 19–22 |
| 6 | Strategic alignment & coordination overlay | 23–26 |

## Planned repo layout (monorepo)

See README.md §4 for the full tree. Top level: `apps/` (api-gateway, knowledge-studio),
`modules/` (source-connectors, normalization, enrichment, ontology, entity-resolution,
knowledge-graph, indexing-retrieval, reasoning-agents, quality-verification, spec-generation),
`platform/`, `schemas/`, `prompts/`, `evals/`, `docs/`. Build these as they're needed per phase —
don't scaffold empty modules ahead of their phase.

## Working on a spec

1. Open the spec in [specs/](specs/) — note its **Phase** and **Layer**.
2. Confirm the spec's **Key Decisions** are resolved (raise an ADR if not).
3. Write failing tests against the spec's Inputs/Outputs/Contracts **first**.
4. Implement the minimum to pass; honour the OCP extension points.
5. If implementation forces a deviation, update the spec with rationale.

## Conventions

- **British spelling** in domain language, identifiers, and user-facing text (Authorisation,
  Realisation, Behaviour, prioritise) — match the existing specs.
- Canonical data formats: **Markdown** for narrative, **JSON/JSONL** for structured records.
- Every asserted fact must be **evidenced** (linked to source provenance) and **versioned**
  (lifecycle_status + bi-temporal validFrom/validTo).
- Capture architectural decisions as **ADRs** in `docs/adr/`.

## Building with Archon

This project uses **Archon** to run AI workflows in isolated git worktrees for parallel,
spec-driven development. Repo config lives in [.archon/](.archon/) (see [.archon/README.md](.archon/README.md)).
- Base branch for worktrees: `main`.
- Reusable command templates: `.archon/commands/`. Workflow definitions: `.archon/workflows/`.
- `.archon/state/` and `.archon/.env` are gitignored — never commit them.
- Existing reusable workflow: `flesh-out-phase` — expands a phase's `specs/` into
  `docs/features/phase-<N>/*.md` + GitHub issues (no code). Run it as `… "<phase id>"`.

### Operational gotchas (learned the hard way — read before running Archon)

1. **Always run workflows in the background** (`run_in_background: true`) and tail the output
   file the CLI prints — runs are long (~5–10 min) and block their shell.
2. **Suppress the nested-Claude warning.** Running inside Claude Code sets `CLAUDECODE=1`;
   prefix Archon commands with `ARCHON_SUPPRESS_NESTED_CLAUDE_WARNING=1`. If a run hangs
   silently, that env is the first thing to check (`archon serve` from a plain shell is the
   documented fallback).
3. **Commit custom commands/workflows to `main` before running.** Worktrees branch off `main`,
   so a workflow/command that only exists locally (uncommitted) won't be discovered in the run.
4. **`archon-assist` runs in the *live checkout*** (`worktree.enabled: false`) and **rejects
   `--branch`**. To keep `main` clean, `git checkout -b <branch>` first, then run it with **no**
   `--branch` flag — its edits land on the current branch. Worktree-based workflows (e.g.
   `flesh-out-phase`) take `--branch <name>` as normal.
5. **Squash-merge breaks `archon complete`.** After a squash-merge the worktree's original
   commits aren't in `main`'s ancestry, so cleanup is blocked; use
   `archon complete <branch> --force`. Likewise `gh pr merge --delete-branch` can't delete a
   local branch while an Archon worktree still holds it — complete the worktree first.
6. **Harmless noise to ignore:** `no such table: remote_agent_user_ai_prefs` (a migration gap in
   `~/.archon/archon.db`, logged as a warning, run continues) and `worktree_file_copy_partial`
   for missing `.env`/`.env.local` (nothing to copy).
7. **Run Archon CLI calls as single commands**, not compound (`&&`/`;`) one-liners — the skill's
   own startup health-check (`archon workflow list`) can trip the permission gate when chained.

## GitHub project structure

- **Phases → Milestones** (`Phase 0a` … `Phase 6`), with due dates.
- **Labels**: `area:*` (layer/module), `type:*`, `status:*`, `priority:*`.
- Setup is scripted and idempotent: [scripts/setup-github.sh](scripts/setup-github.sh)
  (requires `gh auth login` first).
