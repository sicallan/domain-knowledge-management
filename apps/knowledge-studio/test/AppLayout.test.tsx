import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { AppRoutes } from "../src/router";
import { AXE_OPTIONS, renderWithProviders } from "./helpers";

describe("AppLayout shell", () => {
  it("renders the shell landmarks and the always-present search bar (criterion 1)", () => {
    renderWithProviders(<AppRoutes />, { route: "/explorer" });
    expect(screen.getByRole("banner")).toBeInTheDocument(); // header
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("search")).toBeInTheDocument();
  });

  it("passes an axe accessibility baseline (criterion 6)", async () => {
    const { container } = renderWithProviders(<AppRoutes />, { route: "/explorer" });
    const results = await axe(container, AXE_OPTIONS);
    expect(results).toHaveNoViolations();
  });
});
