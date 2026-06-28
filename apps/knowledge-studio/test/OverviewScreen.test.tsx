import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OverviewScreen } from "../src/screens/OverviewScreen";

/**
 * The Overview pairs the layered conceptual-model diagram with the concepts and relationships
 * reference tables. The screen is pure (no gateway), so it renders standalone.
 */
describe("OverviewScreen", () => {
  it("renders the four-layer diagram plus concepts and relationships tables", () => {
    render(<OverviewScreen />);

    expect(screen.getByRole("heading", { name: "Overview", level: 1 })).toBeInTheDocument();

    // The layered diagram (a figure) with the four layer bands (sections → regions).
    expect(screen.getByLabelText("The four-layer conceptual model")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /L1 Pure Domain/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /L0 Strategic Alignment/ })).toBeInTheDocument();

    // Concepts table — Decision's description identifies it uniquely (not the diagram chip).
    expect(screen.getByRole("cell", { name: /highest-value node/ })).toBeInTheDocument();

    // Relationships table — a key edge type and its endpoints.
    expect(screen.getByRole("cell", { name: "governs" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: /VendorProduct → BusinessCapability/ })).toBeInTheDocument();
  });
});
