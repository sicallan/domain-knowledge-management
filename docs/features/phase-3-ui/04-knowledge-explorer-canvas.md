# Feature 04 — Knowledge Explorer: Graph Canvas

## 1. Feature

- **Name**: The **Knowledge Explorer** graph canvas — an interactive **Cytoscape.js** node-link view of
  the typed inventory graph: render nodes/edges, pan/zoom, lazy expand-on-click, filter by
  layer/type/context, and switch layout modes (force-directed / hierarchical-by-layer / radial). The one
  new interactive render surface in Phase 3.
- **Plan step**: UI-3.4 — *Knowledge Explorer — graph canvas: render nodes/edges, pan/zoom/filter*
  ([ui-backend-plan.md §Knowledge Explorer](../../../ui-backend-plan.md)).
- **Specs/ADRs expanded**: [ADR-0005](../../adr/0005-graph-visualisation-library.md) (Cytoscape.js +
  the Sigma.js WebGL escalation path); [ui-backend-plan.md §Knowledge Explorer](../../../ui-backend-plan.md);
  reads the gateway's `traverse` (Feature 02) over the Query Interface.

## 2. Summary & scope

The first screen that *visualises* the graph. It mounts in the shell (Feature 01), fetches subgraphs
from the gateway's `traverse` resolver (Feature 02), and renders them on a Cytoscape canvas with a
**graph-data adapter** as the boundary (so Sigma.js remains a drop-in WebGL escalation per ADR-0005). It
deliberately reuses the **same view-data the Query Interface already serves** — visualisation is a
presentation concern, no new query type.

> **Render the port's data; don't fetch graph internals.** The canvas consumes `Subgraph`
> (`{nodes, edges, truncated}`) from the gateway's `traverse` (Feature 02), which delegates to the
> `QueryService` (UI-D3). The canvas never talks to a graph adapter and never holds a second graph
> model — it maps `Subgraph` → Cytoscape elements through one adapter function. Lazy expansion issues
> further `traverse` calls; it does not load the whole graph.

**In scope**
- A `GraphCanvas` React component (Cytoscape via a thin wrapper) rendering nodes/edges from `Subgraph`.
- **Pan/zoom**, **click-to-select** (emits `selectEntry` → context panel, Feature 06), **expand-on-click**
  (lazy `traverse` from the clicked node, merged into the view).
- **Filters**: layer / inventory type / bounded context — narrowing visible elements (server-side via
  `traverse` `nodeTypes`/`edgeTypes` where possible, client-side for the rest).
- **Layout modes**: force-directed (fcose/cola), hierarchical-by-layer (dagre), radial-from-selected
  (concentric).
- **Visual encoding**: node colour/shape by layer/type; the **coverage RAG palette** (shared with the
  data-track matrices and the design tokens, Feature 01) for coverage overlays.
- A **graph-data adapter** boundary (`Subgraph` → renderer elements) so Sigma.js is a renderer swap.
- `truncated`-aware UX (depth-cap from the Query Interface) — a "load more / expand" affordance.

**Out of scope**
- List/table mode (Feature 05 — the accessible equivalent; toggles with this).
- Context-panel *content* (Feature 06 — this only emits the selection).
- WebGL/Sigma.js itself (ADR-0005 escalation — only the adapter boundary is built so it stays a swap).
- New query types (semantic/impact — Tier-2 unavailable until later phases).

## 3. Dependencies

- **Upstream**: Feature 01 (shell mount + tokens), Feature 02 (`traverse` resolver + SDL types),
  ADR-0005 (Cytoscape). Cytoscape + a React wrapper added under `apps/knowledge-studio` (UI-D6).
- **Unblocks**: the interactive demo payoff; Feature 06 (selection → context panel); the eventual
  coverage/gap *overlays* on the canvas.
- **Cross-feature**: shares the selection event with UI-3.6 and the layer/type filter model with UI-3.5;
  shares the RAG palette with the data-track render.

## 4. Applied decisions

| Decision | How it constrains this feature |
|---|---|
| **UI-D1 / ADR-0005** | Cytoscape.js via a thin wrapper; a graph-data adapter boundary keeps Sigma.js a drop-in WebGL escalation. |
| **UI-D2** | Renders seeded data via the gateway (Tier 1) or MSW (Tier 3); no fixtures in the component. |
| **UI-D3** | Consumes `Subgraph` from `traverse` only — no graph adapter, no second graph model. |
| **NFR perf (1000 nodes < 3s; lazy load)** | Expand-on-demand + depth-cap-aware UX; layout off the main thread where feasible; LOD if needed. |
| **NFR a11y** | The list/table mode (Feature 05) is the accessible equivalent; canvas carries ARIA + keyboard focus on nodes. |

## 5. User stories

- *As any persona, I want an interactive node-link view I can pan/zoom and expand, so that I can explore
  relationships visually.*
- *As a domain architect, I want to filter by layer/type/context, so that I can focus the picture.*
- *As a platform engineer, I want layout modes (force/hierarchical/radial), so that I can read the graph
  the way that suits the question.*
