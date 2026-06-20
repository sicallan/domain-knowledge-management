# Feature 04 — Behaviour Flow View

## 1. Feature

- **Name**: Behaviour Flow view projector — a structured/visual representation of an orchestration
  flow with its steps, events, state transitions and **decision points highlighted**.
- **Plan step**: 2.4 — *Behaviour flow view: visual/structured representation of orchestration with
  decision points highlighted* ([plan.md §Phase 2](../../../plan.md)).
- **Spec(s) expanded**:
  [specs/007-view-projection-engine.md](../../../specs/007-view-projection-engine.md) — the
  **Behaviour Flow View** is already a defined view in spec 007 (§Defined Views: "Orchestration
  steps, events, decisions, state transitions", params `{ flowId }`). This feature realises that
  projector via the spec's `ViewProjector` registration pattern.

## 2. Summary & scope

The phase's **visible payoff**, mirroring Phase 1's demo-first instinct
([D-P1.6](../../phase-1/decisions.md)). Phase 1 shipped the Domain Map projector + a PlantUML
exporter; this feature adds a **second projector** (`BehaviourFlowProjector`) to the existing
View Projection Engine, producing a UI-ready structure for one flow, and **extends the existing
PlantUML exporter** to render it as an activity/sequence diagram with decision nodes visually
distinguished. It adds a projector and an export consumer — **no engine change** — exercising spec
007's OCP registration seam.

**In scope**
- A `BehaviourFlowProjector` implementing `ViewProjector<{flowId}, BehaviourFlowView>` and registered
  via `ViewEngine.registerProjector` (spec 007 Decision 2: code-based projectors).
- The `BehaviourFlowView` output structure: ordered steps, the events each step emits/consumes, state
  transitions, and **decision points** (steps that `invokes` a Decision, or where flow branches),
  flagged so the UI/diagram can highlight them.
- A **PlantUML rendering** of a behaviour flow (extending the Phase 1.6 exporter as a new projection
  consumer) — the demonstrable artefact, with decision points styled distinctly.
- Per-view refresh policy + cache invalidation: the projector declares `invalidatedBy` for the
  graph events that affect a flow (step/event/transition/decision changes within that flow).

**Out of scope**
- UI rendering in the Knowledge Explorer (Phase 3, spec 014) — this produces the **data + a PlantUML
  artefact**, not an interactive canvas (same boundary as Phase 1's Domain Map: spec 007 §Out of
  scope is "UI rendering of views").
- The **Decision Inventory** view (spec 007, params `{context?,status?,type?}`) — a *different*
  view; can be a fast follow but is not step 2.4.
- GraphQL serving of the view (Phase 3, spec 011); cross-layer traversal *correctness* (Feature 05).
- New query primitives — the projector composes existing Query Interface traversal (spec 006).

## 3. Dependencies

- **Upstream**: **Feature 01** (behaviour + decision schemas define the node/edge shapes the view
  reads); **Feature 02** + **Feature 03** (populated behaviour + decision entities/edges to project);
  the **Phase 1 View Projection Engine** (`ViewEngine`, `ViewProjector` pattern, Domain Map
  precedent) and the **Phase 1.6 PlantUML exporter** (extended here); the **Query Interface**
  (spec 006 `traverse`) for gathering the flow subgraph.
- **Unblocks**: the Phase 3 UI Behaviour Flow screen (spec 014) consumes this projector's output;
  provides a Phase 2 demo artefact.
- **Cross-feature**: depends on Feature 05 only for *correct cross-layer* highlighting (e.g. a
  decision's `realizedBy` service) — the core flow view works on behavioural/decision edges alone.

## 4. Applied decisions

> Phase 2 decisions are locked in [`docs/phase-2/decisions.md`](../../phase-2/decisions.md). The 2.4
> diagram form (PlantUML **activity** diagram; additive `BehaviourFlowView` output) is recorded under
> "Deferred to their own feature" — finalise it here. Carried-forward Phase 1 decisions and accepted
> ADRs also bind; §11 holds residual risks.

| Decision | How it constrains this feature |
|---|---|
| **spec 007 Decision 2 — code-based projectors (OCP via registration)** | The view is a registered `ViewProjector`, not a config DSL. |
| **spec 007 Decision 1 — hybrid per-view refresh** | This flow view is cheap/scoped → **on-demand** (or cached with event invalidation); declared in the projector. |
| **spec 007 Decision 3 — staleness indicator** | `ViewResult.metadata` carries `computedAt`/`stale`/`cacheHit` for the UI. |
| **D-P1.2 — in-memory + Neo4j graph adapters** (carried forward) | The projector reads via the Query Interface over the graph port; works against both adapters. |
| **D-P1.3 — language split** (carried forward) | View engine + exporter are **TypeScript**. |
| **D-P1.6 — demo-first; PlantUML the chosen format** (carried forward) | The visible artefact is a PlantUML diagram, reusing the Phase 1 exporter as a projection consumer. |
| **D-P1.4 — flesh out, don't build** | Definition only this round. |

## 5. User stories

- *As a developer, I want to see an end-to-end orchestration flow — its steps, the events it
  emits/consumes, and its state transitions — so that I can understand where my service fits.*
- *As a compliance officer, I want the **decision points** in a flow highlighted, so that I can go
  straight to where regulation bites without reading the whole flow.*
- *As an architect, I want a viewable diagram of a flow generated from the graph, so that the
  extracted behaviour model is inspectable now, not only after the Phase 3 UI lands.*
- *As a platform maintainer, I want this added as a registered projector + exporter consumer, so that
  a new view proves the OCP seam rather than modifying the engine.*

## 6. Acceptance criteria (Given/When/Then)

1. **Projector registered (OCP)** — *Given* `BehaviourFlowProjector` registered via
   `registerProjector`, *when* `listViews()` is called, *then* `behaviour-flow` appears **with no
   edit** to existing engine or Domain Map projector code.
2. **Flow projection structure** — *Given* a seeded graph with a flow of ordered steps, events and
   transitions, *when* `getView('behaviour-flow', { flowId })` runs, *then* the result lists steps in
   `sequence` order, each with its emitted/consumed events and outgoing state transitions, matching
   the seeded structure.
3. **Decision points highlighted** — *Given* a step that `invokes` a Decision, *when* the view
   projects, *then* that step is marked `isDecisionPoint: true` and carries the Decision's id/name/
   `type` and outcome branches.
4. **Unknown flow** — *Given* a `flowId` not in the graph, *when* projected, *then* an empty/clearly
   "not found" result (no exception), per the Phase 1 view-engine error contract.
5. **PlantUML render** — *Given* a projected flow, *when* the exporter runs, *then* it emits **valid
   PlantUML** (activity/sequence) in which steps appear in order, events and transitions are shown,
   and decision points are visually distinct (e.g. diamond/`if` or a highlighted node).
6. **Freshness metadata** — *Given* a cached flow view, *when* a relevant graph mutation event occurs
   (`invalidatedBy` returns true), *then* the next `getView` recomputes and `ViewResult.metadata`
   reports `stale`/`cacheHit` correctly (spec 007 Decision 3).
7. **Adapter parity** — *Given* the same seeded flow, *when* projected against the in-memory adapter
   and the Neo4j adapter, *then* the view output is identical (D-P1.2 port boundary).

## 7. Interface contracts

Reuse spec 007 verbatim — implement the existing `ViewProjector` for the already-defined view; no
engine-interface change:

```typescript
// spec 007 — unchanged
interface ViewProjector<TParams, TResult> {
  readonly viewType: string;                       // "behaviour-flow"
  project(params: TParams, context: QueryContext): Promise<TResult>;
  invalidatedBy(event: GraphMutationEvent): boolean;
}
interface ViewEngine { getView; refreshView; listViews; registerProjector; }
```

New output structure (this feature's only new type — spec 007 lists Behaviour Flow but leaves its
output schema to the implementing feature, consistent with the Domain Map precedent):

```typescript
interface BehaviourFlowView {
  flow: { id: string; name: string; trigger: string; owningService?: string };
  steps: {
    id: string;
    sequence: number;
    actionType: string;
    serviceOrComponent?: string;
    emits: { eventId: string; name: string }[];
    consumes: { eventId: string; name: string }[];
    transitions: { toState: string; fromState: string; guardCondition?: string }[];
    isDecisionPoint: boolean;
    decision?: { id: string; name: string; type: 'automated'|'manual'|'hybrid';
                 outcomes: { label: string; producesEventId?: string }[] };
    compensates?: string;                          // stepId this compensates
  }[];
}
```

## 8. TDD test plan (write these first)

- **Unit — `behaviour-flow-projector.test.ts`**: seeded subgraph → expected `BehaviourFlowView`
  (step order, emit/consume/transition wiring); decision-point flagging (criterion 3); unknown-flow
  handling.
- **Unit — `behaviour-flow-invalidation.test.ts`**: `invalidatedBy` returns true only for events
  touching this flow's steps/events/transitions/decisions.
- **Contract — `view-registration.test.ts`**: registering the projector exposes `behaviour-flow` in
  `listViews()` with **no** engine edit (OCP gate).
- **Unit — `behaviour-flow-plantuml.test.ts`**: a known view → valid PlantUML; steps in order; events
  + transitions present; decision points rendered distinctly (golden-string compare).
- **Integration — `behaviour-flow-end-to-end.test.ts`**: seed via the graph loader → project →
  export, against both in-memory and Neo4j adapters (parity, criterion 7).

## 9. Task breakdown

1. [ ] Define the `BehaviourFlowView` output type + a seeded-graph fixture (flow + steps + events +
   transitions + an invoked decision).
2. [ ] Implement `BehaviourFlowProjector.project` composing Query Interface traversal from the flow.
3. [ ] Implement decision-point detection (`invokes`-edge / branch) + outcome branches.
4. [ ] Implement `invalidatedBy` for the flow's mutation events; declare refresh policy.
5. [ ] Register the projector with `ViewEngine` (no engine edit); add `listViews` test.
6. [ ] Extend the Phase 1.6 PlantUML exporter with a behaviour-flow renderer (decision points styled).
7. [ ] Integration test (project + export) on both graph adapters.

## 10. OCP extension points

- **Open**: further views (Decision Inventory, etc.) as new registered projectors; additional export
  formats (Mermaid) as new projection consumers; new highlight rules — all without engine change.
- **Closed**: the `ViewEngine`/`ViewProjector` interfaces (spec 007); the Query Interface contract
  (spec 006); the PlantUML exporter's existing Domain Map path. A new view must not modify the engine
  or the Domain Map projector.

## 11. Open questions / risks

- **Diagram form: activity vs sequence.** A flow with decision branches reads well as a PlantUML
  *activity* diagram; service-to-service event flow reads well as a *sequence* diagram.
  *Recommendation:* activity diagram for the decision-point emphasis (the step's stated value), with
  sequence as a possible later mode. Confirm with the demo audience.
- **View output schema versioning (spec 007 Open Q2).** If the view structure changes later (Phase 3
  UI needs), how are consumers protected? *Recommendation:* additive fields only on `BehaviourFlowView`
  until a GraphQL contract pins it (Phase 3).
- **Large/looping flows (spec 007 Open Q3).** Flows with many steps or cycles (compensation loops)
  need sensible diagram bounds. *Recommendation:* cap rendered depth/breadth with a "truncated"
  indicator; pagination is a Phase 3 GraphQL concern.
- **Decision Inventory view** is a natural, cheap fast-follow (same data, different shape) but is
  out of scope for step 2.4 — flag for the Phase 2 → 3 backlog.
