import { useMemo, useState } from "react";
import { CoverageLegend } from "../components/CoverageLegend";
import { type LayoutMode } from "../explorer/encoding";
import { GraphCanvas } from "../explorer/GraphCanvas";
import { applyFilters, type GraphFilters, toCytoscapeElements } from "../explorer/graph-adapter";
import { useExplorerGraph } from "../explorer/useExplorerGraph";
import { cn } from "../lib/cn";
import { useShellStore } from "../store";

type ExplorerMode = "canvas" | "list";

const LAYERS = ["L1", "L2", "L3"] as const;
const LAYOUTS: { value: LayoutMode; label: string }[] = [
  { value: "force", label: "Force" },
  { value: "hierarchical", label: "Hierarchical" },
  { value: "radial", label: "Radial" },
];

/**
 * The Knowledge Explorer host (UI-3.1 shell + UI-3.4 canvas). The canvas reads the gateway's
 * `traverse` via {@link useExplorerGraph} (UI-D3), renders through the `toCytoscapeElements`
 * adapter, and drives layer filters, layout modes, lazy expand and selection → context panel.
 * List/table is UI-3.5 (the accessible equivalent), still a placeholder here.
 */
export function ExplorerScreen() {
  const [mode, setMode] = useState<ExplorerMode>("canvas");
  const [layout, setLayout] = useState<LayoutMode>("force");
  const [activeLayers, setActiveLayers] = useState<string[]>([]);

  const { subgraph, loading, error, expand } = useExplorerGraph();
  const selectEntry = useShellStore((state) => state.selectEntry);
  const selectedEntry = useShellStore((state) => state.selectedEntry);

  const filters: GraphFilters = useMemo(() => ({ layers: activeLayers }), [activeLayers]);
  const visible = useMemo(() => applyFilters(subgraph, filters), [subgraph, filters]);
  const elements = useMemo(() => toCytoscapeElements(visible), [visible]);

  function toggleLayer(layer: string): void {
    setActiveLayers((previous) =>
      previous.includes(layer) ? previous.filter((value) => value !== layer) : [...previous, layer],
    );
  }

  function handleSelect(id: string): void {
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

            <fieldset className="flex items-center gap-3 text-sm">
              <legend className="sr-only">Filter by layer</legend>
              <span aria-hidden="true">Layers</span>
              {LAYERS.map((layer) => (
                <label key={layer} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={activeLayers.includes(layer)}
                    onChange={() => toggleLayer(layer)}
                  />
                  {layer}
                </label>
              ))}
            </fieldset>

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
              onSelect={handleSelect}
            />
          )}
        </>
      ) : (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-muted-foreground">
          List / table mounts here (UI-3.5).
        </div>
      )}
    </section>
  );
}
