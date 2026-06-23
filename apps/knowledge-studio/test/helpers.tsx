import { render, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import type { Client } from "urql";
import { AppProviders } from "../src/App";

/** Render a UI tree inside the real provider stack + a `MemoryRouter` at `route`. */
export function renderWithProviders(
  ui: ReactElement,
  options: { route?: string; client?: Client } = {},
): RenderResult {
  const { route = "/explorer", client } = options;
  return render(
    <AppProviders client={client}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </AppProviders>,
  );
}

/** axe run options: jsdom can't compute layout colours, so the color-contrast rule is off. */
export const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } } as const;
