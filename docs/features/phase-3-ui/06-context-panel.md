# Feature 06 — Context Panel

## 1. Feature

- **Name**: The **Context Panel** — the slide-out detail view that shows a selected inventory entry's
  full detail, its relationships, and its evidence/provenance, from anywhere (canvas, list, search),
  without leaving the current view. Closes the explore→inspect loop.
- **Plan step**: UI-3.6 — *Context panel: display full entry detail on selection*
  ([ui-backend-plan.md §Application Shell + §Knowledge Explorer](../../../ui-backend-plan.md)).
- **Specs/ADRs expanded**: [ui-backend-plan.md §Context Panel](../../../ui-backend-plan.md); fills the
  context-panel **slot** the shell (Feature 01) exposes; reads the gateway's `entry` + `traverse`
  (Feature 02) over the Query Interface.

## 2. Summary & scope

The inspect surface. It listens for the `selectEntry(id)` event that the canvas (Feature 04), the table
(Feature 05), and search emit, fetches the entry (`entry(id)`) and its immediate relationships
(`traverse` depth 1), and renders full detail — base-entry metadata, type-specific fields, the
relationship list (each navigable, feeding the breadcrumb), and the **evidence/provenance** (every
asserted fact is evidenced + versioned, per the platform's core rule). It populates the slot the shell
already owns; it does not own the slide-out chrome.

> **Render one entry from the port; don't refetch the world.** The panel reads `entry(id)` +
> `traverse(id, depth 1)` (UI-D3) — the entry and its neighbours, nothing more. Relationship clicks emit
> a new `selectEntry`/navigation event (reusing the canvas/list machinery), not a bespoke fetch path.
> Evidence/provenance comes from the entry's own `evidencedBy` — already on every `InventoryEntry`.

**In scope**
- A `ContextPanel` component mounted in the shell's `ContextPanelSlot`, opening on `selectEntry(id)`.
- **Entry detail**: base-entry fields (id, type, version, lifecycle, validFrom/validTo, confidence) +
  type-specific fields; readable, labelled, British-spelling domain terms preserved.
- **Relationships**: incoming/outgoing edges (from `traverse` depth 1), grouped by relationship type,
  each row navigable (emits selection → updates the panel + breadcrumb).
- **Evidence/provenance**: the entry's `evidencedBy` list (source, fetchedAt, authority) — the "the
  document is the evidence; the entry is the assertion" rule made visible.
- **Confidence + lifecycle** surfaced as user-friendly indicators (ties to D-P1.5's two-tier model).
- Open/close (Esc, click-away, explicit close), focus management, and deep-link-ability (panel state in
  the URL so a selection is shareable).

**Out of scope**
- The slide-out chrome/slot (Feature 01 owns it; this fills it).
- Editing/mutation (read-only in Phase 3; corrections workflow is Phase 5).
- The temporal "state at time"/diff view (Tier-2 unavailable — `getStateAtTime`/`getDiff` deferred).
- Bulk/multi-select inspection (single-entry focus in Phase 3).

## 3. Dependencies

- **Upstream**: Feature 01 (the slot + breadcrumb), Feature 02 (`entry` + `traverse` resolvers + SDL
  types), Features 04/05 (emit `selectEntry`).
- **Unblocks**: the full explore→inspect→navigate loop; the breadcrumb trail; later, the corrections UI
  (Phase 5) and provenance drill-down.
- **Cross-feature**: consumes the shared `selectEntry` event; writes the breadcrumb trail (Feature 01).

## 4. Applied decisions

| Decision | How it constrains this feature |
|---|---|
| **UI-D2** | Reads seeded data via the gateway (Tier 1) or MSW (Tier 3); no fixtures in the component. |
| **UI-D3** | `entry` + `traverse` only — no graph adapter, no second model; relationship nav reuses the selection event. |
| **Core rule — evidence + versioned** | Every shown fact links to its `evidencedBy` provenance and shows lifecycle/validity. |
| **D-P1.5 — two-tier quality** | `confidence`/lifecycle shown as user-friendly indicators (high/medium/low + review state). |
| **NFR a11y** | Panel is keyboard-operable (Esc, focus trap while open, restore focus on close). |

## 5. User stories

- *As any persona, I want a slide-out detail panel on selection, so that I can inspect an entry without
  losing my place.*
- *As a domain architect, I want the entry's relationships listed and navigable, so that I can hop along
  the graph and see my trail.*
- *As a compliance officer, I want every shown fact linked to its evidence/source, so that I can trust
  and trace the assertion.*
- *As any user, I want a selection to be deep-linkable, so that I can share exactly what I'm looking at.*

## 6. Acceptance criteria (Given/When/Then)

1. **Shows correct detail** — *Given* a seeded entry, *when* `selectEntry(id)` fires, *then* the panel
   opens and shows that entry's base + type-specific fields correctly (plan TDD: "panel shows correct
   data for selected entry").
2. **Lists relationships** — *Given* an entry with edges, *then* the panel lists its incoming/outgoing
   relationships grouped by type (plan TDD: "relationships listed"), from `traverse` depth 1.
3. **Relationship navigation** — *Given* a listed relationship, *when* a target is activated, *then* a
   `selectEntry` fires for the target, the panel updates, and the breadcrumb appends the hop.
4. **Evidence/provenance** — *Given* an entry, *then* its `evidencedBy` entries (source, fetchedAt,
   authority) are shown.
5. **Confidence/lifecycle** — *Given* an entry, *then* confidence + lifecycle are shown as user-friendly
   indicators (not raw enums alone).
6. **Open/close + focus** — *Given* the panel open, *when* Esc/click-away/close, *then* it closes and
   focus is restored; while open, focus is trapped (a11y).
7. **Deep link** — *Given* a selection, *then* the panel state is reflected in the URL and re-opens on
   load of that URL.
8. **Unknown id** — *Given* `selectEntry` for a missing id (`entry` returns `null`), *then* the panel
   shows an empty/"not found" state, not an error.
9. **CI green** — *Given* component tests under jsdom + MSW, *then* they pass with no backend.

## 7. Interface contracts

```
ContextPanel   { entryId: string | null, onNavigate(id): void, onClose(): void }
// reads gateway entry(id): InventoryEntry  +  traverse(id, depth 1, includeEdges): Subgraph
// renders: EntryDetail (base + type-specific) · RelationshipList (grouped, navigable) · EvidenceList
```

New files (indicative): `apps/knowledge-studio/src/context-panel/{ContextPanel,EntryDetail,RelationshipList,EvidenceList}.tsx`,
`useEntry.ts` (gateway `entry`+`traverse` hook), tests alongside.

## 8. TDD test plan (write these first)

- **Detail — `ContextPanel.test.tsx`**: select → correct base + type-specific fields (1); confidence/
  lifecycle indicators (5); unknown id → empty state (8); open/close + focus restore/trap (6).
- **Relationships — `RelationshipList.test.tsx`**: grouped incoming/outgoing from `traverse` (2);
  activating a target emits `selectEntry` + appends breadcrumb (3).
- **Evidence — `EvidenceList.test.tsx`**: `evidencedBy` rendered (source/fetchedAt/authority) (4).
- **Deep link — `deeplink.test.tsx`**: selection ↔ URL round-trip (7).
- **Data mode**: MSW fixtures, no backend (9).

## 9. Task breakdown

1. [ ] `useEntry` hook over gateway `entry(id)` + `traverse(id, depth 1)`.
2. [ ] `EntryDetail` (base + type-specific fields, British-spelling labels, confidence/lifecycle indicators).
3. [ ] `RelationshipList` (grouped, navigable → emit `selectEntry` + breadcrumb hop).
4. [ ] `EvidenceList` (provenance from `evidencedBy`).
5. [ ] `ContextPanel` mounting in the shell slot: open/close, focus management, empty/not-found state.
6. [ ] Deep-link the selection in the URL.
7. [ ] Tests first (detail, relationships, navigation, evidence, deep link, focus, MSW).

## 10. OCP extension points

- **Open**: type-specific detail renderers (registered per inventory type); additional metadata
  sections; a provenance drill-down; later, inline corrections (Phase 5) and a temporal view when
  `getStateAtTime`/`getDiff` land.
- **Closed**: the `entry`/`traverse` contract; the `selectEntry`/navigation event; the panel's slot
  contract with the shell. Adding a type renderer must not change them.

## 11. Open questions / risks

- **Type-specific rendering.** Each inventory type has distinct fields. *Recommendation:* a
  **registry of per-type detail renderers** with a generic fallback (base fields + `data` dump) — open
  for new types (OCP), ties to Feature 02's `data: JSON`/per-type-object decision.
- **Relationship volume.** A hub node may have many edges. *Recommendation:* `traverse` depth 1 with
  the port's depth-cap; group + lazily expand per relationship type; for very high degree, paginate the
  relationship list (reuse the listing pattern).
- **Deep-link scope.** *Recommendation:* encode `selectedEntryId` (+ explorer mode/filters) in the URL
  so a shared link restores the full inspect context; keep it to ids, not full state blobs.
