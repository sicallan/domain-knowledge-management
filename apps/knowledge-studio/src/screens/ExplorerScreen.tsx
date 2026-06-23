import { useState } from "react";
import { CoverageLegend } from "../components/CoverageLegend";
import { cn } from "../lib/cn";

type ExplorerMode = "canvas" | "list";

/**
 * The Knowledge Explorer host (UI-3.1). It owns the canvas/list **toggle** and mounts the
 * placeholders the later steps fill: the Cytoscape graph canvas (UI-3.4) and the
 * accessible list/table (UI-3.5). No data here — those steps wire `traverse`/`listEntries`.
 */
export function ExplorerScreen() {
  const [mode, setMode] = useState<ExplorerMode>("canvas");

  return (
    <section aria-labelledby="explorer-heading" className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
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

      <CoverageLegend />

      {mode === "canvas" ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-muted-foreground">
          Graph canvas mounts here (UI-3.4).
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-muted-foreground">
          List / table mounts here (UI-3.5).
        </div>
      )}
    </section>
  );
}
