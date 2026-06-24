import { Fragment, type KeyboardEvent, type ReactElement, useRef } from "react";
import { cn } from "../lib/cn";
import type { ColumnDef, RowGroup, SortState, TableRow } from "./facets";
import { groupRows } from "./facets";

export interface EntryTableProps {
  /** The loaded rows (already client-narrowed + merge-sorted by the hook). */
  rows: TableRow[];
  columns: ColumnDef[];
  /** Total matching count from the port (sum across types); shown in the summary. */
  totalCount: number | null;
  /** Current sort, or null. The matching column header reflects it via `aria-sort`. */
  sort: SortState | null;
  /** Toggle/sort by a column's port field. */
  onSort: (field: string) => void;
  /** Activate a row → the shared `selectEntry` event (criterion 6; Feature 06). */
  onSelect: (id: string) => void;
  selectedId?: string | null;
  /** Client-side, page-scoped grouping by type/layer (criterion 5). */
  groupBy?: "type" | "layer" | null;
  hasMore?: boolean;
  onLoadMore?: () => void;
  loading?: boolean;
}

const ariaSortFor = (col: ColumnDef, sort: SortState | null): "ascending" | "descending" | "none" | undefined => {
  if (!col.sortField) return undefined;
  if (sort?.field !== col.sortField) return "none";
  return sort.direction === "asc" ? "ascending" : "descending";
};

/**
 * The accessible list/table half of the Knowledge Explorer (UI-3.5) — a **presentational**
 * ARIA `grid` over rows the hook supplies. It is the canvas's a11y equivalent (WCAG 2.1 AA):
 * sortable column headers with `aria-sort`, a roving-tabindex body (Arrow/Home/End move the
 * focused row, Enter/Space selects), and `aria-selected` on the current row. It holds no data
 * model and fires no query — selection flows out via {@link EntryTableProps.onSelect} (the
 * same `selectEntry` the canvas uses), so the two modes share selection state (criterion 8).
 */
export function EntryTable({
  rows,
  columns,
  totalCount,
  sort,
  onSort,
  onSelect,
  selectedId,
  groupBy,
  hasMore,
  onLoadMore,
  loading,
}: EntryTableProps) {
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  const groups: RowGroup[] | null = groupBy ? groupRows(rows, groupBy) : null;
  // The flat, in-display order of focusable data rows — the roving-tabindex universe.
  const orderedRows = groups ? groups.flatMap((group) => group.rows) : rows;

  function focusRowAt(index: number): void {
    const target = orderedRows[Math.max(0, Math.min(index, orderedRows.length - 1))];
    if (target) rowRefs.current.get(target.id)?.focus();
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, index: number, id: string): void {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusRowAt(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusRowAt(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusRowAt(0);
        break;
      case "End":
        event.preventDefault();
        focusRowAt(orderedRows.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        onSelect(id);
        break;
      default:
        break;
    }
  }

  function renderRow(row: TableRow): ReactElement {
    const index = orderedRows.indexOf(row);
    const selected = row.id === selectedId;
    return (
      <tr
        key={row.id}
        ref={(node) => {
          if (node) rowRefs.current.set(row.id, node);
          else rowRefs.current.delete(row.id);
        }}
        role="row"
        aria-selected={selected}
        tabIndex={index === 0 ? 0 : -1}
        onClick={() => onSelect(row.id)}
        onKeyDown={(event) => handleRowKeyDown(event, index, row.id)}
        className={cn(
          "cursor-pointer border-b border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          selected ? "bg-primary/10" : "hover:bg-muted/50",
        )}
      >
        {columns.map((col) => (
          <td key={col.key} role="gridcell" className="px-3 py-2 text-sm">
            {col.render(row)}
          </td>
        ))}
      </tr>
    );
  }

  const summary =
    rows.length === 0
      ? loading
        ? "Loading entries…"
        : "No entries match the current filters."
      : `Showing ${rows.length}${totalCount !== null ? ` of ${totalCount}` : ""} entries`;

  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="text-sm text-muted-foreground">
        {summary}
      </p>

      <div className="overflow-x-auto rounded-md border border-border">
        <table
          role="grid"
          aria-label="Inventory entries"
          aria-colcount={columns.length}
          aria-rowcount={(totalCount ?? rows.length) + 1}
          className="w-full border-collapse"
        >
          <caption className="sr-only">
            Inventory entries — sortable, filterable. Use arrow keys to move between rows and Enter to open an
            entry.
          </caption>
          <thead>
            <tr role="row" className="border-b border-border bg-muted/40 text-left">
              {columns.map((col) => (
                <th
                  key={col.key}
                  role="columnheader"
                  aria-sort={ariaSortFor(col, sort)}
                  scope="col"
                  className="px-3 py-2 text-sm font-medium"
                >
                  {col.sortField ? (
                    <button
                      type="button"
                      onClick={() => onSort(col.sortField!)}
                      className="flex items-center gap-1 hover:text-primary"
                    >
                      {col.header}
                      {sort?.field === col.sortField && (
                        <span aria-hidden="true">{sort.direction === "asc" ? "▲" : "▼"}</span>
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups
              ? groups.map((group) => (
                  <Fragment key={group.key}>
                    <tr role="row" className="bg-muted/20">
                      <th
                        role="rowheader"
                        scope="colgroup"
                        colSpan={columns.length}
                        className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {group.key} ({group.rows.length})
                      </th>
                    </tr>
                    {group.rows.map(renderRow)}
                  </Fragment>
                ))
              : rows.map(renderRow)}
          </tbody>
        </table>
      </div>

      {hasMore && onLoadMore && (
        <div>
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loading}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/50 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
