import { render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AppProviders } from "../src/App";
import { ContextPanel } from "../src/context-panel/ContextPanel";
import { mockServer } from "../src/mocks/server";

/**
 * The panel end-to-end over MSW (criteria 1, 2, 4, 5, 8, 9): full detail + grouped
 * relationships + evidence for a real seed entry, and an honest not-found state — no backend.
 */
describe("ContextPanel data mode", () => {
  beforeAll(() => mockServer.listen({ onUnhandledRequest: "bypass" }));
  afterEach(() => mockServer.resetHandlers());
  afterAll(() => mockServer.close());

  it("shows full detail, relationships and evidence for a seeded entry", async () => {
    render(
      <AppProviders>
        <ContextPanel entryId="d-authorise" />
      </AppProviders>,
    );

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Authorise Payment" })).toBeInTheDocument(),
    );
    // Confidence + lifecycle as friendly indicators (criterion 5).
    expect(screen.getByText("High (93%)")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    // Type-specific fields from `data` (criterion 1).
    expect(screen.getByText("Decision Type")).toBeInTheDocument();
    expect(screen.getByText("automated")).toBeInTheDocument();
    expect(screen.getByText("Approved, Declined")).toBeInTheDocument();
    // Grouped relationships (criterion 2) + evidence/provenance (criterion 4).
    expect(screen.getByText("operatesOn")).toBeInTheDocument();
    expect(screen.getByText("authorisation.md")).toBeInTheDocument();
  });

  it("shows a not-found state for an unknown id (criterion 8)", async () => {
    render(
      <AppProviders>
        <ContextPanel entryId="does-not-exist" />
      </AppProviders>,
    );
    await waitFor(() => expect(screen.getByText(/No entry found/)).toBeInTheDocument());
  });
});
