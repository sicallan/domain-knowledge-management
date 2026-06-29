import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { axe } from "vitest-axe";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AppProviders } from "../src/App";
import { mockServer } from "../src/mocks/server";
import { CapabilityMapScreen } from "../src/screens/CapabilityMapScreen";
import { AXE_OPTIONS } from "./helpers";

/**
 * The Capability Map screen end-to-end over MSW (real gateway schema on the seeded capability
 * hierarchy): Payments Processing → {Authorisation, Settlement, Refunds} and Risk & Compliance →
 * Fraud Management, plus loading / focus / empty / error / a11y. Tree-content assertions are scoped
 * to the hierarchy list, since the focus `<select>` also renders the root names as options.
 */
describe("CapabilityMapScreen data mode", () => {
  beforeAll(() => mockServer.listen({ onUnhandledRequest: "bypass" }));
  afterEach(() => mockServer.resetHandlers());
  afterAll(() => mockServer.close());

  const renderScreen = () =>
    render(
      <AppProviders>
        <CapabilityMapScreen />
      </AppProviders>,
    );

  const tree = () => screen.getByRole("list", { name: "Capability hierarchy" });
  const treeLoaded = () => waitFor(() => expect(tree()).toBeInTheDocument());

  it("shows a loading affordance while fetching", () => {
    renderScreen();
    expect(screen.getByText(/Loading the capability map/i)).toBeInTheDocument();
  });

  it("renders the seeded business-function hierarchy with counts", async () => {
    renderScreen();
    await treeLoaded();
    expect(within(tree()).getByText("Payments Processing")).toBeInTheDocument();
    expect(within(tree()).getByText("Risk & Compliance")).toBeInTheDocument();
    expect(within(tree()).getByText("Authorisation")).toBeInTheDocument();
    expect(within(tree()).getByText("Fraud Management")).toBeInTheDocument();
    // Authorisation carries the seeded evidence (1 governing rule + 1 realising flow).
    expect(within(tree()).getByText("Authorisation").closest("li")).toHaveTextContent(/1 rule/);
  });

  it("re-issues scoped to the chosen root function", async () => {
    renderScreen();
    await treeLoaded();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: /focus/i }), "cap-risk-comp");

    // Payments Processing leaves the tree (the option persists in the still-populated select).
    await waitFor(() => expect(within(tree()).queryByText("Payments Processing")).not.toBeInTheDocument());
    expect(within(tree()).getByText("Risk & Compliance")).toBeInTheDocument();
    expect(within(tree()).getByText("Fraud Management")).toBeInTheDocument();
  });

  it("shows guidance when no capabilities have been extracted", async () => {
    mockServer.use(
      http.post(/\/graphql$/, () => HttpResponse.json({ data: { capabilityMap: { roots: [] } } })),
    );
    renderScreen();
    await waitFor(() => expect(screen.getByText(/No capabilities extracted yet/i)).toBeInTheDocument());
    expect(screen.getByText(/dkm process/)).toBeInTheDocument();
  });

  it("shows a non-fatal error state when the gateway errors", async () => {
    mockServer.use(http.post(/\/graphql$/, () => HttpResponse.json({ errors: [{ message: "boom" }] })));
    renderScreen();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(/load the capability map/i);
  });

  it("passes an axe accessibility baseline", async () => {
    const { container } = renderScreen();
    await treeLoaded();
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });
});
