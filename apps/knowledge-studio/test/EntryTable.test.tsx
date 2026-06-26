import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { EntryTable } from "../src/explorer/EntryTable";
import { deriveColumns, type TableRow } from "../src/explorer/facets";
import { AXE_OPTIONS } from "./helpers";

const row = (over: Partial<TableRow> & { id: string; name: string }): TableRow => ({
  type: "DomainConcept",
  layer: "L1",
  lifecycle: "active",
  confidence: 0.9,
  validFrom: "2026-06-15T00:00:00Z",
  data: {},
  ...over,
});

const ROWS: TableRow[] = [
  row({ id: "e-auth", name: "Authorisation", confidence: 0.94 }),
  row({ id: "e-capture", name: "Capture", type: "Event", layer: "L3", confidence: 0.6 }),
];
const COLUMNS = deriveColumns(["DomainConcept", "Event"], ROWS);

function renderTable(overrides: Partial<Parameters<typeof EntryTable>[0]> = {}) {
  return render(
    <EntryTable
      rows={ROWS}
      columns={COLUMNS}
      totalCount={5}
      sort={null}
      onSort={vi.fn()}
      onSelect={vi.fn()}
      {...overrides}
    />,
  );
}

describe("EntryTable (UI-3.5)", () => {
  it("renders a row per entry and shows the total count (criterion 1)", () => {
    renderTable();
    expect(screen.getByRole("row", { name: /Authorisation/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Capture/ })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Showing 2 of 5 entries");
  });

  it("fires selectEntry on row click and on Enter (criterion 6)", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderTable({ onSelect });

    await user.click(screen.getByRole("row", { name: /Authorisation/ }));
    expect(onSelect).toHaveBeenCalledWith("e-auth");

    screen.getByRole("row", { name: /Capture/ }).focus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith("e-capture");
  });

  it("marks the selected row with aria-selected (criterion 6)", () => {
    renderTable({ selectedId: "e-auth" });
    expect(screen.getByRole("row", { name: /Authorisation/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("row", { name: /Capture/ })).toHaveAttribute("aria-selected", "false");
  });

  it("sorts on a sortable column header and reflects it via aria-sort (criterion 4)", async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    renderTable({ onSort, sort: { field: "name", direction: "asc" } });

    await user.click(screen.getByRole("button", { name: /Name/ }));
    expect(onSort).toHaveBeenCalledWith("name");

    const nameHeader = screen.getByRole("columnheader", { name: /Name/ });
    expect(nameHeader).toHaveAttribute("aria-sort", "ascending");
  });

  it("groups rows with header + counts when groupBy is set (criterion 5)", () => {
    renderTable({ groupBy: "type" });
    // Group header rows render the type and the count.
    expect(screen.getByText("DomainConcept (1)")).toBeInTheDocument();
    expect(screen.getByText("Event (1)")).toBeInTheDocument();
  });

  it("renders a Load more control only when there is more, and fires onLoadMore", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    const { rerender } = renderTable({ hasMore: false, onLoadMore });
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();

    rerender(
      <EntryTable
        rows={ROWS}
        columns={COLUMNS}
        totalCount={5}
        sort={null}
        onSort={vi.fn()}
        onSelect={vi.fn()}
        hasMore
        onLoadMore={onLoadMore}
      />,
    );
    await user.click(screen.getByRole("button", { name: /load more/i }));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it("exposes ARIA grid semantics and is keyboard navigable (criterion 9)", async () => {
    const user = userEvent.setup();
    const { container } = renderTable();

    const grid = screen.getByRole("grid", { name: /inventory entries/i });
    expect(within(grid).getAllByRole("gridcell").length).toBeGreaterThan(0);

    // Roving tabindex: arrow keys move focus between data rows.
    const first = screen.getByRole("row", { name: /Authorisation/ });
    first.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("row", { name: /Capture/ })).toHaveFocus();

    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });

  it("shows an empty state when there are no rows", () => {
    renderTable({ rows: [], totalCount: 0 });
    expect(screen.getByRole("status")).toHaveTextContent(/no entries/i);
  });
});
