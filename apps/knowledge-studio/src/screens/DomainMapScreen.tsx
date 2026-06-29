import { useEffect, useState } from "react";
import { DomainMap } from "../domain-map/DomainMap";
import { useDomainMap } from "../domain-map/useDomainMap";

/**
 * The Domain Map screen — a **data-driven** view of the domain *as actually ingested*: subdomains,
 * their bounded contexts, and the concepts/services each holds (read from the gateway's `domainMap`
 * projection, UI-D3). Distinct from the **Overview**, which shows the platform's *conceptual model*
 * with no ingested data. The heading is always present (so the route resolves even mid-load/-error);
 * the body swaps between loading, empty, error and the rendered map.
 *
 * Focusing a subdomain re-issues the query scoped server-side. The focus options are captured from
 * the first unscoped load so the control stays populated after the view narrows.
 */
export function DomainMapScreen() {
  const [focus, setFocus] = useState<string>("");
  const { view, loading, error, empty } = useDomainMap(focus || null);
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (focus === "" && view) {
      setOptions(view.subdomains.map((subdomain) => ({ id: subdomain.id, name: subdomain.name })));
    }
  }, [focus, view]);

  return (
    <section aria-labelledby="domain-map-heading" className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-2">
        <h1 id="domain-map-heading" className="text-xl font-semibold">
          Domain Map
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          The domain as captured from your ingested sources — the subdomains, the bounded contexts
          within them, and the concepts and services each one holds. For the platform&rsquo;s
          conceptual model itself (independent of any data), see the Overview.
        </p>
      </div>

      {options.length > 0 && (
        <label className="flex w-fit items-center gap-2 text-sm">
          <span>Focus subdomain</span>
          <select
            className="rounded-md border border-border bg-background px-2 py-1"
            value={focus}
            onChange={(event) => setFocus(event.target.value)}
          >
            <option value="">All subdomains</option>
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
          Loading the domain map…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          Couldn&rsquo;t load the domain map: {error}
        </p>
      )}
      {empty && (
        <p className="text-sm text-muted-foreground">
          No domain data ingested yet — run <code>dkm process</code> to build your domain graph, then
          this map fills in.
        </p>
      )}
      {view && !empty && <DomainMap view={view} />}
    </section>
  );
}
