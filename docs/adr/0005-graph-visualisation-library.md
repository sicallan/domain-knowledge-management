# ADR-0005 — Graph visualisation library (draft — Cytoscape.js recommended)

- **Status**: Proposed (draft — ratify at UI-3.4 kickoff)
- **Date**: 2026-06-22
- **Deciders**: Platform architecture (UI/Backend track)
- **Related**: [ui-backend-plan.md §Tech Stack Decision Strategy](../../ui-backend-plan.md), [ADR-0004](./0004-ui-framework.md) (UI framework — the host), [ADR-0006](./0006-graphql-server-framework.md) (data source), [specs/008 — Query Interface](../../specs/README.md), Phase 3 coverage/gap views (`modules/view-projection`)

## Context

UI-3.4 (Knowledge Explorer) renders an **interactive graph canvas** over the typed inventory graph —
nodes (decisions, concepts, capabilities, vendor products, …) and typed edges across four layers, plus
the coverage/gap overlays the data track already computes. The decision criteria
([ui-backend-plan.md](../../ui-backend-plan.md)) are **performance at scale, customisation, layout
algorithms, and accessibility**. The graph is relationship-heavy and grows with ingestion, so layout
quality and scale headroom dominate. The host is React (ADR-0004).

Note the platform already emits **PlantUML** renders for behaviour flows (Phase 2) and **Markdown RAG
matrices** for coverage/gap (Phase 3) — those static renders stay; this ADR is only about the
**interactive** explorer canvas.

## Decision (recommended default)

**Cytoscape.js** (via a thin React wrapper) for the interactive graph canvas, with **Sigma.js +
graphology** named as the **WebGL escalation path** if node counts outgrow Cytoscape's SVG/canvas
renderer. **React Flow** is recommended for the *structured* flow/DAG views (orchestration flows,
realisation chains) where a hand-laid node-edge editor beats a force layout. Alternatives for the
kickoff: D3 (low-level, maximum control, highest build cost).

## Rationale

- **Layout-algorithm maturity** — Cytoscape ships a deep library of layouts (fcose, cola, dagre,
  concentric, breadth-first) that suit a typed multi-layer graph; this is the criterion least well
  served by lighter libraries.
- **Customisation + a11y** — declarative stylesheets for node/edge encoding (coverage RAG, layer
  banding); keyboard navigation and an accessible list-mode fallback (the plan's "graph canvas + list
  mode") are achievable.
- **Scale headroom without lock-in** — Cytoscape handles thousands of elements; beyond that,
  **Sigma.js/graphology** (WebGL) is the additive escalation behind the same view-data contract, so
  growth is a renderer swap, not a rewrite.
- **Clean seam** — the canvas consumes the **same view-projection / Query-Interface data** the
  coverage/gap views already produce (D-P3.3 realisation predicate), so visualisation stays a
  presentation concern over the existing port.

## Consequences

- **Now (draft)**: records direction; no dependency added. The view-data the canvas will read already
  exists (`modules/view-projection`, the Query Interface port).
- **On ratification**: add Cytoscape (+ wrapper) under `apps/knowledge-studio`; define the
  graph-data adapter as the boundary so Sigma.js remains a drop-in escalation.
- **Trigger to escalate to WebGL**: interactive graphs that routinely exceed a few thousand visible
  nodes/edges with unacceptable layout/pan/zoom latency.
- **Not decided here**: exact layout defaults and node/edge visual encoding — UI-3.4 feature-doc detail.
