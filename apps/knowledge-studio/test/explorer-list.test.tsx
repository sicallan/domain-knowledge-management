import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppProviders } from "../src/App";
import type { FacetState } from "../src/explorer/facets";
import { useEntries } from "../src/explorer/useEntries";
import { mockServer } from "../src/mocks/server";
import { ExplorerScreen } from "../src/screens/ExplorerScreen";
import { useShellStore } from "../src/store";
import { renderWithProviders } from "./helpers";

/**
 * The list/table mode end-to-end over MSW (criteria 1, 2, 7, 8, 10): the explorer reads the
 * seeded inventory through the gateway's `entries` listing — **no backend** beyond the shared
 * in-memory seed the MSW handler runs the real schema over (UI-D2).
 */

beforeAll(() => mockServer.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());
beforeEach(() => {
  useShellStore.setState({ selectedEntry: null, panelOpen: false, trail: [], lastSearch: null });
});

/** Data rows carry `aria-selected`; header/group rows do not — use that to pick them out. */
function dataRows(): HTMLElement[] {
  return screen.getAllByRole("row").filter((row) => row.hasAttribute("aria-selected"));
}

describe("Explorer list mode — data (criteria 1, 10)", () => {
  it("lists the seeded entries via the gateway and shows the total count", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExplorerScreen />);

    await user.click(screen.getByRole("button", { name: "list" }));

    // 'Authorisation' is a DomainConcept from demo/*.jsonl, reached through the entries resolver.
    // The first render is seed-cold and fans out over every browsable type, so allow headroom.
    // (Several seeded entries reference Authorisation, hence findAll.)
    const matches = await screen.findAllByRole("row", { name: /Authorisation/ }, { timeout: 10000 });
    expect(matches.length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Showing \d+ of \d+ entries/));
  }, 15000);
});

describe("Explorer list mode — pagination (criterion 2)", () => {
  function Harness() {
    const [facets] = useState<FacetState>({ types: ["DomainConcept"] });
    const { rows, hasMore, loadMore } = useEntries({ facets, sort: null, pageLimit: 2 });
    return (
      <div>
        <p data-testid="ids">{rows.map((r) => r.id).join(",")}</p>
        <p data-testid="count">{rows.length}</p>
        <button type="button" onClick={loadMore} disabled={!hasMore}>
          more
        </button>
      </div>
    );
  }

  it("loads further pages via the cursor with no duplicates or skips", async () => {
    const user = userEvent.setup();
    render(
      <AppProviders>
        <MemoryRouter>
          <Harness />
        </MemoryRouter>
      </AppProviders>,
    );

    // First page: the per-type limit of 2.
    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("2"));
    await user.click(screen.getByRole("button", { name: "more" }));
    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("4"));
    await user.click(screen.getByRole("button", { name: "more" }));
    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("5")); // 5 DomainConcepts total

    const ids = screen.getByTestId("ids").textContent!.split(",");
    expect(new Set(ids).size).toBe(ids.length); // no duplicates
  });
});

describe("Explorer list mode — search resolution (criterion 7)", () => {
  it("resolves the shell's search into a filtered listing", async () => {
    renderWithProviders(<ExplorerScreen />);

    // The shell dispatches a structured search (the SearchBar contract).
    useShellStore.getState().dispatchSearch("authorisation");

    // It switches to list mode and narrows to matching rows.
    const grid = await screen.findByRole("grid", { name: /inventory entries/i }, { timeout: 4000 });
    await waitFor(() => expect(dataRows().length).toBeGreaterThan(0));
    for (const row of dataRows()) {
      expect(within(row).getByText(/authorisation/i)).toBeInTheDocument();
    }
    expect(grid).toBeInTheDocument();
  });
});

describe("Explorer — mode toggle shares selection + filter state (criterion 8)", () => {
  it("keeps the selection and facets consistent across canvas ↔ list", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExplorerScreen />);

    await user.click(screen.getByRole("button", { name: "list" }));
    // Narrow to a single type via the shared facet model.
    await user.selectOptions(screen.getByLabelText(/inventory type/i), "DomainConcept");

    const authRow = await screen.findByRole("row", { name: /Authorisation/ }, { timeout: 4000 });
    await user.click(authRow);
    expect(useShellStore.getState().selectedEntry?.id).toBe("e-authorisation");

    // Toggle to the canvas — selection persists (shared via the store).
    await user.click(screen.getByRole("button", { name: "canvas" }));
    expect(useShellStore.getState().selectedEntry?.id).toBe("e-authorisation");

    // Toggle back — the facet (type) is still applied and the row is still selected.
    await user.click(screen.getByRole("button", { name: "list" }));
    expect(screen.getByLabelText(/inventory type/i)).toHaveValue("DomainConcept");
    expect(await screen.findByRole("row", { name: /Authorisation/ })).toHaveAttribute("aria-selected", "true");
  });
});
