import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, expect } from "vitest";
import * as axeMatchers from "vitest-axe/matchers";

// jest-dom matchers (`toBeInTheDocument`, …) are registered by the import above.
// Register the axe accessibility matcher (`toHaveNoViolations`) too.
expect.extend(axeMatchers);

// With `globals: false`, Testing Library does not auto-register cleanup — do it here so
// each test starts from an empty DOM (otherwise renders/portals leak across tests).
afterEach(() => {
  cleanup();
});
