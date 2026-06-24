import { EntryTable } from "./EntryTable";
import type { FacetState, SortState } from "./facets";
import { useEntries } from "./useEntries";

export interface SelectedEntryInput {
  id: string;
  type?: string;
  label?: string;
}

export interface ExplorerListProps {
  facets: FacetState;
  sort: SortState | null;
  onSort: (field: string) => void;
  groupBy: "type" | "layer" | null;
  onGroupBy: (group: "type" | "layer" | null) => void;
  /** The resolved structured-search query (criterion 7); page-scoped substring over name/id. */
  query?: string;
  onSelectEntry: (entry: SelectedEntryInput) => void;
  selectedId?: string | null;
}

/**
 * The list/table mode container (UI-3.5): it owns the `entries` data via {@link useEntries}
 * and renders the sort/group controls + the accessible {@link EntryTable}. It is the canvas's
 * a11y equivalent and the surface the shell's search resolves into (criterion 7). Selection
 * flows up via {@link ExplorerListProps.onSelectEntry} using the **same** store action the
 * canvas calls, so the two modes share selection (criterion 8).
 */
export function ExplorerList({
  facets,
  sort,
  onSort,
  groupBy,
  onGroupBy,
  query,
  onSelectEntry,
  selectedId,
}: ExplorerListProps) {
  const { rows, columns, totalCount, loading, error, hasMore, loadMore } = useEntries({ facets, sort, query });

  function handleSelect(id: string): void {
    const row = rows.find((candidate) => candidate.id === id);
    onSelectEntry({ id, type: row?.type, label: row?.name });
  }

  if (error) {
    return (
      <p role="alert" className="rounded-md border border-coverage-uncovered p-3 text-sm">
        Could not load entries: {error}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 self-start text-sm">
        <span>Group by</span>
        <select
          value={groupBy ?? ""}
          onChange={(event) => onGroupBy((event.target.value || null) as "type" | "layer" | null)}
          className="rounded-md border border-border bg-background px-2 py-1"
        >
          <option value="">None</option>
          <option value="type">Type</option>
          <option value="layer">Layer</option>
        </select>
      </label>

      <EntryTable
        rows={rows}
        columns={columns}
        totalCount={totalCount}
        sort={sort}
        onSort={onSort}
        onSelect={handleSelect}
        selectedId={selectedId}
        groupBy={groupBy}
        hasMore={hasMore}
        onLoadMore={loadMore}
        loading={loading}
      />
    </div>
  );
}
