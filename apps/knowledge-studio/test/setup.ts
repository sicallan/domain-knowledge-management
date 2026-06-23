import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, expect, vi } from "vitest";
import * as axeMatchers from "vitest-axe/matchers";

// Cytoscape needs a real canvas (which jsdom lacks), so any test that mounts GraphCanvas
// would crash. Provide a safe no-op stub globally; the canvas-specific tests override this
// with their own spy mock to assert renderer wiring.
vi.mock("cytoscape", () => ({
  default: () => ({
    on: () => {},
    elements: () => ({ remove: () => {} }),
    add: () => {},
    layout: () => ({ run: () => {} }),
    nodes: () => ({ removeClass: () => {} }),
    getElementById: () => ({ addClass: () => {} }),
    destroy: () => {},
  }),
}));

// jest-dom matchers (`toBeInTheDocument`, …) are registered by the import above.
// Register the axe accessibility matcher (`toHaveNoViolations`) too.
expect.extend(axeMatchers);

// With `globals: false`, Testing Library does not auto-register cleanup — do it here so
// each test starts from an empty DOM (otherwise renders/portals leak across tests).
afterEach(() => {
  cleanup();
});
