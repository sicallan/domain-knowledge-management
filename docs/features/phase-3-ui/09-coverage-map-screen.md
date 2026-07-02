# Feature 09 — Vendor Coverage Map screen

> Tracking: the Phase-3 UI **view-screen gap** (anticipated Feature 09, sibling to Feature
> [07](07-domain-map-screen.md) / #81). Built on the same view-screen pattern; adds **no backend**.

## 1. Feature

- **Name**: The **Coverage Map** — a read-only screen showing the L2 **"build-vs-buy"** picture over
  the *actual ingested* domain: **L1 capabilities (rows) × vendor products (columns)**, each cell
  RAG-coloured by how well that product covers that capability, with a per-row roll-up and a weighted
  summary. It answers *"which of my capabilities do my vendors actually cover, and how well?"*
- **Plan step**: [ui-backend-plan.md §Views](../../../ui-backend-plan.md) — *Vendor Coverage Map:
  "Matrix with heatmap colouring by coverage %; click cell for detail"*. This is a presentation
  screen over the **already-shipped** `coverageMap` projection (data-track step 3.3); it adds **no new
  backend**.
- **Specs/ADRs**: [spec 007 View Projection](../../../specs/007-view-projection-engine.md)
  (`vendor-coverage-projector`, sharing the D-P3.3 realisation predicate with Gap Analysis); the
  gateway `coverageMap` resolver ([Feature 02](02-graphql-api-gateway.md)); the shell
  ([Feature 01](01-application-shell.md)); the shared **RAG coverage palette** tokens
  ([Feature 01](01-application-shell.md) / `CoverageLegend`). **No new ADR.**

## 2. Summary & scope

The screen mounts in the shell (Feature 01), issues a **single `coverageMap` query** to the gateway
(Feature 02), and renders the returned `VendorCoverageView` — no new query type and no second data
model (UI-D3). The backend is **already done**: `vendor-coverage-projector.ts`, the `coverageMap`
resolver ([views.ts](../../../apps/api-gateway/src/schema/views.ts)), and the shared seed all exist.
The only thing missing was the **presentation surface**.

Today [router.tsx](../../../apps/knowledge-studio/src/router.tsx) routed `/views/coverage` to a
generic `ViewPlaceholder` whose body read *"This view is delivered in UI-3.5."* — a **stale,
incorrect** citation (UI-3.5 delivered the Explorer list, not this screen). This feature replaces
that placeholder with the real screen.

> **Coverage Map vs Gap Analysis — the deliberate split.** The Coverage Map is the **positive** view
> (what *is* covered, by whom, how well). **Gap Analysis** (sibling follow-up, Feature 10) is its
> **deterministic inverse** (what is *not* realised, and why) — both driven by the **same realisation
> predicate** (D-P3.3), so the two can never disagree. This feature ships the positive view; the
> inverse reuses the identical screen pattern.

> **A note on data.** Coverage needs **L2 vendor data** — `VendorProduct` + `VendorCapabilityMapping`
> nodes. The bundled Payments demo seed carries **capabilities but no vendor products** (the
> illustrative Adyen/Stripe scenario lives only in the in-code
> [coverage-gap-exporter](../../../demo/src/coverage-gap-exporter.ts), which renders
> [demo/payments-coverage-map.md](../../../demo/payments-coverage-map.md)). So over the live seed the
> matrix honestly renders **capability rows with no vendor columns** (with a "no vendor products
> mapped yet" note); the **populated** matrix is shown in standalone-mock mode (the `coverageMap`
> fixture in [mocks/browser.ts](../../../apps/knowledge-studio/src/mocks/browser.ts)) and in the
> component tests. Wiring a live vendor-coverage corpus is a follow-up (out of scope here).

**In scope**
- A `CoverageMapScreen` + a `coverage-map/queries.ts` `coverageMap` query and a typed urql hook.
- Render the **matrix**: capability rows, vendor-product columns, RAG cells (percentage / gaps in the
  cell + `title`), a leading **Coverage** roll-up column, and a **weighted summary** strip.
- Reuse the shared **`CoverageLegend`** + RAG palette tokens.
- **Vendor** and **domain** filters (the resolver's `vendor`/`domain` args) — re-issued server-side.
- Graceful shapes: **rows + no columns** (capabilities, no vendors mapped) render with the roll-up and
  a note; **no rows** shows the ingest-guidance empty state.
- **Loading / empty / error** states; swap the route + keep the nav target
  ([NavMenu.tsx](../../../apps/knowledge-studio/src/shell/NavMenu.tsx)); retire the placeholder.

**Out of scope**
- **Cell → Context panel** drill-in (mapping/product detail) — a natural stretch via the shared
  `selectEntry` event (Feature 06); not required for the first cut.
- **Gap Analysis** screen — sibling placeholder on the same pattern (Feature 10).
- A heatmap-gradient rendering (continuous colour by %) beyond the three-band RAG chips.
- Any projector/backend change, editing affordances, seeding L2 vendor data into the demo corpus.

## 3. Dependencies

- **Upstream**: Feature 01 (shell mount + RAG tokens + `CoverageLegend`); Feature 02 (the
  `coverageMap` resolver + SDL types, **shipped**); `@dkm/view-projection` `vendor-coverage-projector`
  + `VendorCoverageView` types (**shipped**); the urql client (UI-D7).
- **Unblocks**: the **Gap Analysis** screen (Feature 10) — identical pattern, same predicate.
- **Cross-feature**: a cell/row selection may hand off to the **Context panel**
  ([Feature 06](06-context-panel.md)) via `selectEntry` — an optional stretch.

## 4. Applied decisions

| Decision | How it constrains this feature |
|---|---|
| **UI-D2** | Renders seeded data via the gateway (Tier 1) or MSW (Tier 3); **no fixtures in the component**. |
| **UI-D3** | Consumes the `VendorCoverageView` projection from the `coverageMap` resolver only — no store reach-through, no second data model. |
| **UI-D5** | CI green with no secrets/services: component tests over MSW/jsdom; the live gateway leg is opt-in. |
| **UI-D6** | Lives in `apps/knowledge-studio`; mirrors the `@dkm/view-projection` result types via the co-located hook (public entrypoint only). |
| **UI-D7** | Uses the pinned router + urql client; one `coverageMap` query/hook, co-located. |
| **NFR a11y (WCAG 2.1 AA)** | `<table>` with `<th scope=col/row>`, cell status as **text** (percentage/label) not colour alone, keyboard-navigable, axe smoke-checked. |

## 5. User stories

- *As a solution architect, I want a matrix of my capabilities against vendor products RAG-coloured by
  coverage, so that I can see build-vs-buy at a glance.*
- *As any persona, I want to focus on one vendor (or domain), so that I can study its coverage in
  isolation.*
- *As an architect, I want each row's overall coverage roll-up and a weighted summary, so that I can
  read the headline coverage without scanning every cell.*
- *As a user of a corpus with capabilities but no vendor data, I want the screen to still list my
  capabilities and tell me no vendors are mapped yet, so that the view is honest, not blank.*
- *As a maintainer, I want the screen to read the existing `coverageMap` projection behind one hook,
  so that no new backend or data model is introduced.*

## 6. Acceptance criteria (Given/When/Then)

1. **Renders the matrix** — *Given* a populated `coverageMap` result, *when* the screen mounts, *then*
   capabilities render as rows, vendor products as columns, and graded cells surface their coverage %
   (and named gaps via `title`).
2. **Summary** — *Given* the result `summary`, *then* the weighted overall coverage % and the
   covered/partial/uncovered counts are shown.
3. **Vendor focus** — *Given* a chosen vendor, *when* applied, *then* the query re-issues with the
   `vendor` arg and only that vendor's column(s) render (server-side narrowing).
4. **Rows without vendors** — *Given* rows but zero columns, *then* the capabilities + roll-up render
   with a "no vendor products mapped yet" note (not a blank matrix).
5. **Loading state** — *Given* an in-flight query, *then* a loading affordance shows.
6. **Empty state** — *Given* a `coverageMap` with no rows, *then* the "no coverage data yet — run
   `dkm process`" guidance shows.
7. **Error state** — *Given* a gateway error, *then* a non-fatal error message shows and the shell
   stays usable.
8. **Route swap** — *Given* `/views/coverage`, *then* the real `CoverageMapScreen` renders (not the
   `ViewPlaceholder`), and the "delivered in UI-3.5" copy is gone.
9. **a11y** — *Given* the rendered matrix, *then* table/header semantics are correct, cell status is
   text not colour-only, and an axe smoke check passes.

## 7. Interface contracts

```graphql
# coverage-map/queries.ts
query CoverageMap($vendor: String, $domain: String, $rowKind: String) {
  coverageMap(vendor: $vendor, domain: $domain, rowKind: $rowKind) {
    columns { id name vendor }
    rows { id name kind status gap domain }
    cells { rowId columnId status coveragePercentage mappingId gaps }
    summary { totalCapabilities covered partial uncovered coveragePercentage }
  }
}
```

The result shape is `VendorCoverageView` from `@dkm/view-projection` (exposed by the gateway in
[views.ts](../../../apps/api-gateway/src/schema/views.ts)):

```
VendorCoverageView     { rows: VendorCoverageRow[]; columns: VendorCoverageColumn[]; cells: VendorCoverageCell[]; summary: VendorCoverageSummary }
VendorCoverageRow      { id; name; kind; status: covered|partial|uncovered; gap; domain? }
VendorCoverageColumn   { id; name; vendor }
VendorCoverageCell     { rowId; columnId; status; coveragePercentage?; mappingId?; gaps? }
VendorCoverageSummary  { totalCapabilities; covered; partial; uncovered; coveragePercentage }
```

New files: `apps/knowledge-studio/src/coverage-map/{queries.ts,useVendorCoverage.ts,CoverageMap.tsx}`,
`apps/knowledge-studio/src/screens/CoverageMapScreen.tsx`, tests alongside; one-line route change in
`router.tsx`; a `coverageMap` fixture in `apps/knowledge-studio/src/mocks/browser.ts`.

## 8. TDD test plan (written first)

- **Data mode — `coverage-map-data-mode.test.tsx`** (over MSW): populated matrix + summary
  (criteria 1, 2); vendor focus re-issues + narrows columns (3); rows-without-vendors note over the
  real seed (4); loading (5); empty guidance (6); error (7); axe baseline (9).
- **Route — extend `router.test.tsx`**: `/views/coverage` renders the real screen, placeholder copy
  gone (8).

## 9. Task breakdown

1. [x] `coverage-map/queries.ts` + `useVendorCoverage` hook (urql), typed to `VendorCoverageView`.
2. [x] `CoverageMap.tsx` presentational matrix: summary strip + rows × columns RAG cells + roll-up
   column; rows-without-vendors handling.
3. [x] `CoverageMapScreen.tsx`: hook + loading/empty/error states + vendor & domain filters + legend.
4. [x] Swap the route in `router.tsx`; retire the placeholder for this screen.
5. [x] Add the standalone `coverageMap` MSW fixture (`mocks/browser.ts`) so no-gateway mode is real.
6. [x] Tests first (data-mode: matrix/summary/focus/no-vendors/states/a11y; route swap).
7. [ ] (Stretch) cell/row → Context panel via `selectEntry`.

## 10. OCP extension points

- **Open**: a continuous **heatmap** rendering (colour by %) behind the same `VendorCoverageView`
  contract; a **cell → Context panel** drill-in; additional facets (row kind, status filter);
  **reusing this screen scaffold for Gap Analysis** (Feature 10).
- **Closed**: the `coverageMap` query / `VendorCoverageView` contract (owned by the projector +
  gateway); the shared realisation predicate (D-P3.3); the shell mount; the nav registration.

## 11. Open questions / risks

- **Populated live matrix.** No bundled corpus has L2 vendor data, so the *live* matrix is empty-of-
  columns; the populated matrix shows only in standalone-mock mode + tests. *Follow-up*: a small
  vendor-coverage demo corpus (or serialising the exporter scenario to JSONL under a dedicated
  `DKM_DOMAIN`) — kept separate so it doesn't pollute the capability/EA views with unclassified rows.
- **Cell interactivity.** First cut is read-only (percentage + gaps in `title`); cell→detail via the
  Context panel is the obvious next increment (OCP).
- **Sibling placeholder.** Gap Analysis carries the same stale "UI-3.5" citation; this feature leaves
  it visibly inconsistent — *recommend* Feature 10 next (same pattern, same predicate).
