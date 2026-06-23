# Phase 3 — Locked Technical Decisions (UI/Backend track)

These decisions are inputs to every Phase 3 **UI/Backend-track** feature (UI-3.1…UI-3.6). They are the
UI-track counterpart to the data track's [docs/phase-3/decisions.md](../phase-3/decisions.md): the
settled ground the application shell, GraphQL gateway, auth, and Knowledge Explorer rest on. The
tech-stack choices are already taken as full ADRs ([0004](../adr/0004-ui-framework.md)–
[0007](../adr/0007-component-library.md), ratified 2026-06-22); this file locks the **architectural**
decisions those ADRs do not cover — chiefly *how the UI runs against a not-yet-built backend without
creating throwaway code*.

UI/Backend goal (from [ui-backend-plan.md §Phase 3](../../ui-backend-plan.md)): deliver the
**application shell** (navigation, search, context panel), a **GraphQL API layer wrapping the existing
Query Interface**, **authentication integration**, and the **Knowledge Explorer** (graph canvas + list
mode) — the first user-facing surface over the typed inventory graph the data track populates.

> **Scope.** This file covers the **UI/Backend track** (UI-3.1…UI-3.6) only. The **data/core track**
> (3.1–3.4, shipped) keeps its decisions in [docs/phase-3/decisions.md](../phase-3/decisions.md). The
> two tracks meet at exactly one place: the **Query Interface port** (`@dkm/query-interface`), which
> the data track reads through and the UI track now serves over GraphQL.

## Carried forward (bind unchanged)

- [**D-P1.2**](../phase-1/decisions.md) — in-memory + Neo4j graph adapters behind the 0b `GraphPort`.
  The whole UI-track mock strategy (UI-D2) rests on this seam being real and parity-tested.
- [**D-P1.5**](../phase-1/decisions.md) — the two-tier quality model (emit / review / auto-merge); the
  UI surfaces `confidence` and review state but does not change the gates.
- [**D-P3.4**](../phase-3/decisions.md) — **PostgreSQL deferred**. The data track decided "not yet";
  this track confirms it (UI-D4) and names the trigger that would raise the ADR.
- [**ADR-0001**](../adr/0001-intermediate-jsonl-vs-okf-interchange.md) — typed JSONL at the core; the
  GraphQL layer is an *interchange edge*, not a second internal format.
- The **CLAUDE.md CI rule** — CI stays green without secrets or live services. UI-D5 carries this into
  app code.

---

## UI-D1 — Tech stack: the four UI ADRs, ratified

Ratified 2026-06-22 (see each ADR for rationale): **React + Vite + TypeScript**
([0004](../adr/0004-ui-framework.md)), **Cytoscape.js** for the interactive canvas with **Sigma.js +
graphology** as the WebGL escalation path ([0005](../adr/0005-graph-visualisation-library.md)),
**GraphQL Yoga + Pothos** (code-first, SDL-emitting) for the server
([0006](../adr/0006-graphql-server-framework.md)), and **shadcn/ui (Radix + Tailwind)** for the
component library ([0007](../adr/0007-component-library.md)). These are *closed* for the track —
revisit only via a superseding ADR. Secondary client choices (router, client state, GraphQL client)
are **not** ADR-worthy and are pinned in the UI-3.1 feature doc (see UI-D7).

## UI-D2 — Backend realisation strategy: the in-memory adapter **is** the dev/demo backend — three swap points, one GraphQL contract ⭐

The defining decision of this track, and the answer to *"how do we interact with the UI on mocks
before the full backend exists, then swap for the real thing without pain?"* **We do not build a
bespoke mock backend.** The architecture already provides the swap seam; a parallel mock would be a
second thing to keep in sync. Instead the *real* backend runs over an ephemeral store, and there are
**three swap points behind one contract**.

