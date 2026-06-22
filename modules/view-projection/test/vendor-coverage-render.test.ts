import { describe, expect, it } from "vitest";
import { renderVendorCoverageMarkdown } from "../src/index";
import type { VendorCoverageView } from "../src/index";

const VIEW: VendorCoverageView = {
  rows: [
    { id: "cap-auth", name: "Authorisation", kind: "BusinessCapability", status: "covered", gap: false },
    { id: "cap-report", name: "Reporting", kind: "BusinessCapability", status: "uncovered", gap: true },
  ],
  columns: [
    { id: "vp-acme", name: "Acme PaySuite", vendor: "Acme" },
    { id: "vp-globex", name: "Globex Settle", vendor: "Globex" },
  ],
  cells: [
    { rowId: "cap-auth", columnId: "vp-acme", status: "covered", coveragePercentage: 100, mappingId: "m1" },
    { rowId: "cap-auth", columnId: "vp-globex", status: "uncovered" },
    { rowId: "cap-report", columnId: "vp-acme", status: "uncovered" },
    { rowId: "cap-report", columnId: "vp-globex", status: "uncovered" },
  ],
  summary: { totalCapabilities: 2, covered: 1, partial: 0, uncovered: 1, coveragePercentage: 50 },
};

describe("renderVendorCoverageMarkdown (criterion 9)", () => {
  it("renders a deterministic RAG matrix with a summary + legend", () => {
    expect(renderVendorCoverageMarkdown(VIEW)).toBe(
      [
        "# Vendor Coverage Map",
        "",
        "**Coverage: 50%** — 1 covered, 0 partial, 1 uncovered (of 2 capabilities)",
        "",
        "| Capability | Acme PaySuite (Acme) | Globex Settle (Globex) |",
        "| --- | --- | --- |",
        "| Authorisation | 🟢 100% | 🔴 |",
        "| Reporting | 🔴 | 🔴 |",
        "",
        "Legend: 🟢 covered · 🟡 partial · 🔴 uncovered",
      ].join("\n"),
    );
  });

  it("labels the row header `Concept` for a DomainConcept matrix", () => {
    const md = renderVendorCoverageMarkdown({
      ...VIEW,
      rows: [{ id: "dc-x", name: "Payment", kind: "DomainConcept", status: "partial", gap: false }],
      cells: [
        { rowId: "dc-x", columnId: "vp-acme", status: "partial", coveragePercentage: 50 },
        { rowId: "dc-x", columnId: "vp-globex", status: "uncovered" },
      ],
    });
    expect(md).toContain("| Concept | Acme PaySuite (Acme) | Globex Settle (Globex) |");
    expect(md).toContain("| Payment | 🟡 50% | 🔴 |");
  });
});
