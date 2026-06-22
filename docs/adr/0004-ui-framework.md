# ADR-0004 — UI framework for the Knowledge Studio (draft — React recommended)

- **Status**: Proposed (draft — ratify at UI-3.1 kickoff)
- **Date**: 2026-06-22
- **Deciders**: Platform architecture (UI/Backend track)
- **Related**: [ui-backend-plan.md §Tech Stack Decision Strategy](../../ui-backend-plan.md), [Phase 3 decisions *Deferred*](../phase-3/decisions.md), CLAUDE.md *Architecture commitments* (TypeScript for UI), sibling drafts [ADR-0005](./0005-graph-visualisation-library.md) (graph viz), [ADR-0006](./0006-graphql-server-framework.md) (GraphQL server), [ADR-0007](./0007-component-library.md) (component library)

## Context

The UI/Backend track (UI-3.1…UI-3.6) begins in Phase 3 and needs a client framework for the Knowledge
Studio: an application shell (navigation, search, context panel) and a Knowledge Explorer (interactive
graph canvas + list mode). [ui-backend-plan.md](../../ui-backend-plan.md) keeps the architecture
**framework-agnostic** and lists the decision criteria for this moment: **team familiarity, the
graph-visualisation library ecosystem, and component-library maturity**. CLAUDE.md already commits the
UI to **TypeScript**, so the choice is among TS-first frameworks.

This decision is the **anchor** of the four UI ADRs: it constrains which graph-viz bindings
(ADR-0005) and which component library (ADR-0007) are ergonomic, so it is ratified first.

## Decision (recommended default)

**React (with TypeScript, Vite build).** Alternatives kept on the table for the kickoff discussion:
Vue 3, Svelte 5, SolidJS.

## Rationale

- **Largest graph-viz + component ecosystem** — the named criteria. Cytoscape.js, React Flow,
  Sigma.js, visx and the Radix/shadcn component ecosystem all ship first-class React bindings; this
  directly de-risks ADR-0005 and ADR-0007.
- **TS-first, hiring/familiarity depth** — aligns with the existing TS codebase (schemas, modules,
  loaders) and the largest contributor pool.
- **Incremental + framework-agnostic seam preserved** — the plan's component responsibilities are
  defined as interfaces; React is an implementation of them, not a leak into the domain core.

Svelte/Solid win on bundle size and raw runtime, and Vue on template ergonomics, but each has a
thinner graph-viz/component ecosystem — the dominant criterion for a relationship-heavy explorer.

## Consequences

- **Now (draft)**: no code committed; this records the recommended direction so ADR-0005/0007 can be
  drafted against a concrete host. The domain/core and the GraphQL contract (ADR-0006) stay
  framework-agnostic — a different framework choice at kickoff would not touch them.
- **On ratification**: scaffold `apps/knowledge-studio` (Vite + React + TS); pin the choice to
  *Accepted* and supersede this draft.
- **Trigger to reconsider**: a graph-viz or accessibility requirement that a non-React framework
  serves materially better, surfaced during UI-3.4 (Knowledge Explorer).
- **Not decided here**: routing, state management, and data-fetching client — secondary choices that
  follow the framework and are captured in the UI-3.x feature docs, not as ADRs.
