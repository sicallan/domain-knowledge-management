import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The canvas pipeline end-to-end over MSW (criteria 1 + 10): roots → `traverse` → adapter →
 * renderer, with **no backend** beyond the seeded in-memory graph the MSW handler runs the
 * gateway schema over (UI-D2). Cytoscape is stubbed with a spy that captures the elements
 * the renderer is handed, so we can assert seed data actually reached the canvas.
 */

const mocks = vi.hoisted(() => {
  const seen: { data?: { id?: string } }[] = [];
  const record = (elements: unknown): void => {
    if (Array.isArray(elements)) for (const element of elements) seen.push(element as { data?: { id?: string } });
  };
  const fakeCy = {
    on: () => {},
    elements: () => ({ remove: () => {} }),
    add: (elements: unknown) => record(elements),
    layout: () => ({ run: () => {} }),
    nodes: () => ({ removeClass: () => {} }),
    getElementById: () => ({ addClass: () => {} }),
    destroy: () => {},
  };
  const factory = vi.fn((options: { elements?: unknown }) => {
    record(options.elements);
    return fakeCy;
  });
  return { seen, factory };
});

vi.mock("cytoscape", () => ({ default: mocks.factory }));

const { AppProviders } = await import("../src/App");
const { ExplorerScreen } = await import("../src/screens/ExplorerScreen");
const { mockServer } = await import("../src/mocks/server");

describe("Explorer canvas data mode (criteria 1, 10)", () => {
  beforeAll(() => mockServer.listen({ onUnhandledRequest: "bypass" }));
  afterEach(() => mockServer.resetHandlers());
  afterAll(() => mockServer.close());

  it("loads the seeded subgraph via the gateway and hands it to the renderer", async () => {
    render(
      <AppProviders>
        <MemoryRouter initialEntries={["/explorer"]}>
          <ExplorerScreen />
        </MemoryRouter>
      </AppProviders>,
    );

    // 'sd-payments' comes from demo/*.jsonl through the gateway's traverse resolver.
    await waitFor(() => {
      expect(mocks.seen.some((element) => element.data?.id === "sd-payments")).toBe(true);
    });
    // …and the node-count status reflects a non-empty graph.
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toMatch(/Showing [1-9]\d* nodes/);
    });
  });
});