**The contract is the GraphQL SDL.** Pothos (D-P1's TypeScript alignment, ADR-0006) is code-first but
**emits SDL**, so the schema has a single source of truth and is **snapshot-tested** in CI. The
frontend codes against the SDL and never knows what is behind it. Behind it, from most-real to
most-fake:

1. **Swap the `GraphPort` adapter** (in-memory ↔ Neo4j — D-P1.2, already parity-tested). The
   **default dev/demo backend** is `apps/api-gateway` booting Yoga + Pothos over `GraphQueryService`
   over an `InMemoryGraphAdapter` seeded from `demo/*.jsonl` via the existing `GraphLoader`. This is
   **not a mock** — it is the production read path (real pagination, traversal, filtering, view
   projection) on an ephemeral store. Going to production is **one line of wiring**: construct
   `Neo4jGraphAdapter` instead of `InMemoryGraphAdapter`. The SDL and the frontend do not change.
2. **Swap the `QueryService`** (the port the resolvers depend on). For query types whose backend is
   genuinely not built yet — semantic/full-text/faceted/temporal search, impact (Phase 4) —
   `GraphQueryService` **already returns a typed `BackendUnavailableResult`** (`available: false`,
   with a reason) instead of throwing. The GraphQL layer maps that to an **honest "unavailable / coming
   soon" state**, never a fake success. This is a feature, not a gap: the UI can show the *shape* of
   those screens with a truthful disabled state, and the stub branch is deleted when the backend lands.
3. **Swap the transport (MSW in the browser).** For Storybook, isolated component work, offline
   development, and any static deployed demo with no server, **Mock Service Worker** intercepts GraphQL
   operations and returns fixtures **validated against the same generated SDL** — so the mock cannot
   drift from the contract.

**The invariant that keeps the swap painless (and CI honest):** **resolvers never hand-roll fixture
objects inline.** They depend on the `QueryService` interface (injected) and compose only its
primitives. *All* the "fakeness" lives in which adapter and which seed data are wired at the bottom —
never in resolver bodies. Consequently the UI-3.2 resolver tests run over the in-memory adapter, which
is the **same code path production uses**. There is exactly **one canonical seed dataset**
(`seedInMemoryGraph()`) shared by the dev server, the resolver tests, and the MSW handlers — *one
dataset, three consumers*.

**Recommended default:** Tier 1 is the day-to-day dev experience (`pnpm dev` → a real Yoga endpoint over
seeded payments data → a clickable Knowledge Explorer immediately); Tier 3 (MSW) is the Storybook /
offline fallback. This is locked across UI-3.1…UI-3.6.

## UI-D3 — The GraphQL layer is an *adapter over the Query Interface port*, never a store reach-through

The direct corollary of CLAUDE.md's *port/adapter everywhere* and the exact mirror of the data track's
"projectors compose only Query-Interface primitives" rule (D-P1.2). Resolvers receive a `QueryService`
(and, where a view is requested, a `ViewEngine`/projector from `@dkm/view-projection`) by injection;
they **never** import a graph adapter, open a Neo4j driver, or read `demo/*.jsonl` directly. The
GraphQL schema is a *presentation projection* of the port's result types (`InventoryEntry`,
`RelationshipEntry`, `SubgraphResult`, `PaginatedResult`, the view shapes), not a second data model.
Adapter parity (in-memory ↔ Neo4j) is therefore inherited for free, and swapping stores needs **no
schema or resolver change**.

## UI-D4 — PostgreSQL stays deferred (confirms D-P3.4); RBAC *enforcement* deferred to Phase 5

The UI track does **not** introduce a relational store. The Query Interface (in-memory/Neo4j) serves
all read queries; the GraphQL gateway is stateless. Auth (UI-3.3) wires the OIDC flow, session, and the
mapping of IdP claims → `QueryContext.{roles, scopes}`, but **RBAC enforcement** stays the Phase 5 job —
the enforcement seam already exists as `PassThroughAccessFilter` (every query already funnels through an
`AccessFilter` on the hot path), so a scope-enforcing filter is pushed down later **behind the same
interface** with no resolver rework. The trigger that *does* raise the PostgreSQL ADR is the **durable
admin/audit/RBAC store** (corrections queue, audit log, persisted sessions, saved views) — those
materialise in Phase 5, and the ADR is raised **there**, not here.

## UI-D5 — CI stays green without secrets or services (the CLAUDE.md rule, carried into app code)

