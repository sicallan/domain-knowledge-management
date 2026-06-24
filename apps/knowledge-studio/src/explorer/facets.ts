import {
  BASE_ENTRY_KEYS,
  confidenceIndicator,
  formatDate,
  formatValue,
  humaniseFieldName,
  lifecycleIndicator,
} from "../context-panel/format";
import { knownInventoryTypes, layerOfType } from "./encoding";

/**
 * The non-visual half of the Knowledge Explorer (UI-3.5): the **pure** mapping between the
 * shared facet/sort model and the gateway's `entries` port. Two rules govern it (UI-D3):
 *
 *  1. **Server-side where the port expresses it** — `type`, `sort`, and equality
 *     `PropertyFilter`s become `entries` args ({@link toEntriesArgs}); the table never
 *     full-scans a store.
 *  2. **Client-side, page-scoped, for the rest** — layer (derived from type), confidence
 *     band, date range, multi-value lifecycle/owner and free-text search narrow the *loaded*
 *     rows only ({@link applyClientFacets}); documented as page-scoped until the port grows
 *     the predicate.
 *
 * This module holds no React and no network — it is the closed surface the canvas shares
 * (same filter model) and the `EntryTable`/`useEntries` build on (OCP).
 */

/** The shared faceted-filter state (UI-3.5 §7); the canvas reads `layers`/`types` from the same shape. */
export interface FacetState {
  layers?: string[];
  types?: string[];
  lifecycle?: string[];
  owners?: string[];
  confidence?: [number, number];
  dateRange?: [string, string];
}

/** Sort state mapped to the port's `sort` arg. */
export interface SortState {
  field: string;
  direction: "asc" | "desc";
}

/** A row in the table — base-entry fields normalised, with `data` kept for type-aware extras. */
export interface TableRow {
  id: string;
  type: string;
  /** Display name from the entry's `data.name`; falls back to the id. */
  name: string;
  /** Domain layer derived from the type (shared with the canvas encoding). */
  layer: string;
  lifecycle: string;
  confidence: number | null;
  validFrom: string;
  data: Record<string, unknown>;
}

/** The raw `entries` item shape the gateway returns (base fields + the JSON `data` escape hatch). */
export interface RawEntry {
  id: string;
  type: string;
  lifecycleStatus?: string | null;
  validFrom?: string | null;
  confidence?: number | null;
  data?: Record<string, unknown> | null;
}

/** The field a property-equality facet maps to when it is server-expressible. */
const LIFECYCLE_FIELD = "lifecycle_status";
const OWNER_FIELD = "createdBy";

/** Normalise a gateway `entries` item to a {@link TableRow}. */
export function toRow(item: RawEntry): TableRow {
  const data = (item.data ?? {}) as Record<string, unknown>;
  const name = typeof data.name === "string" && data.name.length > 0 ? data.name : item.id;
  return {
    id: item.id,
    type: item.type,
    name,
    layer: layerOfType(item.type),
    lifecycle: item.lifecycleStatus ?? "",
    confidence: item.confidence ?? null,
    validFrom: item.validFrom ?? "",
    data,
  };
}

/** A GraphQL `PropertyFilterInput` value (SCREAMING_CASE enum, per the SDL). */
export interface PropertyFilterArg {
  field: string;
  op: "EQ" | "NEQ";
  value: unknown;
}

/** A GraphQL `SortInput` value. */
export interface SortArg {
  field: string;
  direction: "ASC" | "DESC";
}

/** The variables for one per-type `entries` query. */
export interface EntriesArgs {
  type: string;
  filter?: PropertyFilterArg[];
  sort?: SortArg;
  limit?: number;
  cursor?: string;
}

/**
 * Map the shared facet/sort model to the gateway `entries` args **for one type**. Only the
 * predicates the port expresses are emitted server-side: a single-valued `lifecycle`/`owners`
 * facet becomes an equality `PropertyFilter`; `sort` maps through. Multi-valued facets and
 * the non-property facets (layer/confidence/date) are deliberately *not* here — they narrow
 * client-side ({@link applyClientFacets}).
 */
