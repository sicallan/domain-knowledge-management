import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { describe, expect, it, vi } from "vitest";
import { BlockDiagram, type BlockNode } from "../src/components/BlockDiagram";
import { AXE_OPTIONS } from "./helpers";

/**
 * The generic BlockDiagram — a nested **containment** block diagram (the capability-map idiom
 * architects draw) for any tree, not tied to any one domain shape. Parent tiles visually contain
 * their children; deep branches collapse to a "+N" summary. Exercised as a pure component over a
 * small synthetic tree.
 */
const tree: BlockNode[] = [
  {
    id: "a",
    label: "Alpha",
    meta: "domain",
    children: [
      {
        id: "a1",
        label: "Alpha One",
        meta: "capability · 90%",
        badges: ["1 rule"],
        heat: 0.9,
        accent: true,
        children: [{ id: "a1x", label: "Alpha One X", meta: "function" }],
      },
    ],
  },
  { id: "b", label: "Beta" },
];

describe("BlockDiagram", () => {
  const renderDiagram = (props: Partial<React.ComponentProps<typeof BlockDiagram>> = {}) =>
    render(<BlockDiagram nodes={tree} ariaLabel="Sample diagram" {...props} />);

  const diagram = () => screen.getByRole("list", { name: "Sample diagram" });

  it("renders the tree as nested containment tiles", () => {
    renderDiagram();
    const region = diagram();
    for (const label of ["Alpha", "Alpha One", "Alpha One X", "Beta"]) {
      expect(within(region).getByText(label)).toBeInTheDocument();
    }
    // Containment: the child tile is nested inside its parent's tile.
    expect(within(region).getByText("Alpha One").closest("li")).toContainElement(
      within(region).getByText("Alpha One X"),
    );
  });

  it("shows a node's meta line and count badges", () => {
    renderDiagram();
    expect(screen.getByText("capability · 90%")).toBeInTheDocument();
    expect(screen.getByText("1 rule")).toBeInTheDocument();
  });

  it("collapses and re-expands a branch", async () => {
    renderDiagram();
    expect(screen.getByText("Alpha One X")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /collapse alpha one/i }));
    expect(screen.queryByText("Alpha One X")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /expand alpha one/i }));
    expect(screen.getByText("Alpha One X")).toBeInTheDocument();
  });

  it("collapses nodes at or below initialDepth by default", () => {
    renderDiagram({ initialDepth: 1 });
    // Depth-0 roots stay open, so their direct children show…
    expect(screen.getByText("Alpha One")).toBeInTheDocument();
    // …but the depth-1 node starts collapsed, hiding its own subtree.
    expect(screen.queryByText("Alpha One X")).not.toBeInTheDocument();
  });

  it("invokes onSelect when a tile is activated", async () => {
    const onSelect = vi.fn();
    renderDiagram({ onSelect });
    await userEvent.click(screen.getByRole("button", { name: "Alpha One" }));
    expect(onSelect).toHaveBeenCalledWith("a1");
  });

  it("passes an axe accessibility baseline", async () => {
    const { container } = renderDiagram({ onSelect: vi.fn() });
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });
});
