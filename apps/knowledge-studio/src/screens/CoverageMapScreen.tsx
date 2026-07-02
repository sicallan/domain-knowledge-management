import { useEffect, useState } from "react";
import { CoverageLegend } from "../components/CoverageLegend";
import { CoverageMap } from "../coverage-map/CoverageMap";
import { useVendorCoverage } from "../coverage-map/useVendorCoverage";

/**
 * The Vendor Coverage Map screen (Phase-3 view) — the L2 "build-vs-buy" picture over the *actual
 * ingested* domain: which L1 capabilities each vendor product covers, and how well. Reads the
 * gateway's `coverageMap` projection (UI-D3); the vendor/domain filters re-issue the query scoped
 * server-side. The heading is always present so the route resolves mid-load/-error; the body swaps
 * between loading, empty, error and the rendered matrix.
 *
 * Filter options are captured from the first unscoped load so the controls stay populated after the
 * view narrows. Coverage data needs L2 vendor mappings — a corpus with capabilities but no vendor
 * products renders as rows with an empty column set (the matrix explains this), and a corpus with no
 * capabilities at all shows the ingest-guidance empty state.
 */
export function CoverageMapScreen() {
  const [vendor, setVendor] = useState<string>("");
  const [domain, setDomain] = useState<string>("");
  const { view, loading, error, empty } = useVendorCoverage({
    vendor: vendor || null,
    domain: domain || null,
  });
  const [vendorOptions, setVendorOptions] = useState<string[]>([]);
  const [domainOptions, setDomainOptions] = useState<string[]>([]);

  useEffect(() => {
    if (vendor === "" && domain === "" && view) {
      setVendorOptions([...new Set(view.columns.map((column) => column.vendor).filter(Boolean))].sort());
      setDomainOptions(
        [...new Set(view.rows.map((row) => row.domain).filter((d): d is string => Boolean(d)))].sort(),
      );
    }
  }, [vendor, domain, view]);

  return (
    <section aria-labelledby="coverage-map-heading" className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-2">
        <h1 id="coverage-map-heading" className="text-xl font-semibold">
          Coverage Map
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          The vendor coverage matrix of the ingested domain — each L1 capability against the vendor
          products claiming to fulfil it, RAG-coloured by how well. Its deterministic inverse (what is
          <em> not</em> yet realised, and why) is the Gap Analysis view.
        </p>
      </div>

      {(vendorOptions.length > 0 || domainOptions.length > 0) && (
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {domainOptions.length > 0 && (
            <label className="flex w-fit items-center gap-2">
              <span>Domain</span>
              <select
                className="rounded-md border border-border bg-background px-2 py-1"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
              >
                <option value="">All domains</option>
                {domainOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          )}
          {vendorOptions.length > 0 && (
            <label className="flex w-fit items-center gap-2">
              <span>Vendor</span>
              <select
                className="rounded-md border border-border bg-background px-2 py-1"
                value={vendor}
                onChange={(event) => setVendor(event.target.value)}
              >
                <option value="">All vendors</option>
                {vendorOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {view && !empty && <CoverageLegend />}

      {loading && !view && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading the coverage map…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          Couldn&rsquo;t load the coverage map: {error}
        </p>
      )}
      {empty && (
        <p className="text-sm text-muted-foreground">
          No coverage data yet — run <code>dkm process</code> over your documents to extract
          capabilities and vendor products, then this matrix fills in.
        </p>
      )}
      {view && !empty && <CoverageMap view={view} />}
    </section>
  );
}
