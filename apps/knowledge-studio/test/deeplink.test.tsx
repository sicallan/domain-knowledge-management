import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AppProviders } from "../src/App";
import { AppRoutes } from "../src/router";
import { mockServer } from "../src/mocks/server";
import { useShellStore } from "../src/store";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="loc">{`${location.pathname}${location.search}`}</div>;
}

function renderApp(route: string) {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[route]}>
        <AppRoutes />
        <LocationProbe />
      </MemoryRouter>
    </AppProviders>,
  );
}

describe("selection deep-link (criterion 7)", () => {
  beforeAll(() => mockServer.listen({ onUnhandledRequest: "bypass" }));
  afterEach(() => {
    mockServer.resetHandlers();
    act(() => useShellStore.setState({ panelOpen: false, selectedEntry: null, trail: [] }));
  });
  afterAll(() => mockServer.close());

  it("opens the panel for an ?entry= URL on load (URL → selection)", async () => {
    renderApp("/explorer?entry=sd-payments");
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Payments" })).toBeInTheDocument(),
    );
  });

  it("reflects a selection in the URL (selection → URL)", async () => {
    renderApp("/explorer");
    act(() => {
      useShellStore.getState().selectEntry({ id: "sd-payments" });
    });
    await waitFor(() =>
      expect(screen.getByTestId("loc").textContent).toContain("entry=sd-payments"),
    );
  });
});
