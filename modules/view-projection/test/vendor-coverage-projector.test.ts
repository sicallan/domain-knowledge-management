import { describe, expect, it } from "vitest";
import type { GraphMutationEvent } from "@dkm/knowledge-graph";
import { VendorCoverageProjector } from "../src/index";
import type { VendorCoverageCell, VendorCoverageView } from "../src/index";
import { buildService, ctx, seededCoverageGraph } from "./helpers";

async function project(params = {}): Promise<VendorCoverageView> {
  const projector = new VendorCoverageProjector(buildService(await seededCoverageGraph()));
  return projector.project(params, ctx());
}

function cell(view: VendorCoverageView, rowId: string, columnId: string): VendorCoverageCell | undefined {
  return view.cells.find((c) => c.rowId === rowId && c.columnId === columnId);
}

describe("VendorCoverageProjector — matrix shape (criterion 2)", () => {
  it("rows are the BusinessCapabilities by default, columns the VendorProducts, both id-sorted", async () => {
    const view = await project();
    expect(view.rows.map((r) => r.id)).toEqual(["cap-auth", "cap-fraud", "cap-report", "cap-settle"]);
    expect(view.rows.every((r) => r.kind === "BusinessCapability")).toBe(true);
    expect(view.columns).toEqual([
      { id: "vp-acme", name: "Acme PaySuite", vendor: "Acme" },
      { id: "vp-globex", name: "Globex Settle", vendor: "Globex" },
    ]);
    // Full matrix: a cell for every row × column.
    expect(view.cells).toHaveLength(view.rows.length * view.columns.length);
  });
});

describe("VendorCoverageProjector — cell coverage status (criterion 3)", () => {
  it("maps a full mapping → covered, partial → partial, none/absent → uncovered", async () => {
    const view = await project();

    expect(cell(view, "cap-auth", "vp-acme")).toMatchObject({
      status: "covered",
      coveragePercentage: 100,
      mappingId: "m-acme-auth",
    });
    expect(cell(view, "cap-settle", "vp-acme")).toMatchObject({
      status: "partial",
      coveragePercentage: 60,
      mappingId: "m-acme-settle",
      gaps: ["no multi-currency"],
    });
    expect(cell(view, "cap-settle", "vp-globex")).toMatchObject({ status: "partial", coveragePercentage: 75 });
    // An explicit `none` mapping is uncovered, as is a product that does not claim the capability.
    expect(cell(view, "cap-fraud", "vp-acme")?.status).toBe("uncovered");
    expect(cell(view, "cap-auth", "vp-globex")?.status).toBe("uncovered");
    expect(cell(view, "cap-report", "vp-acme")?.status).toBe("uncovered");
  });
});

describe("VendorCoverageProjector — per-row status, gap flags + summary (criterion 4)", () => {
  it("rolls each row up to a status + gap flag and totals the matrix", async () => {
    const view = await project();
    const row = (id: string) => view.rows.find((r) => r.id === id);

    expect(row("cap-auth")).toMatchObject({ status: "covered", gap: false });
    expect(row("cap-settle")).toMatchObject({ status: "partial", gap: false });
    expect(row("cap-report")).toMatchObject({ status: "uncovered", gap: true });
    expect(row("cap-fraud")).toMatchObject({ status: "uncovered", gap: true });

    expect(view.summary).toEqual({
      totalCapabilities: 4,
      covered: 1,
      partial: 1,
      uncovered: 2,
      coveragePercentage: 38, // weighted (1·1 + 1·0.5)/4 = 37.5 → 38
    });
  });
});

describe("VendorCoverageProjector — domain filter (criterion 5)", () => {
  it("keeps only rows in the requested domain", async () => {
    const view = await project({ domain: "payments" });
    expect(view.rows.map((r) => r.id)).toEqual(["cap-auth", "cap-report", "cap-settle"]); // cap-fraud (risk) excluded
    expect(view.summary).toEqual({
      totalCapabilities: 3,
      covered: 1,
      partial: 1,
      uncovered: 1,
      coveragePercentage: 50,
    });
    // No orphan cells for the excluded row.
    expect(view.cells.some((c) => c.rowId === "cap-fraud")).toBe(false);
  });
});

describe("VendorCoverageProjector — vendor filter (criterion 6)", () => {
  it("keeps only the requested vendor's products as columns; row status stays global", async () => {
    const view = await project({ vendor: "Acme" });
    expect(view.columns.map((c) => c.id)).toEqual(["vp-acme"]);
    expect(view.cells.every((c) => c.columnId === "vp-acme")).toBe(true);
    // Row realisation is global (not re-scoped to the filtered vendor).
    expect(view.rows.find((r) => r.id === "cap-settle")?.status).toBe("partial");
  });
});

describe("VendorCoverageProjector — DomainConcept row mode (feature 03 §11 default + mode)", () => {
  it("projects DomainConcept rows when rowKind=DomainConcept", async () => {
    const view = await project({ rowKind: "DomainConcept" });
    expect(view.rows.map((r) => r.id)).toEqual(["dc-ledger", "dc-notify", "dc-payment"]);
    expect(view.rows.every((r) => r.kind === "DomainConcept")).toBe(true);
    // dc-ledger has only L3 → functionally unrealised → uncovered gap; the spec-realised ones are partial.
    expect(view.rows.find((r) => r.id === "dc-ledger")).toMatchObject({ status: "uncovered", gap: true });
    expect(view.rows.find((r) => r.id === "dc-payment")).toMatchObject({ status: "partial", gap: false });
    expect(view.summary).toEqual({
      totalCapabilities: 3,
      covered: 0,
      partial: 2,
      uncovered: 1,
      coveragePercentage: 33,
    });
  });
});

describe("VendorCoverageProjector — port hooks", () => {
  it("declares a stable viewType + on-demand policy and counts rows for freshness", async () => {
    const projector = new VendorCoverageProjector(buildService(await seededCoverageGraph()));
    expect(projector.viewType).toBe("vendor-coverage");
    expect(projector.describe().refreshPolicy).toBe("on-demand");
    const view = await projector.project({}, ctx());
    expect(projector.entriesIncluded(view)).toBe(4);
  });

  it("invalidatedBy is total and true for the relevant nodes/edges", async () => {
    const projector = new VendorCoverageProjector(buildService(await seededCoverageGraph()));
    const base: GraphMutationEvent = {
      eventId: "e",
      timestamp: "2026-01-01T00:00:00Z",
      mutationType: "NodeCreated",
      entityType: "BusinessCapability",
      entityId: "cap-x",
      previousState: null,
      newState: null,
      trigger: { type: "loader", identity: "t" },
      confidence: 1,
      transactionId: "tx",
    };
    expect(projector.invalidatedBy(base)).toBe(true);
    expect(projector.invalidatedBy({ ...base, entityType: "VendorCapabilityMapping" })).toBe(true);
    expect(projector.invalidatedBy({ ...base, mutationType: "EdgeCreated", entityType: "Relationship:fulfils" })).toBe(true);
    expect(projector.invalidatedBy({ ...base, entityType: "OrchestrationFlow" })).toBe(false);
    expect(typeof projector.invalidatedBy({ ...base, entityType: "Relationship:emits" })).toBe("boolean");
  });
});
