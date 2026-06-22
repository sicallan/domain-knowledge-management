# ADR-0006 — GraphQL server framework (draft — GraphQL Yoga + Pothos recommended)

- **Status**: Proposed (draft — ratify at UI-3.2 kickoff)
- **Date**: 2026-06-22
- **Deciders**: Platform architecture (UI/Backend track)
- **Related**: [ui-backend-plan.md §GraphQL primary, REST secondary](../../ui-backend-plan.md), [ADR-0004](./0004-ui-framework.md) (client), [specs/008 — Query Interface](../../specs/README.md), CLAUDE.md *Architecture commitments* (TypeScript API; port/adapter everywhere), [Phase 1 decisions D-P1.2](../phase-1/decisions.md) (in-memory + Neo4j graph adapters)

## Context

UI-3.2 delivers a **GraphQL API layer wrapping the existing Query Interface** — types for inventory
entries, relationships, and the coverage/gap views; resolvers that return data for a seeded graph.
[ui-backend-plan.md](../../ui-backend-plan.md) sets **GraphQL primary, REST secondary** (health, auth,
webhooks, upload). The decision criteria are **language alignment with the backend (TypeScript),
schema-first support, and subscription support**. CLAUDE.md commits the API to TypeScript and mandates
**port/adapter** — the GraphQL layer must wrap the existing `QueryInterface` port (D-P1.2), never reach
a store directly.

## Decision (recommended default)

**GraphQL Yoga** as the server, with **Pothos** as the code-first, type-safe schema builder (which
also **emits SDL** so the schema stays inspectable/contract-testable — satisfying the "schema-first
support" criterion without hand-writing SDL + resolver glue). REST sidecar via the same HTTP server
(Yoga runs on a standard handler). Alternative for the kickoff: **Apollo Server** (heavier, larger
ecosystem); schema-first **graphql-tools** if a hand-authored SDL contract is preferred.

## Rationale

- **TS language alignment** — Pothos gives end-to-end type safety from the resolver to the SDL with no
  codegen step; resolvers are plain TS over the `QueryInterface` port.
- **Schema-as-contract** — Pothos emits SDL, so the plan's *"schema validates; resolvers return
  expected data for seeded graph"* acceptance test (UI-3.2) becomes a snapshot of the generated SDL +
  resolver tests over the in-memory adapter — **CI-green with no live store** (CLAUDE.md CI rule).
- **Subscriptions** — Yoga supports SSE and WebSocket subscriptions for live graph updates, the named
  criterion, without bolting on a second server.
- **Port-respecting** — the GraphQL layer is an *adapter* over the existing Query Interface; swapping
  in-memory ↔ Neo4j (D-P1.2) needs no schema change.

## Consequences

- **Now (draft)**: records direction; no server scaffolded. The data source (the Query Interface port)
  already exists and is adapter-parity-tested.
- **On ratification**: scaffold `apps/api-gateway` (Yoga + Pothos) resolving over the in-memory
  adapter; the seeded-graph resolver tests are the UI-3.2 gate.
- **Trigger to reconsider**: federation/gateway needs (multiple subgraphs) or an ecosystem feature
  only Apollo provides — a superseding ADR at that point.
- **Not decided here**: auth integration mechanism (UI-3.3), persisted queries, and caching strategy —
  feature-doc detail, not ADRs.
