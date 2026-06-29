import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { axe } from "vitest-axe";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AppProviders } from "../src/App";
import { mockServer } from "../src/mocks/server";
import { DomainMapScreen } from "../src/screens/DomainMapScreen";
import { AXE_OPTIONS } from "./helpers";

/**
 * The Domain Map screen end-to-end over MSW (criteria 1, 3, 4, 5, 6, 9): the screen reads the real
 * `domainMap` projection over the shared seed — two subdomains (Payments: Authorisation/Settlement/
 * Refunds; Risk & Fraud: Fraud Scoring) — and handles loading / empty / error states.
 */
describe("DomainMapScreen data mode", () => {
  beforeAll(() => mockServer.listen({ onUnhandledRequest: "bypass" }));
  afterEach(() => mockServer.resetHandlers());
  afterAll(() => mockServer.close());

  function renderScreen() {
    return render(
      <AppProviders>
        <DomainMapScreen />
      </AppProviders>,
    );
  }

  it("shows a loading affordance while fetching (criterion 4)", () => {
    renderScreen();
    expect(screen.getByText(/Loading the domain map/i)).toBeInTheDocument();
  });

  it("renders the seeded subdomains and their bounded contexts (criterion 1)", async () => {
    renderScreen();

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Payments", level: 2 })).toBeInTheDocument(),
    );
    expect(screen.getByRole("heading", { name: "Risk & Fraud", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Authorisation", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Settlement", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Refunds", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Fraud Scoring", level: 3 })).toBeInTheDocument();
  });

  it("re-issues the query scoped to the chosen subdomain (criterion 3)", async () => {
    renderScreen();
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Risk & Fraud", level: 2 })).toBeInTheDocument(),
    );

    await userEvent.selectOptions(screen.getByRole("combobox", { name: /focus/i }), "sd-payments");

    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Risk & Fraud", level: 2 })).not.toBeInTheDocument(),
    );
    // Payments and its contexts remain; the Risk & Fraud context is gone.
    expect(screen.getByRole("heading", { name: "Payments", level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Fraud Scoring", level: 3 })).not.toBeInTheDocument();
  });

  it("shows guidance when no domain data has been ingested (criterion 5)", async () => {
    mockServer.use(
      http.post(/\/graphql$/, () =>
        HttpResponse.json({ data: { domainMap: { subdomains: [], crossContextRelationships: [] } } }),
      ),
    );
    renderScreen();
    await waitFor(() => expect(screen.getByText(/no domain data ingested yet/i)).toBeInTheDocument());
    expect(screen.getByText(/dkm process/)).toBeInTheDocument();
  });

  it("shows a non-fatal error state when the gateway errors (criterion 6)", async () => {
    mockServer.use(
      http.post(/\/graphql$/, () => HttpResponse.json({ errors: [{ message: "boom" }] })),
    );
    renderScreen();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(/load the domain map/i);
  });

  it("passes an axe accessibility baseline (criterion 9)", async () => {
    const { container } = renderScreen();
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Payments", level: 2 })).toBeInTheDocument(),
    );
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });
});
