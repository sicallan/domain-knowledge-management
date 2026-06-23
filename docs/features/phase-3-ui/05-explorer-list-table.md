# Feature 05 — Knowledge Explorer: List/Table Mode

## 1. Feature

- **Name**: The **Knowledge Explorer** list/table mode — a tabular view of the same inventory data the
  canvas shows: sort, group, and **faceted filters** (layer, inventory type, lifecycle status, owner,
  confidence, date range), toggling with the graph canvas. It is also the **accessible equivalent** of
  the canvas (WCAG 2.1 AA) and the surface the global search bar (Feature 01) resolves into.
- **Plan step**: UI-3.5 — *Knowledge Explorer — list/table mode with faceted filters*
  ([ui-backend-plan.md §Knowledge Explorer](../../../ui-backend-plan.md)).
- **Specs/ADRs expanded**: [ui-backend-plan.md §Knowledge Explorer + §Accessibility](../../../ui-backend-plan.md);
  reads the gateway's `entries` listing (Feature 02) over the Query Interface's `listEntries`
  (cursor-paginated, sortable, filterable).

## 2. Summary & scope

The non-visual half of the explorer, and the a11y answer to the graph. It mounts in the shell, fetches
paginated, sorted, filtered entries from the gateway's `entries` resolver, and renders a
keyboard-navigable, screen-reader-friendly table. It fulfils the **search-dispatch contract** the shell
defined in Feature 01 (structured search → a filtered listing). It reuses the **same filter model** as
the canvas so the two modes are consistent.

