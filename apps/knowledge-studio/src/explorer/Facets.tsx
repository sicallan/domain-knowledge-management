import { BROWSABLE_TYPES, type FacetState } from "./facets";

export interface FacetsProps {
  facets: FacetState;
  onChange: (facets: FacetState) => void;
}

const LAYERS = ["L1", "L2", "L3"] as const;
const LIFECYCLES = ["active", "draft", "deprecated", "retired"] as const;

function toggle(values: string[] | undefined, value: string): string[] {
  const set = new Set(values ?? []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return [...set];
}

/**
 * The shared faceted-filter controls (UI-3.5 §6) — layer, type and lifecycle multi-selects
 * driving the {@link FacetState} both the table ({@link useEntries}) and the canvas read. It
 * owns no data: it edits the facet model and emits it (criterion 8 — the same state both
 * modes share). Server-expressible facets (type, single-valued lifecycle) become `entries`
 * args; the rest narrow client-side. New facets are additive (OCP-open).
 */
export function Facets({ facets, onChange }: FacetsProps) {
  return (
    <div className="flex flex-wrap items-start gap-6" role="group" aria-label="Filter entries">
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="font-medium">Layer</legend>
        <div className="flex gap-3">
          {LAYERS.map((layer) => (
            <label key={layer} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={facets.layers?.includes(layer) ?? false}
                onChange={() => onChange({ ...facets, layers: toggle(facets.layers, layer) })}
              />
              {layer}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="font-medium">Lifecycle</legend>
        <div className="flex flex-wrap gap-3">
          {LIFECYCLES.map((status) => (
            <label key={status} className="flex items-center gap-1 capitalize">
              <input
                type="checkbox"
                checked={facets.lifecycle?.includes(status) ?? false}
                onChange={() => onChange({ ...facets, lifecycle: toggle(facets.lifecycle, status) })}
              />
              {status}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Type</span>
        <select
          aria-label="Filter by inventory type"
          value={facets.types?.[0] ?? ""}
          onChange={(event) =>
            onChange({ ...facets, types: event.target.value ? [event.target.value] : undefined })
          }
          className="rounded-md border border-border bg-background px-2 py-1"
        >
          <option value="">All types</option>
          {BROWSABLE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