export function toEntriesArgs(
  type: string,
  facets: FacetState,
  sort?: SortState,
  limit?: number,
  cursor?: string,
): EntriesArgs {
  const filter: PropertyFilterArg[] = [];
  if (facets.lifecycle?.length === 1) {
    filter.push({ field: LIFECYCLE_FIELD, op: "EQ", value: facets.lifecycle[0] });
  }
  if (facets.owners?.length === 1) {
    filter.push({ field: OWNER_FIELD, op: "EQ", value: facets.owners[0] });
  }
  return {
    type,
    ...(filter.length > 0 ? { filter } : {}),
    ...(sort ? { sort: { field: sort.field, direction: sort.direction === "desc" ? "DESC" : "ASC" } } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(cursor ? { cursor } : {}),
  };
}

function inConfidenceBand(row: TableRow, band: [number, number]): boolean {
  if (row.confidence === null) return false;
  const [min, max] = band;
  return row.confidence >= min && row.confidence <= max;
}

function inDateRange(row: TableRow, range: [string, string]): boolean {
  const [from, to] = range;
  if (from && row.validFrom < from) return false;
  if (to && row.validFrom > to) return false;
  return true;
}

/**
 * Narrow the **loaded** rows by the facets the port can't express, plus the free-text search
 * query (substring over name/id, the structured Phase-3 search-resolution — semantic ranking
 * is Phase 4). Page-scoped by design: it filters what's been fetched, never the whole store.
 */
export function applyClientFacets(rows: TableRow[], facets: FacetState, query?: string): TableRow[] {
  let result = rows;
  if (facets.layers?.length) {
    const layers = new Set(facets.layers);
    result = result.filter((row) => layers.has(row.layer));
  }
  if (facets.types?.length) {
    const types = new Set(facets.types);
    result = result.filter((row) => types.has(row.type));
  }
  if (facets.lifecycle && facets.lifecycle.length > 1) {
    const lifecycles = new Set(facets.lifecycle);
    result = result.filter((row) => lifecycles.has(row.lifecycle));
  }
  if (facets.confidence) {
    result = result.filter((row) => inConfidenceBand(row, facets.confidence!));
  }
  if (facets.dateRange) {
    result = result.filter((row) => inDateRange(row, facets.dateRange!));
  }
  const trimmed = query?.trim().toLowerCase();
  if (trimmed) {
    result = result.filter(
      (row) => row.name.toLowerCase().includes(trimmed) || row.id.toLowerCase().includes(trimmed),
    );
  }
  return result;
}

/** Read the sortable value for a row by the port's sort field (base field or `data.*`). */
function sortValue(row: TableRow, field: string): unknown {
  switch (field) {
    case "id":
      return row.id;
    case "name":
      return row.name;
    case "type":
      return row.type;
    case "lifecycle_status":
      return row.lifecycle;
    case "validFrom":
      return row.validFrom;
    case "confidence":
      return row.confidence;
    default:
      return row.data[field];
  }
}

/**
 * A comparator matching the port's `sort` semantics — so the **merged** multi-type set
 * (each type sorted server-side) is re-ordered consistently client-side (page-scoped). Nulls
 * sort last regardless of direction.
 */
export function compareRows(field: string, direction: "asc" | "desc"): (a: TableRow, b: TableRow) => number {
  const sign = direction === "desc" ? -1 : 1;
  return (a, b) => {
    const av = sortValue(a, field);
    const bv = sortValue(b, field);
    const aNull = av === null || av === undefined;
    const bNull = bv === null || bv === undefined;
    if (aNull && bNull) return 0;
    if (aNull) return 1;
    if (bNull) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * sign;
    return String(av).localeCompare(String(bv)) * sign;
  };
}

/** A client-side group of rows under a shared key (UI-3.5 §6 criterion 5; page-scoped). */
export interface RowGroup {
  key: string;
  rows: TableRow[];
}

/** Group the loaded rows by inventory type or layer, with stable key ordering. */
export function groupRows(rows: TableRow[], by: "type" | "layer"): RowGroup[] {
  const groups = new Map<string, TableRow[]>();
  for (const row of rows) {
    const key = by === "layer" ? row.layer : row.type;
    const existing = groups.get(key);
    if (existing) existing.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.entries()]
    .map(([key, groupedRows]) => ({ key, rows: groupedRows }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** A table column: a header, an optional server-sortable field, and a cell renderer. */
export interface ColumnDef {
  key: string;
  header: string;
  /** When set, the column header is a sort control over this port `sort.field`. */
  sortField?: string;
  render: (row: TableRow) => string;
}

/** The uniform base columns shown for every type (criterion 1: identity + base fields). */
const BASE_COLUMNS: ColumnDef[] = [
  { key: "name", header: "Name", sortField: "name", render: (row) => row.name },
  { key: "type", header: "Type", sortField: "type", render: (row) => row.type },
  { key: "layer", header: "Layer", render: (row) => row.layer },
  {
    key: "lifecycle",
    header: "Lifecycle",
    sortField: "lifecycle_status",
    render: (row) => lifecycleIndicator(row.lifecycle).label,
  },
  {
    key: "confidence",
    header: "Confidence",
    sortField: "confidence",
    render: (row) => confidenceIndicator(row.confidence)?.label ?? "—",
  },
  { key: "validFrom", header: "Valid from", sortField: "validFrom", render: (row) => formatDate(row.validFrom) },
];

/** Keys never shown as a type-specific extra column (base/meta or already a base column). */
const NON_EXTRA_KEYS = new Set([...BASE_ENTRY_KEYS, "name", "data", "metadata", "source"]);
const MAX_EXTRA_COLUMNS = 3;

/**
 * The columns for the current view: the uniform base columns, plus **type-aware extras** when
 * exactly one type is in view (open-question 2). Extras are derived from the loaded rows'
 * non-base `data` keys (deterministic, capped), so a new type contributes its columns with no
 * code change (OCP-open).
 */
export function deriveColumns(activeTypes: string[], rows: TableRow[]): ColumnDef[] {
  if (activeTypes.length !== 1) return BASE_COLUMNS;
  const extraKeys = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row.data)) {
      if (!NON_EXTRA_KEYS.has(key)) extraKeys.add(key);
    }
  }
  const extras: ColumnDef[] = [...extraKeys]
    .sort()
    .slice(0, MAX_EXTRA_COLUMNS)
    .map((key) => ({
      key: `data.${key}`,
      header: humaniseFieldName(key),
      render: (row: TableRow) => formatValue(row.data[key]),
    }));
  return [...BASE_COLUMNS, ...extras];
}

/** The default type universe the table browses when no `types` facet is active (shared with the canvas). */
export const BROWSABLE_TYPES: string[] = knownInventoryTypes();
