import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppRoutes } from "../src/router";
import { renderWithProviders } from "./helpers";

describe("routing (criterion 2)", () => {
  it("redirects the index route to the Explorer", () => {
    renderWithProviders(<AppRoutes />, { route: "/" });
    expect(screen.getByRole("heading", { name: "Knowledge Explorer" })).toBeInTheDocument();
  });

  it("resolves /explorer to the Knowledge Explorer", () => {
    renderWithProviders(<AppRoutes />, { route: "/explorer" });
    expect(screen.getByRole("heading", { name: "Knowledge Explorer" })).toBeInTheDocument();
  });

  it("resolves /views/domain-map to the real Domain Map screen (criterion 7)", () => {
    renderWithProviders(<AppRoutes />, { route: "/views/domain-map" });
    expect(screen.getByRole("heading", { name: "Domain Map", level: 1 })).toBeInTheDocument();
    // The stale placeholder is gone.
    expect(screen.queryByText(/This view is delivered/)).not.toBeInTheDocument();
  });

  it("resolves a still-placeholder view route (Coverage Map)", () => {
    renderWithProviders(<AppRoutes />, { route: "/views/coverage" });
    expect(screen.getByRole("heading", { name: "Coverage Map" })).toBeInTheDocument();
  });

  it("renders the 404 screen for an unknown route", () => {
    renderWithProviders(<AppRoutes />, { route: "/no-such-route" });
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });

  it("reflects the active route in the nav (aria-current)", () => {
    renderWithProviders(<AppRoutes />, { route: "/views/coverage" });
    expect(screen.getByRole("link", { name: "Coverage Map" })).toHaveAttribute("aria-current", "page");
  });
});
