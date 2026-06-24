import { describe, expect, it } from "vitest";
import {
  applyClientFacets,
  BROWSABLE_TYPES,
  compareRows,
  deriveColumns,
  type FacetState,
  groupRows,
  type RawEntry,
  type TableRow,
  toEntriesArgs,
  toRow,
} from "../src/explorer/facets";

const raw = (over: Partial<RawEntry> & { id: string; type: string }): RawEntry => ({
  lifecycleStatus: "active",
  validFrom: "2026-06-15T00:00:00Z",
  confidence: 0.9,
  data: { name: over.id },
  ...over,
});

const row = (over: Partial<TableRow> & { id: string }): TableRow => ({
  type: "DomainConcept",
  name: over.id,
  layer: "L1",
  lifecycle: "active",
  confidence: 0.9,
  validFrom: "2026-06-15T00:00:00Z",
  data: {},
  ...over,
});

describe("toRow (criterion 1)", () => {
  it("maps base fields and derives name from data.name + layer from type", () => {
    const result = toRow(raw({ id: "e-auth", type: "Event", data: { name: "Authorised" } }));
    expect(result).toMatchObject({
      id: "e-auth",
      type: "Event",
      name: "Authorised",
      layer: "L3", // Event → L3 in the shared encoding
      lifecycle: "active",
      confidence: 0.9,
    });
  });

  it("falls back to the id when there is no data.name", () => {
    expect(toRow(raw({ id: "x", type: "Rule", data: {} })).name).toBe("x");
  });
});

describe("toEntriesArgs — server-side where the port expresses it (criterion 3, UI-D3)", () => {
  it("passes the type and maps sort to the SDL enum casing", () => {
    const args = toEntriesArgs("Decision", {}, { field: "validFrom", direction: "desc" });
    expect(args.type).toBe("Decision");
    expect(args.sort).toEqual({ field: "validFrom", direction: "DESC" });
    expect(args.filter).toBeUndefined();
  });

  it("maps a single-valued lifecycle facet to an equality PropertyFilter", () => {
    const args = toEntriesArgs("Decision", { lifecycle: ["active"] });
    expect(args.filter).toEqual([{ field: "lifecycle_status", op: "EQ", value: "active" }]);
  });

  it("does NOT emit a server filter for a multi-valued facet (narrowed client-side)", () => {
    const args = toEntriesArgs("Decision", { lifecycle: ["active", "draft"] });
    expect(args.filter).toBeUndefined();
  });
});

describe("applyClientFacets — page-scoped narrowing the port can't express (criteria 3, 7)", () => {
  const rows = [
    row({ id: "a", type: "DomainConcept", layer: "L1", confidence: 0.95, name: "Authorisation" }),
    row({ id: "b", type: "Event", layer: "L3", confidence: 0.4, name: "Captured" }),
    row({ id: "c", type: "VendorProduct", layer: "L2", confidence: 0.7, name: "Stripe" }),
  ];

  it("narrows by layer", () => {
    expect(applyClientFacets(rows, { layers: ["L3"] }).map((r) => r.id)).toEqual(["b"]);
  });

  it("narrows by confidence band", () => {
    expect(applyClientFacets(rows, { confidence: [0.5, 1] }).map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("narrows by date range on validFrom", () => {
    const dated = [
      row({ id: "old", validFrom: "2025-01-01T00:00:00Z" }),
      row({ id: "new", validFrom: "2026-06-15T00:00:00Z" }),
    ];
    expect(
      applyClientFacets(dated, { dateRange: ["2026-01-01", "2026-12-31"] }).map((r) => r.id),
    ).toEqual(["new"]);
  });

  it("resolves a free-text query as a case-insensitive substring over name/id (search resolution)", () => {
    expect(applyClientFacets(rows, {}, "auth").map((r) => r.id)).toEqual(["a"]);
  });

  it("narrows by a multi-valued lifecycle facet client-side", () => {
    const mixed = [row({ id: "x", lifecycle: "active" }), row({ id: "y", lifecycle: "retired" })];
    const facets: FacetState = { lifecycle: ["retired", "deprecated"] };
    expect(applyClientFacets(mixed, facets).map((r) => r.id)).toEqual(["y"]);
  });
});

describe("compareRows — matches the port's sort (criterion 4)", () => {
  it("orders by name ascending and descending", () => {
    const rows = [row({ id: "b", name: "Beta" }), row({ id: "a", name: "Alpha" })];
    expect([...rows].sort(compareRows("name", "asc")).map((r) => r.name)).toEqual(["Alpha", "Beta"]);
    expect([...rows].sort(compareRows("name", "desc")).map((r) => r.name)).toEqual(["Beta", "Alpha"]);
  });

  it("orders numeric confidence and sinks nulls last", () => {
    const rows = [
      row({ id: "hi", confidence: 0.9 }),
      row({ id: "none", confidence: null }),
      row({ id: "lo", confidence: 0.2 }),
    ];
    expect([...rows].sort(compareRows("confidence", "asc")).map((r) => r.id)).toEqual(["lo", "hi", "none"]);
  });
});

describe("groupRows (criterion 5)", () => {
  it("groups by type with stable key ordering", () => {
    const rows = [
      row({ id: "a", type: "Event" }),
      row({ id: "b", type: "Decision" }),
      row({ id: "c", type: "Event" }),
    ];
    const groups = groupRows(rows, "type");
    expect(groups.map((g) => [g.key, g.rows.length])).toEqual([
      ["Decision", 1],
      ["Event", 2],
    ]);
  });
});

describe("deriveColumns — type-aware extras when a single type is in view (open-question 2)", () => {
  it("shows only base columns for a multi-type view", () => {
    const cols = deriveColumns(["DomainConcept", "Event"], [row({ id: "a", data: { conceptType: "aggregate" } })]);
    expect(cols.map((c) => c.key)).toEqual(["name", "type", "layer", "lifecycle", "confidence", "validFrom"]);
  });

  it("appends a type-specific extra column derived from the rows' data keys for a single type", () => {
    const cols = deriveColumns(
      ["DomainConcept"],
      [row({ id: "a", type: "DomainConcept", data: { name: "Authorisation", conceptType: "aggregate" } })],
    );
    const extra = cols.find((c) => c.key === "data.conceptType");
    expect(extra).toBeDefined();
    expect(extra!.header).toBe("Concept Type");
    expect(extra!.render(row({ id: "a", data: { conceptType: "aggregate" } }))).toBe("aggregate");
  });
});

describe("BROWSABLE_TYPES", () => {
  it("is the shared type universe (includes the L1 anchors)", () => {
    expect(BROWSABLE_TYPES).toContain("Subdomain");
    expect(BROWSABLE_TYPES).toContain("DomainConcept");
    expect(BROWSABLE_TYPES.length).toBeGreaterThan(5);
  });
});
