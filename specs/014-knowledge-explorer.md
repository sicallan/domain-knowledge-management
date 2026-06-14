# 014 — Knowledge Explorer

## Purpose & Scope

The Knowledge Explorer is the primary discovery and browsing interface for the knowledge graph. It combines an interactive graph canvas (node-link visualisation) with a tabular list view, enabling users to explore entities, relationships, and patterns across all layers of the domain model.

**In scope:**
- Interactive graph canvas (pan, zoom, filter, expand)
- List/table view mode (sort, filter, group)
- Faceted filtering (layer, type, status, owner, confidence, date)
- Lazy graph expansion (load connected nodes on demand)
- Layout modes (force-directed, hierarchical, radial)
- Saved views (personal and shared bookmarks)
- Entity selection → context panel integration

**Out of scope:**
- Specific view screens (Domain Map, Compliance Matrix, etc.) — each is a separate projection
- Graph data querying (delegated to Query Interface)
- Context panel rendering (that's the Application Shell spec)
- Data modification (read-only exploration)

---

## Inputs

| Input | Source | Format |
|-------|--------|--------|
| Initial graph data | GraphQL API (via Query Interface) | Subgraph: nodes + edges |
| Filter selections | User interaction | Facet values |
| Expansion requests | User clicking "expand" on a node | Node ID + direction |
| Layout selection | User UI control | Layout mode enum |
| Saved view configuration | User settings | Filter + layout + viewport state |

---

## Outputs

| Output | Consumer | Format |
|--------|----------|--------|
| Rendered graph visualisation | User (browser) | Interactive SVG/Canvas |
| Rendered table view | User (browser) | Sortable/filterable table |
| Entity selection events | Application Shell (context panel) | Entity ID |
| Navigation requests | Application Shell (routing) | Route + params |

---

## Behaviour

### Graph Canvas

#### Rendering
- Nodes rendered as typed icons/shapes (different shapes per inventory type, different colours per layer)
- Edges rendered as directed lines with relationship type labels
- Node size indicates importance (configurable: by connection count, quality score, or equal)
- Edge thickness indicates strength (number of relationships between same nodes)

#### Interaction
- **Pan**: Click and drag on empty space
- **Zoom**: Scroll wheel or pinch; zoom-to-fit button; zoom-to-selection
- **Select node**: Click → highlight node + connected edges; trigger context panel
- **Multi-select**: Ctrl/Cmd + click or drag-select region
- **Expand node**: Double-click or expand button → load connected nodes from API (lazy loading)
- **Collapse**: Right-click → collapse branch (hide expanded children)
- **Hover**: Show tooltip with node name, type, and key attributes

#### Layout Modes

| Mode | Best For | Algorithm |
|------|----------|-----------|
| **Force-directed** | General exploration; organic clustering | ForceAtlas2 or d3-force |
| **Hierarchical** | Layer visualisation (L0→L1→L2→L3) | Dagre or ELK layered |
| **Radial** | Impact analysis (selected node at centre) | d3 radial tree |
| **Group-by-context** | Bounded context clustering | Force with group constraints |

#### Performance

- **Initial render**: Up to 500 nodes + edges displayed simultaneously
- **Large graphs**: Beyond 500 nodes, apply clustering (group related nodes into a single visual cluster with expansion)
- **Progressive loading**: Start with user's entry point; expand on demand
- **WebGL fallback**: For graphs > 1000 nodes, switch from SVG to WebGL renderer

### Table/List View

- Toggle between graph canvas and table with a single click
- Table columns: Name, Type, Layer, Context, Status, Quality Score, Last Updated
- **Sortable**: Click column header
- **Filterable**: Same faceted filters as graph view
- **Groupable**: Group by type, layer, or context
- **Row click**: Opens context panel (same as node click in graph)
- **Relationship column**: Shows connected entity count; click to see list

### Faceted Filters

Applied in both graph and table modes:

| Facet | Type | Values |
|-------|------|--------|
| Layer | Multi-select | L0, L1, L2, L3 |
| Inventory Type | Multi-select | All registered types |
| Lifecycle Status | Multi-select | draft, active, deprecated, retired |
| Bounded Context | Multi-select | All known contexts |
| Owner/Team | Multi-select | All known owners |
| Quality Score | Range slider | 0.0–1.0 |
| Confidence | Range slider | 0.0–1.0 |
| Date Range | Date picker | Created/updated within range |

Filter state syncs between graph and table views (switching mode preserves active filters).

### Saved Views

Users can save current state (filters + layout + viewport position) as:
- **Personal bookmarks**: Visible only to the user
- **Shared views**: Visible to all users with read access to the relevant scope

Saved view state includes:
- Active filters
- Layout mode
- Viewport position (centre coordinates + zoom level)
- Expanded nodes
- Highlighted/pinned nodes

---

## Interfaces & Contracts

### Explorer Component API

```typescript
interface KnowledgeExplorerProps {
  // Initial data to display (optional — can start empty and load via search)
  initialNodes?: GraphNode[];
  initialEdges?: GraphEdge[];
  
  // Configuration
  config: ExplorerConfig;
  
  // Callbacks
  onNodeSelect: (nodeId: string) => void;
  onNodeExpand: (nodeId: string, direction: 'out' | 'in' | 'both') => void;
  onFilterChange: (filters: FacetFilters) => void;
  onNavigate: (route: string) => void;
}

interface ExplorerConfig {
  defaultLayout: LayoutMode;
  defaultMode: 'graph' | 'table';
  maxVisibleNodes: number;             // Before clustering kicks in
  nodeRenderers: Record<InventoryType, NodeRenderer>;
  edgeRenderers: Record<string, EdgeRenderer>;
}

interface GraphNode {
  id: string;
  type: InventoryType;
  layer: string;
  label: string;
  attributes: Record<string, unknown>;
  qualityScore?: number;
  expanded: boolean;
  position?: { x: number; y: number }; // For persistent layout
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string;
  weight?: number;
}

type LayoutMode = 'force-directed' | 'hierarchical' | 'radial' | 'group-by-context';
```

### Data Loading Pattern

```typescript
// The explorer requests data through a data provider
interface ExplorerDataProvider {
  // Load initial graph for a scope
  loadInitialGraph(scope: ExplorerScope): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>;
  
  // Expand a node (load its neighbours)
  expandNode(nodeId: string, direction: 'out' | 'in' | 'both', edgeTypes?: string[]): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>;
  
  // Apply filters (re-query with new filters)
  applyFilters(filters: FacetFilters): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>;
  
  // Search within current scope
  search(query: string): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>;
  
  // Get facet counts (for filter badges)
  getFacetCounts(currentFilters: FacetFilters): Promise<FacetCounts>;
}
```

---

## Dependencies

| Depends on | Reason |
|------------|--------|
| GraphQL API Layer | Data loading (nodes, edges, facets) |
| UI Application Shell | Container layout, context panel, search integration |
| Graph visualisation library (see Key Decisions) | Rendering engine |

| Depended on by | Reason |
|----------------|--------|
| All view screens (as embedded component) | Some views embed a graph canvas |
| Context panel | Receives entity selection events |
| Saved views system | Persists explorer state |

---

## Key Decisions

### Decision 1: Graph Visualisation Library

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Cytoscape.js** | Mature; excellent layout algorithms; React bindings exist; handles large graphs; extensible styling | Canvas-based (less accessible); styling API is custom (not CSS); heavy bundle |
| **react-force-graph (2D/3D)** | React-native; uses d3-force; simple API; WebGL for 3D; good for large graphs | Limited layout algorithms (force-only by default); customisation requires low-level d3 knowledge |
| **vis-network** | Feature-rich; good interactions out of box; hierarchical layout | Aging codebase; less React-friendly; bundle size; fewer maintained updates |
| **Sigma.js + graphology** | WebGL rendering (very performant); React bindings (@react-sigma); good for 10K+ nodes | Less layout variety; relatively new React support; smaller community |
| **D3 (custom)** | Maximum control; any layout algorithm; SVG (accessible); huge ecosystem | Significant development effort; must build interaction layer; not a graph library per se |

**Recommendation: Cytoscape.js with React wrapper**

*Rationale*: Cytoscape provides the layout algorithm variety we need (force-directed, hierarchical, radial, group) out of the box. It handles the interaction complexity (pan, zoom, select, expand) that would take months to build with raw D3. Its extension system allows custom node/edge rendering. Performance is adequate for our expected graph sizes (hundreds of visible nodes). The React wrapper (react-cytoscapejs) integrates cleanly with our React stack.

---

### Decision 2: Large Graph Handling

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Hard limit (reject graphs > N nodes)** | Simple; predictable performance; no complex logic | Poor UX for large graphs; users can't explore freely; arbitrary limitation |
| **Clustering (auto-group when threshold exceeded)** | Preserves overview; users can drill into clusters; scalable | Clustering algorithm choice; may hide important nodes; adds complexity |
| **Server-side aggregation (send summary, expand on demand)** | Client always fast; server handles scale; progressive disclosure | Requires server support; initial view is lossy; must design aggregation rules |
| **LOD (level of detail — show more as user zooms)** | Natural metaphor; scalable; good UX | Complex to implement; must define detail levels per zoom; may be jarring |

**Recommendation: Progressive loading with clustering fallback**

*Rationale*: The primary interaction pattern is "start somewhere, expand outward." Progressive loading (show initial scope, expand on demand) naturally limits what's on screen. If a user's filters result in > 500 nodes, apply type-based clustering (group all Services in a context into one cluster node). This keeps the canvas usable while allowing access to the full graph. Server-side aggregation supports this via the `ExplorerDataProvider.applyFilters` which can return clustered results.

---

### Decision 3: Graph ↔ Table Mode Relationship

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Fully independent (different data views)** | Each mode optimised independently; table can show all entries, graph shows subset | Filter state can diverge; confusing; "where did that node go?" when switching |
| **Synchronised (same data, different representation)** | Consistent; switching modes preserves selection and filters; WYSIWYG | Table may be constrained by what's loaded in graph; or graph must load everything table shows |
| **Table as index, graph as focused view** | Table shows all matching entries; selecting rows in table focuses graph on those; complementary | More complex UX; two panels needed; must explain the relationship |

**Recommendation: Synchronised (same data, same filters, different rendering)**

*Rationale*: The graph and table show the same filtered dataset. Switching between them preserves all state (filters, selection, scroll position / viewport). If 50 nodes are visible in the graph, the table shows those same 50 entries. This avoids confusion and makes the toggle a pure presentation choice. The data provider is the single source for both views.

---

## Open Questions

1. **Accessibility**: How do we make the graph canvas accessible to screen readers? Is the table view sufficient as the accessible alternative, or do we need ARIA descriptions of graph structure?
2. **Graph persistence**: Should node positions be saved (so returning to the same view shows the same layout)? Force-directed layouts are non-deterministic.
3. **Collaborative features**: Should multiple users see each other's exploration paths in real-time (shared cursors)? Or is this strictly single-user?
