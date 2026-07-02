import { useQuery } from "urql";
import { COVERAGE_MAP_QUERY } from "./queries";

/** The RAG coverage vocabulary shared with the data-track matrices. */
export type CoverageStatus = "covered" | "partial" | "uncovered";

/** A matrix column — a vendor product. */
export interface VendorCoverageColumn {
  id: string;
  name: string;
  vendor: string;
}

/** A matrix row — an L1 capability/concept, with its coverage roll-up across all vendors. */
export interface VendorCoverageRow {
  id: string;
  name: string;
  kind: string;
  status: CoverageStatus;
  /** True ⇔ the row is functionally unrealised (`status === "uncovered"`). */
  gap: boolean;
  domain?: string | null;
}

/** A single cell: how well one vendor product (column) covers one capability (row). */
export interface VendorCoverageCell {
  rowId: string;
  columnId: string;
  status: CoverageStatus;
  coveragePercentage?: number | null;
  mappingId?: string | null;
  gaps?: string[] | null;
}

/** Matrix totals — `coveragePercentage` weights covered=1, partial=0.5, uncovered=0. */
export interface VendorCoverageSummary {
  totalCapabilities: number;
  covered: number;
  partial: number;
  uncovered: number;
  coveragePercentage: number;
}

/** The full Coverage Map projection (mirrors `@dkm/view-projection`'s `VendorCoverageView`). */
export interface VendorCoverageView {
  rows: VendorCoverageRow[];
  columns: VendorCoverageColumn[];
  cells: VendorCoverageCell[];
  summary: VendorCoverageSummary;
}

export interface UseVendorCoverageParams {
  /** Restrict columns to one vendor (matched on the product's `vendor`, id or name). */
  vendor?: string | null;
  /** Restrict rows to one domain. */
  domain?: string | null;
}

export interface UseVendorCoverageResult {
  view: VendorCoverageView | null;
  loading: boolean;
  error: string | null;
  /** True when the gateway resolved a valid matrix with no rows (nothing to assess). */
  empty: boolean;
}

/**
 * Read the Vendor Coverage Map through the gateway (UI-D3). `vendor`/`domain` scope the query
 * server-side (the projector honours them), so focusing a vendor or domain **re-issues** rather
 * than filtering client-side.
 */
export function useVendorCoverage(params: UseVendorCoverageParams = {}): UseVendorCoverageResult {
  const [{ data, fetching, error }] = useQuery<{ coverageMap: VendorCoverageView }>({
    query: COVERAGE_MAP_QUERY,
    variables: { vendor: params.vendor ?? undefined, domain: params.domain ?? undefined },
  });

  const view = data?.coverageMap ?? null;
  return {
    view,
    loading: fetching,
    error: error?.message ?? null,
    empty: !fetching && !error && view !== null && view.rows.length === 0,
  };
}