The required CI path for this track uses **no Neo4j, no PostgreSQL, no live IdP, no `ANTHROPIC_API_KEY`**:

- **Backend** — resolver tests run `GraphQueryService` over the **in-memory adapter** (the gate); an
  **SDL snapshot test** guards the GraphQL contract; the seeded-graph resolver suite is the UI-3.2
  acceptance gate.
- **Frontend** — component/interaction tests run under **jsdom + Testing Library** with **MSW** serving
  the SDL-validated fixtures; no network, no backend process.
- **Live legs auto-skip.** A cross-adapter parity e2e (in-memory vs Neo4j) runs only when `NEO4J_URI`
  is set; a real-OIDC integration test runs only when the IdP env is set. Each skips by default and its
  real-world verification is tracked as a **follow-up issue** (per the CLAUDE.md CI rule).

## UI-D6 — Monorepo: `apps/*` joins the pnpm workspace; apps depend on `@dkm/*` packages, never their internals

`apps/` is a new top-level area. `pnpm-workspace.yaml` (currently `modules/*`) is extended **additively**
to `["modules/*", "apps/*"]` (UI-3.1's first task). Two apps:

- **`apps/api-gateway`** — Node + GraphQL Yoga + Pothos; tested with vitest. Depends on
  `@dkm/query-interface`, `@dkm/knowledge-graph`, `@dkm/view-projection`, `@dkm/loaders`, `@dkm/schema`
  as **workspace packages** through their public entrypoints only (never deep imports).
- **`apps/knowledge-studio`** — Vite + React + TS; tested with vitest + Testing Library + MSW. Talks to
  the gateway over GraphQL; shares **generated types** from the SDL (no hand-kept duplicate of the
  domain model).

The shared `seedInMemoryGraph()` (UI-D2) lives where both apps and their tests can import it — a small
seed util sourced from `demo/*.jsonl`, the single canonical fixture.

## UI-D7 — Secondary client stack: deferred to the UI-3.1 feature doc (recommendation given, not an ADR)

Routing, client state, and the GraphQL client are framework-secondary and pinned in UI-3.1, not as
ADRs. **Working defaults:** React Router (or TanStack Router) for routing; a typed GraphQL client
(**urql** — light, good React + SSR-agnostic story — or TanStack Query + `graphql-request`); minimal
client state via **Zustand**/Context (the graph itself is server state, fetched, not duplicated in a
store). Confirm in UI-3.1; change without an ADR.

## UI-D8 — Dev identity: an env-gated fake `QueryContext` so the app is fully clickable with no IdP

The same spirit as UI-D2 applied to auth: a **dev-mode fake identity** (env-gated, off by default)
injects a `QueryContext` (`userId`, `roles`, `scopes`, `requestId`) at the gateway edge so the entire
UI is usable end-to-end **without an IdP running**. UI-3.3 still delivers the real OIDC flow + session +
claim mapping; the fake identity is a dev/demo convenience that the real flow supersedes when its env is
present — never the production path.

---

## Deferred to a later phase or feature (default = the plan's recommendation)

Locked lightly; finalise when the feature is built so we don't over-commit ahead:

- **Real-time transport (WebSocket/SSE subscriptions)** — Phase 5 per
  [ui-backend-plan.md](../../ui-backend-plan.md). Yoga supports both (ADR-0006); the Phase 3 gateway
  ships query/mutation only.
- **Export (PDF/CSV/JSON)** — Phase 4. The Knowledge Explorer's list mode (UI-3.5) is export-shaped but
  the export *service* is later scope.
- **Q&A / NL interface** — Phase 4. The search bar (UI-3.1) dispatches structured queries now; the
  natural-language route surfaces the Tier-2 `BackendUnavailableResult` until then.
- **REST sidecar** (health, auth callback, upload) — added on the same Yoga HTTP server as needed by
  UI-3.3; not a separate decision.
- **Design tokens & dark-mode strategy** — UI-3.1 feature-doc detail (ADR-0007 *Not decided here*),
  including the coverage RAG palette shared with the data track's Markdown matrices.
- **Cytoscape layout defaults & node/edge visual encoding** — UI-3.4 feature-doc detail (ADR-0005
  *Not decided here*).
