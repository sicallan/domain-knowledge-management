import type { VendorCoverageCell, VendorCoverageView } from "./types";

/**
 * Vendor Coverage Map renderer (feature 03 criterion 9 — the phase's visible payoff). A
 * **pure** function over the already-projected {@link VendorCoverageView}: it emits a
 * deterministic Markdown matrix with RAG cell colouring (🟢 covered · 🟡 partial · 🔴
 * uncovered) and a coverage summary. It does **not** re-query the graph, so it inherits
 * the projector's adapter parity for free. An alternative render target (HTML/PlantUML
 * `salt`) is an additive sibling that never touches the projector (OCP).
 */
export function renderVendorCoverageMarkdown(view: VendorCoverageView): string {
  const { summary } = view;
  const rowHeader = view.rows[0]?.kind === "DomainConcept" ? "Concept" : "Capability";
  const columnLabels = view.columns.map((column) => `${column.name} (${column.vendor})`);

  const cellAt = (rowId: string, columnId: string): VendorCoverageCell | undefined =>
    view.cells.find((cell) => cell.rowId === rowId && cell.columnId === columnId);

  const lines = [
    "# Vendor Coverage Map",
    "",
    `**Coverage: ${summary.coveragePercentage}%** — ${summary.covered} covered, ${summary.partial} partial, ${summary.uncovered} uncovered (of ${summary.totalCapabilities} ${summary.totalCapabilities === 1 ? "capability" : "capabilities"})`,
    "",
    `| ${[rowHeader, ...columnLabels].join(" | ")} |`,
    `| ${new Array(columnLabels.length + 1).fill("---").join(" | ")} |`,
    ...view.rows.map(
      (row) =>
        `| ${[row.name, ...view.columns.map((column) => cellLabel(cellAt(row.id, column.id)))].join(" | ")} |`,
    ),
    "",
    "Legend: 🟢 covered · 🟡 partial · 🔴 uncovered",
  ];
  return lines.join("\n");
}

function cellLabel(cell: VendorCoverageCell | undefined): string {
  const status = cell?.status ?? "uncovered";
  const emoji = status === "covered" ? "🟢" : status === "partial" ? "🟡" : "🔴";
  return cell?.coveragePercentage !== undefined ? `${emoji} ${cell.coveragePercentage}%` : emoji;
}
