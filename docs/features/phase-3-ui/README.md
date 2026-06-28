# Phase 3 — Feature Definitions (UI/Backend track)

**Goal**: stand up the first **user-facing surface** over the typed inventory graph — the
**Knowledge Studio** web app and the **GraphQL gateway** that serves it. Deliver the application shell
(navigation, global search, context panel), a GraphQL API wrapping the existing Query Interface,
authentication integration, and the **Knowledge Explorer** (interactive graph canvas + list/table
mode) — steps UI-3.1…UI-3.6 in [ui-backend-plan.md §Phase 3](../../../ui-backend-plan.md). This is the
first time the platform is something you *click around*, not just a pipeline that emits files.

> **Scope of this directory.** Phase 3 runs **two parallel tracks**. This directory covers the
> **UI/Backend track** (UI-3.1…UI-3.6). The **data/core track** (steps 3.1–3.4 — L2 schemas, vendor
> extraction, Coverage Map, Gap Analysis) is **shipped** and fleshed out in
> [docs/features/phase-3/](../phase-3/). The two tracks meet at exactly one seam: the **Query
> Interface port** (`@dkm/query-interface`) the data track reads through and this track now serves over
> GraphQL. This track adds **new tech stack** (React, Cytoscape, Yoga+Pothos, shadcn) gated on its four
> ratified ADRs — hence it is sequenced after the data track, which had a real L2 graph to render.

Source of truth: [ui-backend-plan.md §Phase 3](../../../ui-backend-plan.md) (the UI-3.x steps + NFRs),
the ratified tech-stack ADRs [0004](../../adr/0004-ui-framework.md)–[0007](../../adr/0007-component-library.md),
the locked UI-track decisions in [docs/phase-3-ui/decisions.md](../../phase-3-ui/decisions.md), the
existing [spec 006/008 Query Interface](../../../specs/README.md) and
[spec 007 View Projection](../../../specs/007-view-projection-engine.md), and the carried-forward
[Phase 1](../phase-1/decisions.md)/[Phase 2](../phase-2/decisions.md)/[data-track](../phase-3/decisions.md)
decisions. These docs **expand** those into buildable feature definitions; they do not restate or
contradict them.

## Feature index

| # | Feature | Plan step | Reads / wraps | Lang | One-line summary |
|---|---------|-----------|---------------|------|------------------|
| [01](01-application-shell.md) | Application shell | UI-3.1 | — | React+Vite+TS scaffold of `apps/knowledge-studio`: nav, global search bar, context-panel slot, breadcrumb, notification centre, shadcn/Tailwind foundation. The frame every later screen mounts in. |
| [02](02-graphql-api-gateway.md) | GraphQL API gateway | UI-3.2 | `@dkm/query-interface` | `apps/api-gateway` (Yoga+Pothos) wrapping the Query Interface port; SDL-as-contract (snapshot-tested); resolvers tested over the **in-memory adapter**, seeded from `demo/*.jsonl`. The "mock backend" that is really the real backend. |
| [03](03-auth-integration.md) | Authentication integration | UI-3.3 | gateway edge | OIDC/OAuth2 flow, session, IdP-claim → `QueryContext.{roles,scopes}` mapping; env-gated **dev fake identity** so the app is clickable with no IdP. RBAC *enforcement* stays Phase 5 (the `AccessFilter` seam exists). |
| [04](04-knowledge-explorer-canvas.md) | Knowledge Explorer — graph canvas | UI-3.4 | gateway → `traverse` | Cytoscape.js canvas: render nodes/edges, pan/zoom, lazy expand, filter by layer/type/context, layout modes. The one new interactive render surface. |
| [05](05-explorer-list-table.md) | Knowledge Explorer — list/table mode | UI-3.5 | gateway → `listEntries` | Tabular view of the same data: sort, group, faceted filters (layer, type, lifecycle, owner, confidence, date); toggles with the canvas. The accessible fallback for the graph. |
| [06](06-context-panel.md) | Context panel | UI-3.6 | gateway → `getEntry`/`traverse` | Slide-out detail panel: full entry detail + relationships + evidence/provenance on selection, from anywhere (canvas, list, search). Closes the explore→inspect loop. |
| [07](07-domain-map-screen.md) | Domain Map screen | §Views (step 1.5) | gateway → `domainMap` | Data-driven L1 view of the *actual ingested* domain: subdomains → bounded-context cards (concept/service counts) → cross-context relationships. Replaces the stale `/views/domain-map` placeholder. |

