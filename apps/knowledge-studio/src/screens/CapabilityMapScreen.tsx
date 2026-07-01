import { useEffect, useState } from "react";
import {
  BusinessArchitecture,
  type BusinessArchitectureMode,
} from "../business-architecture/BusinessArchitecture";
import { useBusinessArchitecture } from "../business-architecture/useBusinessArchitecture";
import { CapabilityMap } from "../capability-map/CapabilityMap";
import { useCapabilityMap } from "../capability-map/useCapabilityMap";

type Lens = "raw" | "ea";

/**
 * The Capability Map screen — two lenses on the ingested domain's capabilities, toggled in place
 * (Feature 08, #86 — ADR-0009):
 *
 * - **Raw hierarchy** — the extracted BusinessCapability tree as-is (`level` / `parentCapability`),
 *   a deterministic projection of structure already in the graph (ADR-0008). Faithful, but on a real
 *   corpus it is 200+ near-synonym roots with implementation detail promoted to the top.
 * - **Normalised EA model** — the same capabilities classified into a curated BIZBOK/APQC reference
 *   spine (domain → capability → function / activity), with implementation detail and generic
 *   mentions explicitly *rejected* rather than shown as top-level capabilities. New, evidenced,
 *   correctable judgment (the classification pass) projected as a tree.
 *
 * The before/after juxtaposition on identical data is the platform's value proposition made visible.
 * The heading is always present so the route resolves mid-load/-error; the body swaps per lens.
 */
export function CapabilityMapScreen() {
  const [lens, setLens] = useState<Lens>("raw");
  const [focus, setFocus] = useState<string>("");
  const raw = useCapabilityMap(focus || null);
  const ea = useBusinessArchitecture(lens !== "ea");
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (focus === "" && raw.view) {
      setOptions(raw.view.roots.map((root) => ({ id: root.id, name: root.name })));
    }
  }, [focus, raw.view]);

  return (
    <section aria-labelledby="capability-map-heading" className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-2">
        <h1 id="capability-map-heading" className="text-xl font-semibold">
          Capability Map
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          The business-function map of the ingested domain. Switch between the{" "}
          <strong>raw hierarchy</strong> (capabilities exactly as extracted) and the{" "}
          <strong>normalised EA model</strong> (those capabilities classified into a curated
          BIZBOK/APQC reference architecture). (For the DDD subdomain/context view, see the Domain
          Map; for the conceptual model, the Overview.)
        </p>
      </div>

      <fieldset className="flex w-fit items-center gap-4 text-sm">
        <legend className="sr-only">Lens</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="capability-lens"
            checked={lens === "raw"}
            onChange={() => setLens("raw")}
          />
          <span>Raw hierarchy</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="capability-lens"
            checked={lens === "ea"}
            onChange={() => setLens("ea")}
          />
          <span>Normalised EA model</span>
        </label>
      </fieldset>

      {lens === "raw" ? (
        <RawLens
          view={raw.view}
          loading={raw.loading}
          error={raw.error}
          empty={raw.empty}
          focus={focus}
          options={options}
          onFocus={setFocus}
        />
      ) : (
        <EaLens view={ea.view} loading={ea.loading} error={ea.error} empty={ea.empty} />
      )}
    </section>
  );
}

interface RawLensProps {
  view: ReturnType<typeof useCapabilityMap>["view"];
  loading: boolean;
  error: string | null;
  empty: boolean;
  focus: string;
  options: { id: string; name: string }[];
  onFocus: (id: string) => void;
}

function RawLens({ view, loading, error, empty, focus, options, onFocus }: RawLensProps) {
  return (
    <>
      {options.length > 0 && (
        <label className="flex w-fit items-center gap-2 text-sm">
          <span>Focus function</span>
          <select
            className="rounded-md border border-border bg-background px-2 py-1"
            value={focus}
            onChange={(event) => onFocus(event.target.value)}
          >
            <option value="">All capabilities</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {loading && !view && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading the capability map…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          Couldn&rsquo;t load the capability map: {error}
        </p>
      )}
      {empty && (
        <p className="text-sm text-muted-foreground">
          No capabilities extracted yet — run <code>dkm process</code> over your documents, then this
          map fills in.
        </p>
      )}
      {view && !empty && <CapabilityMap view={view} />}
    </>
  );
}

interface EaLensProps {
  view: ReturnType<typeof useBusinessArchitecture>["view"];
  loading: boolean;
  error: string | null;
  empty: boolean;
}

function EaLens({ view, loading, error, empty }: EaLensProps) {
  const [mode, setMode] = useState<BusinessArchitectureMode>("outline");
  return (
    <>
      {view && !empty && (
        <div role="group" aria-label="Diagram style" className="flex w-fit gap-1 text-sm">
          {(
            [
              ["outline", "Outline"],
              ["block", "Block diagram"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={`rounded-md border border-border px-2 py-1 ${
                mode === value ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {loading && !view && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading the business-architecture model…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          Couldn&rsquo;t load the business-architecture model: {error}
        </p>
      )}
      {empty && (
        <p className="text-sm text-muted-foreground">
          No capabilities classified yet — run <code>dkm classify-architecture</code> to normalise
          the extracted capabilities into the reference spine, then this model fills in.
        </p>
      )}
      {view && !empty && <BusinessArchitecture view={view} mode={mode} />}
    </>
  );
}
