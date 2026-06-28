# Feature 07 — Domain Map (data-driven L1 view)

> Tracking issue: **#81**. This doc is the spec; the screen is built in a separate PR.

## 1. Feature

- **Name**: The **Domain Map** — a read-only, **data-driven** screen showing the L1 domain *as
  actually ingested*: **subdomains → bounded contexts → the concepts/services they contain**, with
  **cross-context relationships** highlighted. It answers *"what does my domain actually look like,
  as the platform has captured it?"*
- **Plan step**: [ui-backend-plan.md §Views](../../../ui-backend-plan.md) — *Domain Map: "Drill into
  subdomains; click context to see contained concepts; highlight cross-context relationships"* — and
  the main plan's **step 1.5 "first view"** (the Domain Map was always intended as the first UI
  screen; it was never built as one — the Knowledge Explorer became the interactive surface instead).
  This is a presentation screen over the **already-shipped** `domainMap` projection; it adds **no new
  backend**.
- **Specs/ADRs**: [spec 007 View Projection](../../../specs/007-view-projection-engine.md)
  (`domain-map-projector`); the gateway `domainMap` resolver ([Feature 02](02-graphql-api-gateway.md));
  the shell ([Feature 01](01-application-shell.md)); ADRs
  [0004](../../adr/0004-ui-framework.md)/[0007](../../adr/0007-component-library.md). **No new ADR.**

## 2. Summary & scope