> **View screens (07+).** The data-track projections (Domain Map, Coverage Map, Gap Analysis) ship as
> GraphQL queries, but beyond the Explorer they still need **presentation screens** — today their
> routes are `ViewPlaceholder`s with stale "delivered in UI-3.x" copy. Feature 07 (Domain Map) is the
> first; Coverage Map / Gap Analysis are anticipated follow-ups (08/09) on the same pattern. These add
> **no backend** — the projectors and resolvers already exist. Note the deliberate split: the
> **Overview** screen (#78) shows the *conceptual model* (how the tool sees the world, no data); the
> **Domain Map** shows the *actual ingested* domain.

## Build order

```
UI-3.1 (shell) ─┬─► UI-3.4 (canvas) ─┐
                ├─► UI-3.5 (list)    ├─► UI-3.6 (context panel)
UI-3.2 (gateway)┘                    │
UI-3.3 (auth) ───────(edge, parallel)┘
```

**First slice = UI-3.1 + UI-3.2** (per the plan): the shell and the GraphQL gateway are the foundation
everything else mounts on, and together they already produce a clickable app over seeded data (shell
renders; gateway serves `demo/*.jsonl` through the in-memory adapter). **UI-3.4** (canvas) is the next
demo payoff — the Knowledge Explorer reading `traverse` over the same data. UI-3.5/3.6 round out the
explorer. UI-3.3 (auth) runs at the gateway edge and can land in parallel; its dev-fake-identity mode
(UI-D8) means the explorer never *blocks* on a real IdP.

## Slice flow

```
                 ┌─ apps/knowledge-studio (React+Vite, shadcn) ───────────────────┐
                 │   shell · search · context panel · Cytoscape canvas · list     │
   user ◄────────┤                          ▲  GraphQL (SDL = contract)           │
                 └──────────────────────────┼─────────────────────────────────────┘
                                            │  urql/typed client (UI-D7)
                 ┌──────────────────────────┴─────────────────────────────────────┐
                 │ apps/api-gateway (Yoga + Pothos) — resolvers = adapter over PORT │
                 └──────────────────────────┬─────────────────────────────────────┘
                                            │ @dkm/query-interface (QueryService)  + @dkm/view-projection
                 ┌──────────────────────────┴─────────────────────────────────────┐
   DEV/DEMO ◄────┤ GraphQueryService ─► InMemoryGraphAdapter ◄seed─ demo/*.jsonl    │  ← swap ⇩ for prod
   PROD     ◄────┤ GraphQueryService ─► Neo4jGraphAdapter (D-P1.2, parity-tested)   │     (one line; SDL/UI unchanged)
                 └──────────────────────────────────────────────────────────────────┘
```

## This is the application layer, not a domain layer

Phases 0–3(data) populate the four-layer domain model (L0–L3) as typed inventory in the graph. This
track adds **no new inventory type, relationship, or layer** — it is a *presentation and access*
surface over what already exists. The GraphQL schema is a projection of the Query Interface's result
types (UI-D3), not a second data model; the React components render those projections. The domain core
stays framework-agnostic — a different UI framework would not touch it.

## Decisions applied across all features

Locked in [docs/phase-3-ui/decisions.md](../../phase-3-ui/decisions.md) — every UI feature binds these:

- **UI-D1** — tech stack: React+Vite+TS, Cytoscape.js, GraphQL Yoga+Pothos, shadcn/Radix/Tailwind
  (ADRs [0004](../../adr/0004-ui-framework.md)–[0007](../../adr/0007-component-library.md)).
- **UI-D2** ⭐ — **the in-memory adapter is the dev/demo backend**; three swap points (GraphPort,
  QueryService, MSW transport) behind one **SDL contract**; resolvers never hand-roll fixtures; one
  shared `seedInMemoryGraph()`.
- **UI-D3** — GraphQL is an **adapter over the Query Interface port**, never a store reach-through.
- **UI-D4** — PostgreSQL stays deferred; RBAC enforcement is Phase 5 (the `AccessFilter` seam exists).
- **UI-D5** — CI green with **no secrets/services**: resolvers over the in-memory adapter, SDL snapshot,
  frontend over MSW/jsdom; live legs auto-skip + follow-up issue.
- **UI-D6** — `apps/*` joins the pnpm workspace; apps depend on `@dkm/*` public entrypoints only.
- **UI-D7** — secondary client stack (router/state/GraphQL client) pinned in UI-3.1, not an ADR.
- **UI-D8** — env-gated **dev fake identity** so the app is clickable with no IdP.

## Cross-cutting open questions for the team

- **One app or shell + remotes?** Recommendation: **one Vite app** (`apps/knowledge-studio`) for
  Phase 3 — micro-frontends are premature; the shell composes screens as routes/lazy chunks. Revisit
  only if independent deploy cadence is needed.
- **Generated GraphQL types — where?** Recommendation: generate client types from the gateway's
  **emitted SDL** (the single contract) into `apps/knowledge-studio`, regenerated in CI and snapshot-
  guarded, so the frontend's domain types can never drift from the server's. Confirm the codegen tool
  in UI-3.2 (the SDL emitter) / UI-3.1 (the consumer).
- **Search bar scope in Phase 3** — the bar is always-present (UI-3.1) but NL Q&A is Phase 4.
  Recommendation: Phase 3 dispatches **structured** entity/type search via `listEntries`; the NL route
  is wired to surface the Tier-2 `BackendUnavailableResult` "coming soon" state (UI-D2) until Phase 4.
- **Accessibility of the graph canvas** — WCAG 2.1 AA is the NFR. Recommendation: the **list/table mode
  (UI-3.5) is the accessible equivalent** of the canvas (same data, keyboard-navigable, screen-reader
  friendly), and the canvas carries ARIA annotations — audited in UI-3.4/3.5, not deferred.
