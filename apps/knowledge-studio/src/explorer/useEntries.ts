import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useClient } from "urql";
import {
  applyClientFacets,
  BROWSABLE_TYPES,
  type ColumnDef,
  compareRows,
  deriveColumns,
  type FacetState,
  type RawEntry,
  type SortState,
  type TableRow,
  toEntriesArgs,
  toRow,
} from "./facets";
import { ENTRIES_QUERY } from "./queries";

/** Raw `entries` page from the gateway (one type). */
interface RawConnection {
  items: RawEntry[];
  cursor: string | null;
  hasMore: boolean;
  totalCount: number | null;
}
interface RawEntriesData {
  entries: RawConnection;
}

/** Accumulated paging state for one type. */
interface TypePage {
  items: RawEntry[];
  cursor: string | null;
  hasMore: boolean;
  totalCount: number | null;
}

export interface UseEntriesArgs {
  facets: FacetState;
  sort: SortState | null;
  /** Free-text search to resolve into a filtered listing (criterion 7); page-scoped substring. */
  query?: string;
  /** Per-type page size. */
  pageLimit?: number;
}

export interface UseEntriesResult {
  rows: TableRow[];
  columns: ColumnDef[];
  /** Sum of the per-type server totals (the matching count before page-scoped client facets). */
  totalCount: number | null;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
}

const DEFAULT_PAGE_LIMIT = 25;

function activeTypesOf(facets: FacetState): string[] {
  return facets.types && facets.types.length > 0 ? facets.types : BROWSABLE_TYPES;
}

/**
 * Read the list/table's rows **only through the gateway's `entries`** listing (UI-D3): the
 * port lists one type at a time, so this fetches a page per active type (server-side `type`,
 * equality `filter`s and `sort`) and **merges** them client-side. Cursor pagination is
 * per-type — {@link UseEntriesResult.loadMore} advances every type that still `hasMore`. The
 * facets the port can't express (layer, confidence, date, free-text, multi-valued) narrow the
 * loaded rows page-scoped ({@link applyClientFacets}); the merged set is re-sorted with the
 * same comparator the port uses, so multi-type ordering stays consistent.
 */
export function useEntries({ facets, sort, query, pageLimit = DEFAULT_PAGE_LIMIT }: UseEntriesArgs): UseEntriesResult {
  const client = useClient();
  const [pages, setPages] = useState<Record<string, TypePage>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeTypes = useMemo(() => activeTypesOf(facets), [facets]);

  // Only the server-affecting inputs trigger a refetch — client-only facets re-derive rows.
  const serverKey = JSON.stringify({
    types: activeTypes,
    lifecycle: facets.lifecycle ?? null,
    owners: facets.owners ?? null,
    sort,
  });
  // Guards against stale responses when serverKey changes mid-flight.
  const generation = useRef(0);

  const fetchPage = useCallback(
    async (type: string, cursor?: string): Promise<TypePage | null> => {
      const args = toEntriesArgs(type, facets, sort ?? undefined, pageLimit, cursor);
      const result = await client.query<RawEntriesData>(ENTRIES_QUERY, args).toPromise();
      if (result.error) {
        setError(result.error.message);
        return null;
      }
      const conn = result.data?.entries;
      return conn
        ? { items: conn.items, cursor: conn.cursor, hasMore: conn.hasMore, totalCount: conn.totalCount }
        : null;
    },
    // facets/sort are captured via serverKey-driven effects; depend on them so paging uses current args.
    [client, facets, sort, pageLimit],
  );

  // First page per active type whenever the server-affecting inputs change.
  useEffect(() => {
    const runId = ++generation.current;
    setLoading(true);
    setError(null);
    void (async () => {
      const results = await Promise.all(activeTypes.map((type) => fetchPage(type).then((page) => [type, page] as const)));
      if (generation.current !== runId) return; // superseded
      const next: Record<string, TypePage> = {};
      for (const [type, page] of results) {
        if (page) next[type] = page;
      }
      setPages(next);
      setLoading(false);
    })();
    // fetchPage is intentionally omitted: serverKey already captures the inputs that change it,
    // and including it would refetch on every render (new closure identity).
  }, [serverKey]);

  const loadMore = useCallback(() => {
    const runId = generation.current;
    const pageable = activeTypes.filter((type) => pages[type]?.hasMore && pages[type]?.cursor);
    if (pageable.length === 0) return;
    setLoading(true);
    void (async () => {
      const results = await Promise.all(
        pageable.map((type) => fetchPage(type, pages[type]!.cursor!).then((page) => [type, page] as const)),
      );
      if (generation.current !== runId) return;
      setPages((previous) => {
        const next = { ...previous };
        for (const [type, page] of results) {
          if (!page) continue;
          const seen = new Set(previous[type]?.items.map((item) => item.id));
          const merged = [...(previous[type]?.items ?? []), ...page.items.filter((item) => !seen.has(item.id))];
          next[type] = { ...page, items: merged };
        }
        return next;
      });
      setLoading(false);
    })();
  }, [activeTypes, pages, fetchPage]);

  const rows = useMemo(() => {
    const raw = activeTypes.flatMap((type) => pages[type]?.items ?? []);
    const narrowed = applyClientFacets(raw.map(toRow), facets, query);
    return sort ? [...narrowed].sort(compareRows(sort.field, sort.direction)) : narrowed;
  }, [activeTypes, pages, facets, query, sort]);

  const columns = useMemo(() => deriveColumns(activeTypes, rows), [activeTypes, rows]);

  const totalCount = useMemo(() => {
    const totals = activeTypes.map((type) => pages[type]?.totalCount).filter((value): value is number => value != null);
    return totals.length > 0 ? totals.reduce((sum, value) => sum + value, 0) : null;
  }, [activeTypes, pages]);

  const hasMore = activeTypes.some((type) => pages[type]?.hasMore);

  return { rows, columns, totalCount, loading, error, hasMore, loadMore };
}
