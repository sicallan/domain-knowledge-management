import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AppProviders } from "../src/App";
import { mockServer } from "../src/mocks/server";
import { CapabilityMapScreen } from "../src/screens/CapabilityMapScreen";
import { AXE_OPTIONS } from "./helpers";

/**
 * The Business-Architecture lens (Feature 08, #86) — a toggle on the Capability Map screen between
 * the **Raw hierarchy** (the extracted capabilities as-is) and the **Normalised EA model** (the
 * curated ReferenceCapability spine with raw capabilities classified beneath it). Exercised
 * end-to-end over MSW running the real gateway schema on the shared seed (spine + the demo
 * classification stub), so the lens renders what the projector actually produces.
 */
describe("CapabilityMapScreen — Business-Architecture lens", () => {
  beforeAll(() => mockServer.listen({ onUnhandledRequest: "bypass" }));
  afterEach(() => mockServer.resetHandlers());
  afterAll(() => mockServer.close());

  const renderScreen = () =>
    render(
      <AppProviders>
        <CapabilityMapScreen />
      </AppProviders>,
    );

  const rawTree = () => screen.getByRole("list", { name: "Capability hierarchy" });
  const eaTree = () => screen.getByRole("list", { name: "Business-architecture model" });

  const switchToEA = async () => {
    await userEvent.click(screen.getByRole("radio", { name: /normalised ea model/i }));
    await waitFor(() => expect(eaTree()).toBeInTheDocument());
  };

  it("starts on the raw hierarchy lens", async () => {
    renderScreen();
    await waitFor(() => expect(rawTree()).toBeInTheDocument());
    expect(within(rawTree()).getByText("Payments Processing")).toBeInTheDocument();
    // The raw lens is the default: the EA tree is not mounted.
    expect(screen.queryByRole("list", { name: "Business-architecture model" })).not.toBeInTheDocument();
  });

  it("toggles to the normalised EA model and renders the curated domains", async () => {
    renderScreen();
    await switchToEA();
    // The 11 curated enterprise domains anchor the tree…
    expect(within(eaTree()).getByText("Investment Management")).toBeInTheDocument();
    expect(within(eaTree()).getByText("Operations & Fund Administration")).toBeInTheDocument();
    // …with a raw capability classified beneath a curated L2 capability.
    expect(within(eaTree()).getByText("Trading & Execution")).toBeInTheDocument();
    expect(within(eaTree()).getByText("Authorisation")).toBeInTheDocument();
  });

  it("shows a classified node's rationale and confidence", async () => {
    renderScreen();
    await switchToEA();
    const authorisation = within(eaTree()).getByText("Authorisation").closest("li");
    expect(authorisation).not.toBeNull();
    // The classifier's justification is viewable, and its certainty is conveyed as text.
    expect(authorisation).toHaveTextContent(/order\/trade-execution function/i);
    expect(authorisation).toHaveTextContent(/86%/);
    // Disposition/level is conveyed in words, not colour alone (a11y).
    expect(authorisation).toHaveTextContent(/function/i);
  });

  it("nests an L4 activity beneath a placed L3 capability", async () => {
    renderScreen();
    await switchToEA();
    const settlement = within(eaTree()).getByText("Settlement").closest("li");
    expect(settlement).toHaveTextContent("Refunds");
  });

  it("surfaces the rejected and unclassified buckets with counts", async () => {
    renderScreen();
    await switchToEA();
    const rejected = screen.getByRole("group", { name: /rejected/i });
    expect(rejected).toHaveTextContent(/1/);
    expect(rejected).toHaveTextContent(/duplicate/i);
    const unclassified = screen.getByRole("group", { name: /unclassified/i });
    // A raw capability the pass never placed is surfaced honestly rather than dropped.
    expect(unclassified).toHaveTextContent(/Risk & Compliance/);
  });

  it("toggles back to the raw hierarchy", async () => {
    renderScreen();
    await switchToEA();
    await userEvent.click(screen.getByRole("radio", { name: /raw hierarchy/i }));
    await waitFor(() => expect(rawTree()).toBeInTheDocument());
    expect(screen.queryByRole("list", { name: "Business-architecture model" })).not.toBeInTheDocument();
  });

  it("passes an axe accessibility baseline on the EA lens", async () => {
    const { container } = renderScreen();
    await switchToEA();
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });
});
