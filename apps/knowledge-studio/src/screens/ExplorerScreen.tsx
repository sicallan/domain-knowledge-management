import { useEffect, useMemo, useState } from "react";
import { CoverageLegend } from "../components/CoverageLegend";
import { type LayoutMode } from "../explorer/encoding";
import { ExplorerList } from "../explorer/ExplorerList";
import { Facets } from "../explorer/Facets";
import { type FacetState, type SortState } from "../explorer/facets";
import { GraphCanvas } from "../explorer/GraphCanvas";
import { applyFilters, type GraphFilters, toCytoscapeElements } from "../explorer/graph-adapter";
import { useExplorerGraph } from "../explorer/useExplorerGraph";
import { cn } from "../lib/cn";
import { useShellStore } from "../store";

type ExplorerMode = "canvas" | "list";

const LAYOUTS: { value: LayoutMode; label: string }[] = [
  { value: "force", label: "Force" },
  { value: "hierarchical", label: "Hierarchical" },
  { value: "radial", label: "Radial" },
];

/**
 * The Knowledge Explorer host (UI-3.1 shell + UI-3.4 canvas + UI-3.5 list/table). It owns the
 * **shared** filter (`facets`) and selection state both modes read, and toggles between the
 * Cytoscape canvas and the accessible {@link ExplorerList}. The canvas reads `traverse` via
 * {@link useExplorerGraph}; the list reads `entries` via `useEntries` — both over the gateway
 * (UI-D3). Selection flows through the store's `selectEntry`, so a row and a node select the
 * same entry (criterion 8). The shell's search resolves into the list (criterion 7).
 */
export function ExplorerScreen() {
  const [mode, setMode] = useState<ExplorerMode>("canvas");
  const [layout, setLayout] = useState<LayoutMode>("force");
  const [facets, setFacets] = useState<FacetState>({});
  const [sort, setSort] = useState<SortState | null>(null);
  const [groupBy, setGroupBy] = useState<"type" | "layer" | null>(null);

  const { subgraph, loading, error, expand } = useExplorerGraph();
  const selectEntry = useShellStore((state) => state.selectEntry);
  const selectedEntry = useShellStore((state) => state.selectedEntry);
  const lastSearch = useShellStore((state) => state.lastSearch);

  // The shell's structured search resolves into a filtered listing here (criterion 7).
  useEffect(() => {
    if (lastSearch) setMode("list");
  }, [lastSearch]);

  const filters: GraphFilters = useMemo(
    () => ({ layers: facets.layers, types: facets.types }),
    [facets.layers, facets.types],
  );
  const visible = useMemo(() => applyFilters(subgraph, filters), [subgraph, filters]);
  const elements = useMemo(() => toCytoscapeElements(visible), [visible]);

  function toggleSort(field: string): void {
    setSort((previous) =>
      previous?.field === field
        ? { field, direction: previous.direction === "asc" ? "desc" : "asc" }
        : { field, direction: "asc" },
    );
  }

  function handleCanvasSelect(id: string): void {
    const node = subgraph.nodes.find((candidate) => candidate.id === id);
    selectEntry({ id, type: node?.type, label: node?.label });
  }

  return (
    <section aria-labelledby="explorer-heading" className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="explorer-heading" className="text-xl font-semibold">
          Knowledge Explorer
        </h1>
        <div role="group" aria-label="Explorer view mode" className="flex gap-1">
          {(["canvas", "list"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm capitalize",
                mode === value ? "bg-primary text-primary-foreground" : "border border-border",
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      {/* Shared faceted filters — the same model both modes read (criterion 8). */}
      <Facets facets={facets} onChange={setFacets} />

      {mode === "canvas" ? (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <span>Layout</span>
              <select
                value={layout}
                onChange={(event) => setLayout(event.target.value as LayoutMode)}
                className="rounded-md border border-border bg-background px-2 py-1"
              >
                {LAYOUTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <CoverageLegend />
          </div>

          <p className="text-sm text-muted-foreground" role="status">
            {loading
              ? "Loading the graph…"
              : `Showing ${visible.nodes.length} nodes, ${visible.edges.length} edges`}
            {selectedEntry && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => void expand(selectedEntry.id)}
                  className="text-primary underline"
                >
                  Expand “{selectedEntry.label ?? selectedEntry.id}”
                </button>
              </>
            )}
          </p>

          {subgraph.truncated && (
            <p role="alert" className="text-sm text-coverage-partial">
              Some branches were truncated by the depth cap — select a node and expand to load more.
            </p>
          )}

          {error ? (
            <p role="alert" className="rounded-md border border-coverage-uncovered p-3 text-sm">
              Could not load the graph: {error}
            </p>
          ) : (
            <GraphCanvas
              elements={elements}
              layout={layout}
              selectedId={selectedEntry?.id ?? null}
              onSelect={handleCanvasSelect}
            />
          )}
        </>
      ) : (
        <ExplorerList
          facets={facets}
          sort={sort}
          onSort={toggleSort}
          groupBy={groupBy}
          onGroupBy={setGroupBy}
          query={lastSearch ?? undefined}
          onSelectEntry={selectEntry}
          selectedId={selectedEntry?.id ?? null}
        />
      )}
    </section>
  );
}
