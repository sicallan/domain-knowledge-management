import { useEffect, useState } from "react";
import { CapabilityMap } from "../capability-map/CapabilityMap";
import { useCapabilityMap } from "../capability-map/useCapabilityMap";

/**
 * The Capability Map screen — the **EA business-function lens** on the ingested domain: the
 * extracted BusinessCapability hierarchy (function → sub-function → activity), each node annotated
 * with the evidence attached to it. A read-time projection of structure already in the graph
 * (ADR-0008) — distinct from the Domain Map's DDD subdomain/context lens. The heading is always
 * present (so the route resolves mid-load/-error); the body swaps between loading, empty, error and
 * the rendered tree. Focusing a root re-issues the query scoped server-side; the focus options are
 * captured from the first unscoped load so the control stays populated after the view narrows.
 */
export function CapabilityMapScreen() {
  const [focus, setFocus] = useState<string>("");
  const { view, loading, error, empty } = useCapabilityMap(focus || null);
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (focus === "" && view) {
      setOptions(view.roots.map((root) => ({ id: root.id, name: root.name })));
    }
  }, [focus, view]);

  return (
    <section aria-labelledby="capability-map-heading" className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-2">
        <h1 id="capability-map-heading" className="text-xl font-semibold">
          Capability Map
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          The business-function map of the ingested domain — capabilities decomposed from
          high-level functions down to individual activities, each showing the rules, decisions and
          realisations attached to it. (For the DDD subdomain/context view, see the Domain Map; for
          the conceptual model, the Overview.)
        </p>
      </div>

      {options.length > 0 && (
        <label className="flex w-fit items-center gap-2 text-sm">
          <span>Focus function</span>
          <select
            className="rounded-md border border-border bg-background px-2 py-1"
            value={focus}
            onChange={(event) => setFocus(event.target.value)}
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
    </section>
  );
}
