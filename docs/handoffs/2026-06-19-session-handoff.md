# Session Handoff — Phase 1 completion, demo + investor decks, Phase 2 flesh-out kicked off

_Date: 2026-06-19 · Working dir: `/home/simonc/tools/domain-knowledge-management`_

## Where it started
Session began as "ship Phase 1 feature #9 (Domain Map View) via Archon using the ship-feature skill," then continued through the rest of the Phase 1 slice (#10, #11), a stakeholder demo expansion, an investor pitch kit, issue tidy-up, and finally kicking off the Phase 2 flesh-out. Working dir throughout: `/home/simonc/tools/domain-knowledge-management` (Linux).

## Decisions locked + what shipped
- **#9 Domain Map View** — merged PR #27. New module `/home/simonc/tools/domain-knowledge-management/modules/view-projection` (`@dkm/view-projection`). Maintainer chose to add **real `Subdomain`/`BoundedContext` L1 schemas** (not source-doc proxies) — see `/home/simonc/tools/domain-knowledge-management/schemas/inventory/L1/`.
- **#10 JSON connector** (ingestion OCP gate) — merged PR #29. Surfaced finding **#30** (Python extraction `structured` path incomplete).
- **#11 vector-loader stub** (indexing OCP gate) — merged PR #31. `FakeEmbedder` default; **ADR-0002** defers the vector-DB choice (`/home/simonc/tools/domain-knowledge-management/docs/adr/0002-vector-store-selection-deferred.md`).
- **Phase 1 milestone CLOSED**; all features #5–#11 closed. `main` HEAD = `22fb82a`.
- **Demo expansion** — merged PR #32. Two-connector ingestion (real registry) + structured `DomainMapView` JSON. Files under `/home/simonc/tools/domain-knowledge-management/demo/` (`src/run.ts`, `src/domain-map-exporter.ts`, `sources/payments-reference-data.json`, `payments-domain-map.json`).
- **Investor decks + logo** — merged PR #33; **brand config + suggested copy** merged PR #34. Files: `/home/simonc/tools/domain-knowledge-management/demo/investor-deck-present.html`, `.../investor-deck-read.html`, `.../brand/logo.svg`, `.../brand/logomark.svg`. Brand "Veritgraph" is a placeholder set via a `BRAND CONFIG` block at the bottom of each deck.
- **Issue hygiene** — #30 reassigned to the **Phase 2** milestone; **Phase 0a & 0b milestones closed** (were empty).

## Key files for next session
- `/home/simonc/tools/domain-knowledge-management/plan.md` — read §Phase 2 (around line 450): steps 2.1–2.5 the flesh-out is expanding.
- `/home/simonc/tools/domain-knowledge-management/.archon/commands/flesh-out-phase.md` — what the running workflow produces (feature docs + README + one issue per feature, Phase 2 milestone).
- `/home/simonc/tools/domain-knowledge-management/CLAUDE.md` — "Building with Archon" + operational gotchas (esp. #5 squash-merge → `archon complete --force`, #8 session-limit recovery, #9 kill by PID not `pkill -f`).
- `/home/simonc/tools/domain-knowledge-management/.claude/skills/ship-feature/` — the loop to ship 2.1 once fleshed out.
- Memory touched: `/home/simonc/.claude/projects/-home-simonc-tools-domain-knowledge-management/memory/MEMORY.md`, `.../phase1-demo-first-reprioritisation.md`, `.../feature9-domain-map-real-context-schemas.md` (created this session).

## Running state
- **Background process: shell `bwgicyvwo`** — Archon `flesh-out-phase "2"`, still running. Log: `/home/simonc/tools/domain-knowledge-management/logs/archon/flesh-out-phase-2-20260619-123456.log`. The harness will notify on completion; to read interim progress, `Read` the log. To kill: `pgrep -af flesh-out-phase` then `kill <pid>` (do **not** `pkill -f` — gotcha #9).
- **Open worktree/branch:** `/home/simonc/.archon/workspaces/tools/domain-knowledge-management/worktrees/archon/task-docs-phase2-flesh-out` (branch `archon/task-docs-phase2-flesh-out`).
- Other Archon runs this session (#9 `bu3iw4r2v`, #10 `b8e6tt7u7`, #11 `biudxqx12`) all completed and merged — not running.
- Dev servers / ports: none.

## Verification — how to confirm things still work
- `cd /home/simonc/tools/domain-knowledge-management && pnpm run validate` → 273 passed / 5 skipped.
- `cd /home/simonc/tools/domain-knowledge-management && pnpm demo` → "registered connectors: filesystem, json"; 2 subdomains / 4 bounded contexts; writes `demo/payments-domain-map.{json,puml,png}`.
- Decks: open `/home/simonc/tools/domain-knowledge-management/demo/investor-deck-present.html` (arrow keys) and `.../investor-deck-read.html` (scroll) in a browser.
- Flesh-out progress: `gh pr list` (a `docs/phase2-flesh-out` PR will appear) and `gh issue list --milestone "Phase 2 — Behaviour & Decisions"`.

## Deferred + open questions
- Deferred (live-service verifications, unmilestoned backlog; need Neo4j / live-Claude — Phase 3 env): **#19, #21, #24, #28**.
- Deferred: **#30** (Python extraction structured-content gap) — now in Phase 2 milestone, not yet fixed.
- Deferred (demo): **option-D data enrichment** — Fraud Scoring context shows "0 concepts" (data-accurate; its members are Decisions/Rules). User offered it; not done.
- Open: **no `docs/phase-2/decisions.md` locked** — the flesh-out proceeds without it and will surface Phase 2 "Open questions" (e.g. decision-extraction accuracy gates). May want to lock a few before building 2.x.
- Open: brand name **"Veritgraph"** is a placeholder (confirm availability/rename via the decks' `BRAND CONFIG`); investor `.ph` chips (TAM, metrics, team, raise) need real data.

## Pick up here
When `bwgicyvwo` finishes, review `docs/features/phase-2/*.md` + the new Phase 2 issues, merge the flesh-out PR (docs-only), then ship **feature 2.1 (behaviour inventory schemas)** via the ship-feature loop.