> **List the port's listings; don't re-query the store.** This mode is a presentation over
> `listEntries` (via the gateway's `entries`, UI-D3): cursor pagination, sort, and `PropertyFilter`s are
> already in the Query Interface. The table maps `EntryConnection` → rows; facets map to
> `entries` args. No client-side full-scan, no second data model.

**In scope**
- A `EntryTable` component over `EntryConnection` (`{items, cursor, hasMore, totalCount}`): columns for
  the base-entry fields (id/name, type, layer, lifecycle, owner, confidence, validFrom) + type-aware
  extras.
- **Cursor pagination** (load-more / pages) honouring `hasMore`/`cursor`; `totalCount` display.
- **Sort** (by the port's `sort` arg) and **client-side group** (by type/layer).
- **Faceted filters**: layer, type, lifecycle status, owner, confidence band, date range — mapped to
  `entries` `filter`/`type` args (server-side) where the port expresses them; client-side for the rest.
- **Row → select** (`selectEntry` → context panel, Feature 06) and **mode toggle** with the canvas
  (shared selection + filter state).
- **Search resolution**: the shell's `onSearch(query)` resolves into a filtered listing here.
- Accessibility: full keyboard nav, ARIA grid semantics, focus management (the canvas's a11y fallback).

**Out of scope**
- The graph canvas (Feature 04 — toggles with this; shares filter/selection state).
- Context-panel content (Feature 06 — this emits the selection).
- Export (Phase 4 — this view is export-shaped but the export *service* is later).
- Semantic/NL search ranking (Phase 4 — Tier-2 unavailable; Phase 3 search is structured).

## 3. Dependencies

- **Upstream**: Feature 01 (shell + search-dispatch contract + tokens), Feature 02 (`entries` resolver
  + SDL types). Shares the filter model with Feature 04.
- **Unblocks**: accessible browsing; search results UI; Feature 06 selection; the Phase 4 export surface.
- **Cross-feature**: fulfils Feature 01's `onSearch`; shares selection/filter state with Feature 04;
  emits `selectEntry` to Feature 06.

## 4. Applied decisions

| Decision | How it constrains this feature |
|---|---|
| **UI-D2** | Renders seeded data via the gateway (Tier 1) or MSW (Tier 3); no fixtures in the component. |
| **UI-D3** | Reads `entries`/`listEntries` only — server-side pagination/sort/filter; no client full-scan, no second model. |
| **NFR a11y (WCAG 2.1 AA)** | This is the accessible equivalent of the canvas — ARIA grid, keyboard nav, screen-reader labels are first-class, not afterthoughts. |
| **NFR search P95 < 500ms** | Lean on the port's cursor pagination + server-side filters; avoid over-fetch. |

## 5. User stories

- *As any persona, I want a sortable, filterable table of entries, so that I can browse the inventory
  precisely without the graph.*
- *As a screen-reader user, I want a fully keyboard-navigable table, so that the explorer is usable
  without the visual canvas.*
- *As any user, I want my search to land in a filtered list, so that I can scan and pick a result.*
- *As an analyst, I want faceted filters (layer/type/lifecycle/owner/confidence/date), so that I can
  narrow to exactly the entries I care about.*

## 6. Acceptance criteria (Given/When/Then)

1. **Shows correct entries** — *Given* a seeded type listing, *when* the table loads, *then* the rows
   match the seed (identity + base fields), with `totalCount` shown (plan TDD: "table shows correct
   entries").
2. **Pagination** — *Given* more entries than a page, *when* load-more/next is invoked, *then* the next
   page loads via the cursor with no duplicates/skips (`hasMore`/`cursor` honoured).
3. **Filters narrow** — *Given* a facet (e.g. type, lifecycle), *when* applied, *then* results narrow
   correctly (plan TDD: "filters narrow results") — server-side via `entries` args where expressible.
4. **Sort works** — *Given* a sortable column, *when* sorted asc/desc, *then* the order matches the
   port's sort (plan TDD: "sort works").
5. **Group** — *Given* group-by type/layer, *then* rows group with correct headers/counts.
6. **Row select** — *Given* a row, *when* activated (click/Enter), *then* `selectEntry(id)` fires
   (Feature 06) and the row shows selected state.
7. **Search resolves here** — *Given* the shell's `onSearch(query)`, *then* the query resolves to a
   filtered listing in this view.
8. **Mode toggle** — *Given* the canvas and table, *when* toggled, *then* selection + filter state are
   shared/consistent across both.
9. **Accessibility** — *Given* the table, *then* it exposes ARIA grid semantics and is fully
   keyboard-operable (automated axe check passes; tab/arrow/Enter work).
10. **CI green** — *Given* component tests under jsdom + MSW, *then* they pass with no backend.

## 7. Interface contracts

```
EntryTable     { connection: EntryConnection, columns: ColumnDef[], facets: FacetState,
                 sort: SortState, onSort, onFilter, onSelect(id), onLoadMore }
FacetState     { layers?: string[]; types?: string[]; lifecycle?: string[]; owners?: string[];
                 confidence?: [number, number]; dateRange?: [string, string] }
// facets → gateway `entries(type, filter, sort, limit, cursor)` args (server-side where expressible)
```

New files (indicative): `apps/knowledge-studio/src/explorer/{EntryTable,facets,useEntries}.tsx`,
`ExplorerView.tsx` (hosts the canvas↔table toggle + shared state), tests alongside.

## 8. TDD test plan (write these first)

- **Rows — `EntryTable.test.tsx`**: seeded connection → correct rows + `totalCount` (1); row select
  emits `selectEntry` (6); a11y/axe + keyboard nav (9).
- **Pagination — `pagination.test.tsx`**: cursor load-more, no dup/skip (2).
- **Facets — `facets.test.ts`**: facet state → correct `entries` args; results narrow (3).
- **Sort/group — `sort-group.test.ts`**: sort order matches the port; grouping headers/counts (4, 5).
- **Search resolution — `search-resolve.test.tsx`**: shell `onSearch` → filtered listing (7).
- **Toggle — `explorer-toggle.test.tsx`**: shared selection/filter across canvas↔table (8).
- **Data mode**: MSW fixtures, no backend (10).

## 9. Task breakdown

1. [ ] `useEntries` hook over the gateway `entries` query (cursor pagination).
2. [ ] `EntryTable`: columns, rows, `totalCount`, row select (emit `selectEntry`), selected state.
3. [ ] Faceted filters mapped to `entries` args (server-side where expressible) + client-side rest.
4. [ ] Sort (port `sort`) + client-side group.
5. [ ] `ExplorerView` hosting the canvas↔table toggle with shared selection/filter state.
6. [ ] Resolve the shell's `onSearch` into a filtered listing.
7. [ ] Accessibility (ARIA grid, keyboard nav) + tests first (rows, pagination, facets, sort/group,
   search, toggle, a11y, MSW).

## 10. OCP extension points

- **Open**: new columns/facets (additive); new group keys; an export action (Phase 4) over the same
  connection; saved views/bookmarks (additive).
- **Closed**: the `entries`/`EntryConnection` contract; the shared `selectEntry` event and filter model
  (Feature 04 shares them). Adding a facet must not change them.

## 11. Open questions / risks

- **Facets the port doesn't express.** `listEntries` takes `type` + `PropertyFilter`s + `sort`; some
  facets (owner, confidence band, date range) may need either added `PropertyFilter` fields or
  client-side narrowing. *Recommendation:* prefer server-side via `PropertyFilter` (extend additively if
  needed); fall back to client-side only for the current page. Confirm which facets are server-side.
- **Type-specific columns.** Base fields are uniform; type-specific columns vary. *Recommendation:*
  default columns = base fields; type-aware extras shown when a single type is filtered (ties to Feature
  02's `data: JSON`/per-type-object question).
- **Group + pagination interaction.** Grouping across pages is ambiguous. *Recommendation:* group within
  the loaded set (client-side); document that grouping is page-scoped until a server-side group lands.
