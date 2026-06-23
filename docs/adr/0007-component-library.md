# ADR-0007 — Component library / design system

- **Status**: Accepted (ratified at UI-3.1 kickoff, 2026-06-22)
- **Date**: 2026-06-22
- **Deciders**: Platform architecture (UI/Backend track)
- **Related**: [ui-backend-plan.md §Tech Stack Decision Strategy](../../ui-backend-plan.md), [ADR-0004](./0004-ui-framework.md) (UI framework — constrains this), [ADR-0005](./0005-graph-visualisation-library.md) (the canvas sits inside this shell)

## Context

The Knowledge Studio shell (UI-3.1) — navigation, search bar, context panel, list mode, forms for the
review queue — needs a component library / design system. [ui-backend-plan.md](../../ui-backend-plan.md)
sets the criteria: **accessibility, customisation, and bundle size**. The choice is constrained by the
UI framework (ADR-0004, React recommended) and must coexist with the graph canvas (ADR-0005).

## Decision

**shadcn/ui** (Radix UI primitives + Tailwind CSS) — copy-in components, not a runtime dependency.
Alternatives for the kickoff: **MUI** (batteries-included, faster start, heavier bundle), **Mantine**,
**Chakra UI**.

## Rationale

- **Accessibility** — Radix primitives provide WAI-ARIA-correct behaviour (focus management, keyboard
  nav, dialogs/menus) out of the box, the top criterion for an enterprise studio.
- **Customisation + bundle size** — components are copied into the repo and own their markup, so the
  design system is fully ownable and tree-shakeable; no large opaque component runtime. This serves
  both remaining criteria at once, where MUI trades bundle size for batteries-included speed.
- **Coexists with the canvas** — Tailwind utility styling and unstyled primitives don't fight
  Cytoscape/Sigma stylesheets (ADR-0005); the graph canvas stays an island inside the shell.
- **React-aligned** — first-class with the recommended framework (ADR-0004); a different framework at
  kickoff would point this at that framework's idiomatic equivalent (e.g. Vuetify, Skeleton for Svelte).

## Consequences

- **Ratified (2026-06-22)**: shadcn/ui (Radix + Tailwind), consistent with ADR-0004's React host.
- **Next**: initialise Tailwind + shadcn in `apps/knowledge-studio` at UI-3.1; capture the design
  tokens (spacing, colour incl. the coverage RAG palette shared with the Markdown matrices) as the
  shell's foundation.
- **Trigger to reconsider**: a need for a large pre-built data-grid/charting suite that MUI/Mantine
  ship and shadcn does not — weigh against bundle size at that point.
- **Not decided here**: the design tokens themselves and dark-mode strategy — UI-3.1 feature-doc detail.
