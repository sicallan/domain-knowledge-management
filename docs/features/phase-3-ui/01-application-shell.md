# Feature 01 — Application Shell

## 1. Feature

- **Name**: The **Knowledge Studio** application shell — the React + Vite + TS scaffold of
  `apps/knowledge-studio` and the persistent frame every later screen mounts in: navigation, an
  always-present global search bar, a context-panel slot, breadcrumb/trail, and a notification centre,
  on a shadcn/Radix/Tailwind foundation.
- **Plan step**: UI-3.1 — *Application shell: navigation, search bar, breadcrumb, notification centre*
  ([ui-backend-plan.md §Application Shell](../../../ui-backend-plan.md)).
- **Specs/ADRs expanded**: [ui-backend-plan.md §Application Shell + §Screen Structure](../../../ui-backend-plan.md);
  [ADR-0004](../../adr/0004-ui-framework.md) (React+Vite+TS), [ADR-0007](../../adr/0007-component-library.md)
  (shadcn/Radix/Tailwind), [ADR-0005](../../adr/0005-graph-visualisation-library.md) (the canvas mounts
  inside this shell later). Pins the secondary client stack (UI-D7).

## 2. Summary & scope

The first running app. It delivers no data screen of its own — it is the **frame**: routing, the
persona-driven nav, the global search affordance, the slide-out context-panel slot, the breadcrumb, and
the notification centre, plus the design-system foundation (Tailwind config, shadcn init, design tokens
incl. the coverage RAG palette shared with the data track's Markdown matrices). It is the host into
which UI-3.4 (canvas), UI-3.5 (list), and UI-3.6 (context panel) plug.

> **Scaffold, don't invent a data model.** This feature adds **no inventory type, relationship, or
> domain logic** (UI-D3). It renders structure and routes; data arrives later via the GraphQL gateway
> (Feature 02). The shell consumes the **generated SDL types** (UI-3.2) for any typed prop, never a
> hand-kept duplicate of the domain model. Keep the domain core untouched — this is presentation only.

**In scope**
- `apps/knowledge-studio`: Vite + React + TS app, added to `pnpm-workspace.yaml` (`apps/*` — UI-D6).
- shadcn/ui init: Tailwind config, Radix primitives, design tokens (spacing, colour incl. RAG palette),
  light/dark scaffold.
- **Shell components**: `AppLayout` (nav rail + header + content outlet), `NavMenu` (persona-driven),
  `SearchBar` (always-present; dispatches a structured search action — wired to data in UI-3.5),
  `ContextPanelSlot` (slide-out region, populated by UI-3.6), `Breadcrumb`, `NotificationCentre`
  (event list scaffold; live events are Phase 5).
- **Routing** (UI-D7): routes for the explorer (canvas/list), and placeholders for the main-plan view
  screens; a 404/empty state.
- A **dev entry** (`pnpm --filter @dkm/knowledge-studio dev`) that boots the shell; against the gateway
  (Feature 02) it shows real data, standalone it shows MSW fixtures (UI-D2 Tier 3).

**Out of scope**
- The GraphQL gateway (Feature 02) — this consumes it; it is not built here.
- The graph canvas (UI-3.4), list/table (UI-3.5), context-panel *content* (UI-3.6) — only their slots.
- Real-time notification delivery (Phase 5 — WebSocket); the centre is a static list scaffold now.
- Auth UI (Feature 03 — login/profile); the shell renders a user slot the auth feature fills.

## 3. Dependencies

- **Upstream**: the ratified ADRs (0004/0005/0007); `pnpm-workspace.yaml` extension (UI-D6). No data
  dependency — the shell renders standalone (MSW) before the gateway exists.
- **Unblocks**: every other UI feature mounts in this shell. UI-3.2 is parallel (no UI dependency).
- **Cross-feature**: owns the routing table, the search-dispatch contract (UI-3.5 fulfils it), the
  context-panel slot (UI-3.6 fills it), and the design tokens (canvas/list reuse the RAG palette).

## 4. Applied decisions

| Decision | How it constrains this feature |
|---|---|
| **UI-D1 / ADR-0004, 0007** | React+Vite+TS; shadcn/Radix/Tailwind — no other UI framework or component runtime. |
| **UI-D2** | Standalone dev runs over MSW fixtures (Tier 3); against the gateway, real data. No fixtures hand-rolled in components. |
| **UI-D3** | Shell is presentation only — no graph adapter, no domain model; consumes generated SDL types. |
| **UI-D6** | `apps/knowledge-studio` is a workspace package; depends on `@dkm/*` only through public entrypoints. |
| **UI-D7** | Router/state/GraphQL-client choices are **pinned here** (recommendation: React Router/TanStack Router, urql, Zustand/Context). |
| **NFR a11y (WCAG 2.1 AA)** | Radix primitives give keyboard/focus/ARIA correctness; nav and search are keyboard-navigable from day one. |

## 5. User stories

- *As any persona, I want a consistent nav and an always-present search bar, so that I can reach any
  view or entity from anywhere.*
- *As a domain architect, I want a slide-out context panel, so that I can inspect an entity without
  losing my place in the current view.*
- *As any user, I want a breadcrumb of my traversal, so that I can backtrack through the graph.*
- *As a maintainer, I want the shell to be presentation-only over generated SDL types, so that the
  domain core stays framework-agnostic and the UI can't drift from the contract.*

## 6. Acceptance criteria (Given/When/Then)

1. **App boots** — *Given* `apps/knowledge-studio`, *when* `pnpm --filter @dkm/knowledge-studio dev`
   runs, *then* the shell renders (nav, header, search bar, content outlet) with no console errors.
2. **Routes resolve** — *Given* the router, *when* navigating to each defined route (explorer, view
   placeholders, 404), *then* the correct screen/placeholder renders and the nav reflects the active
   route.
3. **Search dispatches** — *Given* the search bar, *when* the user types and submits, *then* a
   structured search action is dispatched with the query (the handler is stubbed/MSW-backed here;
   UI-3.5 fulfils it) — asserted via the dispatched action/handler call.
4. **Context panel slot toggles** — *Given* the shell, *when* a `selectEntry` event fires, *then* the
   context-panel slot opens and is dismissable by keyboard (Esc) and click-away (content is UI-3.6).
5. **Design tokens present** — *Given* the Tailwind/shadcn config, *then* the RAG coverage palette and
   base tokens are defined and used by a sample component (shared with the data-track matrices).
6. **Accessibility baseline** — *Given* the shell, *then* nav and search are reachable and operable by
   keyboard, with ARIA roles on landmarks (automated axe check passes for the shell).
7. **Standalone + gateway modes** — *Given* no gateway, *when* dev runs with MSW enabled, *then* the
   shell renders against fixtures; *given* the gateway, *then* the same shell renders against live data
   (no component change — UI-D2).
8. **Workspace wiring** — *Given* `pnpm-workspace.yaml`, *then* it includes `apps/*` and
   `@dkm/knowledge-studio` resolves `@dkm/*` packages; `pnpm install` + `pnpm --filter @dkm/knowledge-studio test`
   are green in CI with no live service (UI-D5).

## 7. Interface contracts

Component responsibilities (props typed from generated SDL types where they carry domain data):

```
AppLayout            { children }                       // nav rail + header + content outlet + panel slot
NavMenu              { persona?, activeRoute }           // persona-driven primary nav
SearchBar            { onSearch(query: string): void }   // always-present; dispatches structured search
ContextPanelSlot     { open: boolean, onClose(): void }  // slide-out region; content injected by UI-3.6
Breadcrumb           { trail: { id, label, href }[] }     // traversal path
NotificationCentre   { items: NotificationItem[] }        // static scaffold; live = Phase 5
```

New files (indicative):

```
apps/knowledge-studio/
  package.json  vite.config.ts  tsconfig.json  tailwind.config.ts  index.html
  src/main.tsx  src/App.tsx  src/router.tsx
  src/shell/{AppLayout,NavMenu,SearchBar,ContextPanelSlot,Breadcrumb,NotificationCentre}.tsx
  src/lib/graphql-client.ts          # urql/typed client (UI-D7); endpoint from env
  src/mocks/{browser.ts,handlers.ts} # MSW (UI-D2 Tier 3), SDL-validated
  src/styles/tokens.css
pnpm-workspace.yaml                  # + "apps/*"
```

## 8. TDD test plan (write these first)

- **Render — `AppLayout.test.tsx`**: shell renders landmarks + search bar (criterion 1); axe baseline
  (6).
- **Routing — `router.test.tsx`**: each route resolves to the right screen/placeholder; active-state
  reflects route (2).
- **Search — `SearchBar.test.tsx`**: typing + submit dispatches the structured search action with the
  query string (3).
- **Context panel — `ContextPanelSlot.test.tsx`**: opens on `selectEntry`, closes on Esc/click-away (4).
- **Tokens — `tokens.test.ts`/snapshot**: RAG palette + base tokens defined and applied (5).
- **MSW vs live — `shell-data-mode.test.tsx`**: same component tree renders under MSW fixtures and
  (mocked) live client without change (7).
- **Workspace — CI**: `pnpm install` + filtered test/build green, no service (8).

## 9. Task breakdown

1. [ ] Add `apps/*` to `pnpm-workspace.yaml`; scaffold `apps/knowledge-studio` (Vite+React+TS).
2. [ ] Init Tailwind + shadcn; define design tokens incl. RAG palette.
3. [ ] Pin the secondary client stack (UI-D7): router, GraphQL client (urql), client state.
4. [ ] Build shell components (`AppLayout`/`NavMenu`/`SearchBar`/`ContextPanelSlot`/`Breadcrumb`/`NotificationCentre`).
5. [ ] Wire the router + route placeholders for the view screens.
6. [ ] Set up MSW (Tier 3) with SDL-validated handlers + the dev/live mode switch.
7. [ ] Tests first (render, routing, search dispatch, panel toggle, tokens, a11y, workspace CI).

## 10. OCP extension points

- **Open**: new routes/screens registered in the router; new nav entries per persona; additional
  shell regions; new notification item types; alternate themes via tokens.
- **Closed**: the shell component contracts (`onSearch`, panel slot, breadcrumb trail shape) and the
  generated-SDL type source. Adding a screen must not modify the shell's public props.

## 11. Open questions / risks

- **Router choice** (UI-D7) — React Router vs TanStack Router. *Recommendation:* React Router (mature,
  ubiquitous) unless type-safe route params are wanted early (TanStack). Confirm and record in this doc.
- **GraphQL client** (UI-D7) — *Recommendation:* **urql** (light, good React story, SSR-agnostic) over
  Apollo Client (heavier). TanStack Query + `graphql-request` is the minimal alternative. Confirm.
- **Persona model depth** — the plan lists seven personas. *Recommendation:* Phase 3 ships a single
  default nav with a persona *switcher* stub; per-persona tailoring is additive later. Risk: over-
  building persona logic now. Keep it a thin filter over one route set.
- **MSW maintenance** — Tier 3 fixtures must stay SDL-valid. *Mitigation:* generate handler types from
  the SDL (cross-cutting Q in the README) so MSW can't drift.