> **Overview vs Domain Map — the deliberate split.** The **Overview** screen (shipped, #78) shows
> **how the platform *sees the world*** — the conceptual/meta-model (the concept *types* and
> relationship *types* the ontology can represent), independent of any ingested data; it is
> meaningful even on an empty system. The **Domain Map** shows **the world as actually captured** —
> the real subdomains, bounded contexts, concepts and services extracted from *your* documents.
> Overview = the lens; Domain Map = what you see through it once data is loaded. Keep these
> concerns apart: Overview never reads ingested instances; Domain Map only reads them.

The screen mounts in the shell (Feature 01), issues a **single `domainMap` query** to the gateway
(Feature 02), and renders the returned `DomainMapView` — no new query type and no second data model
(UI-D3). The backend is **already done**: `domain-map-projector.ts`, the `domainMap` resolver
([views.ts](../../../apps/api-gateway/src/schema/views.ts)), seed data, and an MSW mock all exist.
The only thing missing is the **presentation surface**.

Today [router.tsx](../../../apps/knowledge-studio/src/router.tsx) routes `/views/domain-map` to a
generic `ViewPlaceholder` whose body reads *"This view is delivered in UI-3.4."* — a **stale,
incorrect** citation (UI-3.4 delivered the Explorer canvas, not this screen). This feature replaces
that placeholder with the real screen.

**In scope**
- A `DomainMapScreen` + a `domain-map/queries.ts` `domainMap` query and a typed urql hook.
- Render the hierarchy: **subdomains** (groupings) → **bounded-context cards** (`name`,
  `conceptCount`, `serviceCount`) → each context's intra-domain **relationships**; **cross-context
  relationships** surfaced distinctly (with `type` and `strength`).
- **Subdomain focus** (the resolver's `subdomain` arg) and optional **`depth`**.
- **Loading / empty / error** states — empty reads *"no domain data ingested yet — run `dkm
  process`,"* reinforcing that this view is data-dependent (unlike Overview).
- Swap the route + keep the nav target ([NavMenu.tsx](../../../apps/knowledge-studio/src/shell/NavMenu.tsx));
  retire the placeholder for this screen.
- Reuse the shell, the urql client (UI-D7), and the design tokens / shared RAG palette where useful.

**Out of scope**
- The generic interactive node-link graph — that is the **Knowledge Explorer**
  ([Feature 04](04-knowledge-explorer-canvas.md)). Domain Map is a *structured, opinionated* L1 view,
  not free traversal.
- The conceptual-model diagram — that is **Overview** (#78).
- **Coverage Map / Gap Analysis** screens — sibling placeholders that carry the same stale citation;
  separate follow-ups built on this same pattern (anticipated Features 08/09).
- Any projector/backend change, editing affordances, or new inventory type/relationship.

## 3. Dependencies

- **Upstream**: Feature 01 (shell mount + tokens); Feature 02 (the `domainMap` resolver + SDL types,
  **shipped**); `@dkm/view-projection` `domain-map-projector` + `DomainMapView` types (**shipped**);
  the urql client (UI-D7).
- **Unblocks**: the reusable **view-screen pattern** for Coverage Map / Gap Analysis; a cross-link
  from Overview (*"see your actual domain →"*).
- **Cross-feature**: a context/concept selection may hand off to the **Context panel**
  ([Feature 06](06-context-panel.md)) via the shared `selectEntry` event — an optional stretch, not
  required for the first cut.

## 4. Applied decisions

| Decision | How it constrains this feature |
|---|---|
| **UI-D2** | Renders seeded data via the gateway (Tier 1) or MSW (Tier 3); **no fixtures in the component**. |
| **UI-D3** | Consumes the `DomainMapView` projection from the `domainMap` resolver only — no store reach-through, no second data model. |
| **UI-D5** | CI green with no secrets/services: component tests over MSW/jsdom; the live gateway leg is opt-in. |
| **UI-D6** | Lives in `apps/knowledge-studio`; imports `@dkm/view-projection` types via the public entrypoint only. |
| **UI-D7** | Uses the pinned router + urql client; one `domainMap` query/hook, co-located. |
| **NFR a11y (WCAG 2.1 AA)** | Semantic headings per subdomain, list semantics for contexts, keyboard-navigable, relationships described in text (not colour alone). |

## 5. User stories

- *As a domain architect, I want to see my **actual** subdomains and bounded contexts with how many
  concepts/services each holds, so that I can read the real shape of the captured domain.*
- *As any persona, I want to focus on one subdomain, so that I can study it without the rest.*
- *As a domain architect, I want cross-context relationships highlighted, so that I can spot coupling
  between contexts.*
- *As a new user with an empty system, I want the Domain Map to tell me there's no data yet (and how
  to add it), so that I understand it differs from the Overview.*
- *As a maintainer, I want the screen to read the existing `domainMap` projection behind one hook, so
  that no new backend or data model is introduced.*

## 6. Acceptance criteria (Given/When/Then)

1. **Renders the seeded map** — *Given* a `domainMap` result for the seeded graph, *when* the screen
   mounts, *then* every subdomain renders with its bounded-context cards, and each card shows the
   correct `conceptCount`/`serviceCount` (counts + identities match the fixture).
2. **Cross-context relationships** — *Given* `crossContextRelationships`, *then* each is shown
   distinctly with its `type` and `strength` (and is described in text, not colour alone).
3. **Subdomain focus** — *Given* a chosen subdomain, *when* applied, *then* the query re-issues with
   the `subdomain` arg and only that subdomain renders.
4. **Loading state** — *Given* an in-flight query, *then* a loading affordance shows (no layout jump
   to error/empty).
5. **Empty state** — *Given* a `domainMap` with no subdomains, *then* the screen shows the
   "no domain data ingested yet — run `dkm process`" guidance (not a blank page).
6. **Error state** — *Given* a gateway error, *then* a non-fatal error message shows and the shell
   stays usable.
7. **Route swap** — *Given* `/views/domain-map`, *then* the real `DomainMapScreen` renders (not the
   `ViewPlaceholder`), and the "delivered in UI-3.4" copy is gone.
8. **Data mode** — *Given* component tests under jsdom + MSW (Tier 3), *then* they pass with no
   backend; the live-gateway leg is opt-in (UI-D5).
9. **a11y** — *Given* the rendered map, *then* headings/list semantics are correct, it is
   keyboard-navigable, and an axe smoke check passes.

## 7. Interface contracts

```graphql
# domain-map/queries.ts  (mirrors explorer/queries.ts)
query DomainMap($subdomain: String, $depth: Int) {
  domainMap(subdomain: $subdomain, depth: $depth) {
    subdomains {
      id
      name
      contexts {
        id
        name
        conceptCount
        serviceCount
        relationships { targetContextId type }
      }
    }
    crossContextRelationships { source target type strength }
  }
}
```

The result shape is `DomainMapView` from `@dkm/view-projection` (exposed by the gateway in
[views.ts](../../../apps/api-gateway/src/schema/views.ts)):

```
DomainMapView          { subdomains: DomainMapSubdomain[]; crossContextRelationships: CrossContextRelationship[] }
DomainMapSubdomain     { id; name; contexts: DomainMapContext[] }
DomainMapContext       { id; name; conceptCount; serviceCount; relationships: ContextRelationship[] }
ContextRelationship    { targetContextId; type }
CrossContextRelationship { source; target; type; strength }
```

New files (indicative): `apps/knowledge-studio/src/domain-map/{queries.ts,useDomainMap.ts,DomainMap.tsx}`,
`apps/knowledge-studio/src/screens/DomainMapScreen.tsx`, tests alongside; one-line route change in
`router.tsx`; enrich the `domainMap` fixture in `apps/knowledge-studio/src/mocks/browser.ts`.

## 8. TDD test plan (write these first)

- **Render — `DomainMap.test.tsx`**: a seeded `DomainMapView` → subdomains + context cards with
  correct counts (criterion 1); cross-context relationships rendered (2).
- **Focus — `useDomainMap.test.ts(x)`**: choosing a subdomain re-issues with the `subdomain` arg (3).
- **States — `DomainMapScreen.test.tsx`**: loading (4), empty guidance (5), error (6) — over MSW.
- **Route — extend `router.test.tsx`**: `/views/domain-map` renders the real screen, placeholder copy
  gone (7).
- **Data mode**: renders under MSW with no backend (8).
- **a11y**: axe smoke + keyboard/heading assertions (9).

## 9. Task breakdown

1. [ ] `domain-map/queries.ts` + `useDomainMap` hook (urql), typed to `DomainMapView`.
2. [ ] `DomainMap.tsx` presentational component: subdomains → context cards (counts) → relationships;
   cross-context relationships block.
3. [ ] `DomainMapScreen.tsx`: hook + loading/empty/error states + subdomain focus control.
4. [ ] Swap the route in `router.tsx`; retire the placeholder for this screen.
5. [ ] Enrich the standalone `domainMap` MSW fixture (`mocks/browser.ts`) so no-gateway mode is real.
6. [ ] Tests first (render, focus, states, route, data-mode, a11y).
7. [ ] (Optional stretch) selection → Context panel via `selectEntry`.

## 10. OCP extension points

- **Open**: a richer **visual** rendering (a structured diagram / React-Flow grouping) behind the same
  `DomainMapView` contract; additional facets (filter by relationship `type`/`strength`); a
  selection→Context-panel handoff; reusing this screen scaffold for **Coverage Map / Gap Analysis**.
- **Closed**: the `domainMap` query / `DomainMapView` contract (owned by the projector + gateway); the
  shell mount; the nav registration. A presentation change must not alter them.

## 11. Open questions / risks

- **Visual treatment.** First cut is **nested cards/lists** (subdomain → context cards → relationship
  chips) — fast, accessible, deterministic to test. A grouped node-link/React-Flow diagram is a later
  enhancement behind the same contract (OCP). *Confirm the first-cut treatment here.*
- **Overlap with Overview/Explorer.** Keep the boundary crisp: Overview = meta-model (no data),
  Explorer = free graph traversal, Domain Map = structured L1 instances. Avoid drifting Domain Map
  toward a second Explorer.
- **Mock fidelity.** The standalone fixture is currently one empty `Payments` subdomain; enrich it so
  the no-gateway demo and the empty-state test are both exercised honestly.
- **Sibling placeholders.** Coverage Map / Gap Analysis carry the same stale "UI-3.5" citation; fixing
  Domain Map leaves them visibly inconsistent. *Recommend* filing 08/09 as follow-ups (same pattern)
  so the three view screens land coherently.