- *As a maintainer, I want the canvas to read the same `traverse` data behind one adapter, so that the
  renderer (Cytoscape→Sigma) can be swapped without a rewrite.*

## 6. Acceptance criteria (Given/When/Then)

1. **Renders a seeded subgraph** — *Given* a `traverse` result for the seeded graph, *when* the canvas
   mounts, *then* the expected nodes/edges render (count + identity match the fixture).
2. **Pan/zoom** — *Given* the canvas, *when* the user pans/zooms, *then* the viewport transforms without
   re-fetching.
3. **Select** — *Given* a node, *when* clicked, *then* a `selectEntry(id)` event fires (Feature 06
   consumes it) and the node shows selected styling.
4. **Lazy expand** — *Given* a selected node, *when* "expand" is invoked, *then* a `traverse` from that
   node is fetched and merged (no duplicate nodes/edges).
5. **Filter reduces nodes** — *Given* a layer/type/context filter, *when* applied, *then* the visible
   element set is narrowed correctly (plan TDD: "filter reduces visible nodes correctly").
6. **Layout modes** — *Given* each layout mode, *when* selected, *then* the layout algorithm runs and
   positions update deterministically for the fixture.
7. **Visual encoding** — *Given* nodes of different layers/types (and coverage state), *then* colour/
   shape match the encoding + the shared RAG palette.
8. **Adapter boundary** — *Given* the `Subgraph`→elements adapter, *then* a unit test maps a known
   `Subgraph` to the expected element set (the seam Sigma.js would reuse).
9. **Truncation UX** — *Given* a `truncated: true` result, *then* the canvas signals it and offers
   expand/load-more (no silent data loss).
10. **CI green** — *Given* component tests under jsdom + MSW (Tier 3), *then* they pass with no backend;
    a headless render/perf smoke is opt-in.

## 7. Interface contracts

```
GraphCanvas        { subgraph: Subgraph, filters: GraphFilters, layout: LayoutMode,
                     onSelect(id): void, onExpand(id): void }
toCytoscapeElements(subgraph: Subgraph): ElementDefinition[]   // the adapter boundary (Sigma reuses)
GraphFilters       { layers?: string[]; types?: string[]; contexts?: string[] }
LayoutMode         = "force" | "hierarchical" | "radial"
```

New files (indicative): `apps/knowledge-studio/src/explorer/{GraphCanvas,graph-adapter,layouts,encoding}.tsx`,
`useTraverse.ts` (gateway query hook), tests alongside.

## 8. TDD test plan (write these first)

- **Adapter — `graph-adapter.test.ts`**: `Subgraph` → Cytoscape elements (criterion 8) — pure, fast.
- **Render — `GraphCanvas.test.tsx`**: seeded subgraph → expected elements (1); selected styling on
  click + `onSelect` (3); truncation affordance (9).
- **Filter — `filters.test.ts`**: filter narrows the element set (5).
- **Expand — `expand.test.tsx`**: expand merges a second `traverse` without duplicates (4).
- **Layout — `layouts.test.ts`**: each mode produces deterministic positions for the fixture (6).
- **Encoding — `encoding.test.ts`**: layer/type/coverage → colour/shape + RAG palette (7).
- **Data mode**: renders under MSW fixtures with no backend (10).

## 9. Task breakdown

1. [ ] Add Cytoscape + a thin React wrapper under `apps/knowledge-studio`.
2. [ ] Implement the `Subgraph`→elements adapter boundary (Sigma-swap-ready).
3. [ ] `GraphCanvas`: render, pan/zoom, select (emit `selectEntry`), selected styling.
4. [ ] Lazy expand via `traverse`; merge without duplicates; truncation UX.
5. [ ] Filters (layer/type/context) + the three layout modes.
6. [ ] Visual encoding + shared RAG palette.
7. [ ] Tests first (adapter, render, filter, expand, layout, encoding, MSW data mode).

## 10. OCP extension points

- **Open**: new layout modes; new visual encodings; coverage/gap overlays; a **Sigma.js/WebGL renderer**
  behind the same adapter boundary (the ADR-0005 escalation); React Flow for structured DAG views.
- **Closed**: the `traverse`/`Subgraph` contract; the adapter boundary signature; the `selectEntry`
  event. A renderer swap must not change them.

## 11. Open questions / risks

- **Layout defaults & encoding** (ADR-0005 *Not decided here*). *Recommendation:* default fcose
  (force), dagre for hierarchical-by-layer, concentric for radial; layer-banded colour + the RAG
  palette for coverage. Confirm here.
- **Scale** (NFR: 1000 nodes < 3s). *Recommendation:* lazy expand + depth-cap (already in the Query
  Interface) + LOD; if interactive graphs routinely exceed a few thousand visible elements, escalate to
  Sigma.js (the adapter makes it a swap) — the ADR-0005 trigger.
- **Server vs client filtering.** *Recommendation:* push type/edge filters into `traverse`
  (`nodeTypes`/`edgeTypes`) server-side; do context/layer narrowing client-side where the port doesn't
  express it. Avoid over-fetching then hiding.
