# 013 — UI Application Shell

## Purpose & Scope

The UI Application Shell provides the foundational structure of the web application: navigation, global search, context panel, breadcrumb trail, and notification centre. It's the container within which all view screens and tools are rendered.

**In scope:**
- Application layout and responsive structure
- Persona-driven navigation
- Global search bar (structured + natural language)
- Context panel (slide-out entity detail)
- Breadcrumb / traversal trail
- Notification centre (real-time events)
- Theme and accessibility infrastructure
- Error boundaries and loading states

**Out of scope:**
- Individual view screen implementations (separate specs per view)
- Knowledge Explorer graph canvas (that's spec 014)
- Administration Console (that's spec 016)
- Backend API interactions (that's the GraphQL layer spec)

---

## Inputs

| Input | Source | Format |
|-------|--------|--------|
| User identity and roles | Auth service (via session) | `UserIdentity` with role-based navigation permissions |
| Navigation configuration | Per-persona config | Menu items, ordering, visibility rules |
| Search queries | User typing in search bar | Text string (natural language or structured syntax) |
| Real-time events | WebSocket subscription | `EntryChangeEvent`, `QualityAlert`, `CorrectionProposed` |
| Route changes | Browser navigation | URL path and query parameters |

---

## Outputs

| Output | Consumer | Format |
|--------|----------|--------|
| Rendered application UI | User (browser) | HTML/CSS/JS |
| Search requests | GraphQL API (via search resolver) | `SearchRequest` |
| Navigation events | Analytics, breadcrumb state | Route transitions |
| User preferences | Local storage / user settings API | Theme, saved views, layout preferences |

---

## Behaviour

### Layout Structure

```
┌──────────────────────────────────────────────────────────────┐
│  Header: Logo │ Search Bar ─────────────────── │ Notifications │ User │
├──────────┬───────────────────────────────────────────────────┤
│          │                                                    │
│  Nav     │                Main Content Area                   │
│  Sidebar │                                                    │
│          │                (View screens render here)          │
│          │                                                    │
│          │                                                    │
│          │                                                    │
│          ├────────────────────────────────────┬───────────────┤
│          │                                    │ Context Panel │
│          │                                    │ (slide-out)   │
│          │                                    │               │
├──────────┴────────────────────────────────────┴───────────────┤
│  Breadcrumb Trail                                             │
└──────────────────────────────────────────────────────────────┘
```

### Persona-Driven Navigation

Each persona sees a tailored primary navigation menu:

| Persona | Primary Menu Items |
|---------|-------------------|
| Domain Architect | Domain Map, Decision Inventory, Capability Inventory, Gap Analysis |
| Compliance Officer | Compliance Matrix, Decision Inventory, Impact Assessment, Regulatory |
| Solution Architect | Vendor Coverage, System Landscape, Dependency Graph, Impact Assessment |
| Developer | Behaviour Flows, System Landscape, Dependency Graph, Search |
| Platform Engineer | Dependency Graph, System Landscape, Impact Assessment |
| Knowledge Admin | Sources, Quality Dashboard, Corrections Queue, Schema Management |
| Executive | Strategic Dashboard, Value Stream Map, North Star Roadmap |

All views remain accessible via search or secondary navigation. The persona determines what's promoted, not what's hidden.

### Global Search Bar

- **Always visible** in the header
- **Auto-suggest** as user types: entity names, types, contexts
- **Dual mode**: 
  - Structured: `type:Decision status:active context:payments`
  - Natural language: "which services handle timeout escalation?"
- **Mode detection**: Automatically detects if input is structured (contains `:` qualifiers) or natural language
- **Recent searches**: Dropdown shows recent queries on focus
- **Keyboard shortcut**: `Cmd/Ctrl + K` focuses the search bar

### Context Panel

- **Triggered by**: Clicking any entity reference anywhere in the UI
- **Slide-out from right**: Does not navigate away from current view
- **Content**: Full entry detail (all attributes, relationships, provenance, quality score)
- **Actions**: Navigate to entity's primary view, see related entities, copy link
- **Stackable**: Opening a related entity from within the panel pushes a stack (back button to previous)
- **Dismissible**: Click outside or press Escape to close

### Breadcrumb Trail

- Tracks the user's traversal path through the graph
- Shows: View → Entity → Related Entity → ...
- Click any breadcrumb to navigate back to that point
- Persists during session; resets on explicit navigation to a new top-level view

### Notification Centre

- **Badge count** on notification icon shows unread count
- **Dropdown panel** shows recent notifications grouped by type
- **Types**: Ingestion complete, correction proposed, quality alert, impact assessment ready
- **Actions**: Click to navigate to relevant view/entity; mark as read; dismiss
- **Real-time**: Powered by WebSocket subscription to relevant events (filtered by user's scope)

### Error Handling

- **Error boundaries**: Each view is wrapped in an error boundary; failure in one view doesn't crash the shell
- **Loading states**: Skeleton screens while data loads; never show blank content areas
- **Offline handling**: Show banner when connection lost; queue actions for retry
- **Error display**: User-friendly error messages with "retry" and "report" actions

---

## Interfaces & Contracts

### Shell Configuration

```typescript
interface ShellConfig {
  personas: PersonaConfig[];
  search: {
    debounceMs: number;                // Default: 300
    minChars: number;                  // Minimum characters before search triggers
    maxSuggestions: number;            // Auto-suggest limit
  };
  notifications: {
    maxVisible: number;                // In dropdown
    pollInterval?: number;             // Fallback if WebSocket unavailable
  };
  contextPanel: {
    width: string;                     // e.g., '400px' or '30%'
    maxStack: number;                  // Maximum stacked panels
  };
}

interface PersonaConfig {
  id: string;
  name: string;
  primaryNavItems: NavItem[];
  defaultView: string;                 // Route to load on login
}

interface NavItem {
  id: string;
  label: string;
  icon: string;
  route: string;
  badge?: () => number;                // Dynamic badge (e.g., correction count)
}
```

### Shell Events (Internal Communication)

```typescript
// Events the shell emits for child views to consume
interface ShellEvents {
  onSearch: (query: string, mode: 'structured' | 'natural') => void;
  onEntitySelect: (entityId: string, openInPanel: boolean) => void;
  onNotification: (event: NotificationEvent) => void;
  onNavigate: (route: string, params?: Record<string, string>) => void;
}

// Events child views emit for the shell to handle
interface ViewToShellEvents {
  requestContextPanel: (entityId: string) => void;
  updateBreadcrumb: (crumb: BreadcrumbItem) => void;
  setPageTitle: (title: string) => void;
}
```

---

## Dependencies

| Depends on | Reason |
|------------|--------|
| Authentication & Authorisation | User identity, persona detection, role-based navigation |
| GraphQL API Layer | Search queries, notifications subscription |
| UI framework (decided in Phase 3) | Rendering infrastructure |

| Depended on by | Reason |
|----------------|--------|
| All view screens | Render within the shell's content area |
| Knowledge Explorer | Uses context panel, search, breadcrumbs |
| Admin Console | Uses shell navigation and layout |

---

## Key Decisions

### Decision 1: UI Framework

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **React** | Largest ecosystem; most graph visualisation libraries (d3, react-force-graph, cytoscape-react); largest talent pool; mature state management (Zustand, Jotai) | Large bundle; JSX not universally loved; requires build tooling choices |
| **Vue 3** | Excellent DX; good performance; composition API; growing ecosystem | Smaller graph visualisation ecosystem; smaller talent pool; fewer enterprise references |
| **Svelte/SvelteKit** | Excellent performance (compiled); small bundles; simple mental model; great DX | Smallest ecosystem; fewest graph libraries; niche talent pool; less battle-tested at scale |
| **Next.js (React meta-framework)** | Full-stack; SSR for initial load; file-based routing; API routes; mature deployment story | More opinionated; server-side complexity we may not need; heavier |

**Recommendation: React (with Vite, not Next.js)**

*Rationale*: The graph visualisation requirement is paramount — React has the richest ecosystem for interactive graph rendering (react-force-graph, Cytoscape.js React bindings, d3-react). The talent pool is largest. We don't need SSR (this is a SPA behind auth, not a public SEO-concerned site). Vite provides fast builds without the complexity of Next.js. The shell and views are client-side rendered with data fetched via GraphQL.

---

### Decision 2: State Management

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **React Query (TanStack Query) for server state + Zustand for client state** | Separation of concerns; React Query handles caching/refetch/optimistic updates; Zustand is minimal for UI state | Two libraries; must decide what goes where |
| **Redux Toolkit** | Single store; time-travel debugging; middleware; well-understood | Boilerplate; overkill for our needs; mixing server and client state |
| **Apollo Client (GraphQL cache)** | Natural fit for GraphQL; normalised cache; reactive; optimistic updates | Ties us to Apollo ecosystem; heavy; cache management can be complex |
| **Relay** | Facebook's GraphQL client; excellent performance; compiler-driven; fragment co-location | Steep learning curve; opinionated; less ecosystem support; requires Relay compiler |

**Recommendation: React Query for server state + Zustand for UI state**

*Rationale*: React Query naturally handles GraphQL data (fetching, caching, refetching, optimistic updates) without tying us to Apollo's ecosystem. Zustand handles UI-only state (panel open/closed, current persona, breadcrumb trail) with minimal boilerplate. The separation is clean: if data comes from the server, React Query owns it; if it's ephemeral UI state, Zustand owns it.

---

### Decision 3: Component Library / Design System

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Build custom (Tailwind + headless components)** | Full control; no design debt; tailored to our needs; lightweight | More effort; must build common patterns; no pre-built complex components |
| **Radix UI + Tailwind** | Accessible headless primitives; full styling control; composable; lightweight | Must style everything; no pre-built layouts; more assembly required |
| **shadcn/ui (Radix + Tailwind, pre-styled)** | Beautiful defaults; copy-paste ownership; accessible; customisable; growing ecosystem | Still requires customisation; may not fit all needs; opinionated styling |
| **Ant Design / Material UI** | Feature-rich; many complex components; data tables; consistent look | Heavy; hard to customise beyond theme; recognisable "Material" look; large bundle |

**Recommendation: shadcn/ui (Radix primitives + Tailwind styling)**

*Rationale*: shadcn/ui gives us accessible, well-tested component primitives (via Radix) with sensible default styling (via Tailwind) that we fully own and can customise. Unlike a traditional component library, the code lives in our repo — no version lock-in. For the data-heavy, dashboard-like nature of our UI, having full control over styling while starting from good defaults is the right balance.

---

## Open Questions

1. **Persona detection**: Should persona be auto-detected from roles, explicitly selected by the user on first login, or switchable at any time?
2. **Keyboard navigation**: Beyond Cmd+K for search, what keyboard shortcuts should be available globally? Should we follow a standard (VS Code-like, Figma-like)?
3. **Offline capability**: Is offline support (PWA) a requirement? Or is this strictly an online application?
