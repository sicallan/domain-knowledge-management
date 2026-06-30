import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CapabilityMap } from "../src/capability-map/CapabilityMap";
import type { CapabilityMapView } from "../src/capability-map/useCapabilityMap";

const z = { invariants: 0, decisions: 0, concepts: 0, realisations: 0, rules: 0 };

const view: CapabilityMapView = {
  roots: [
    {
      id: "c-stew",
      name: "Stewardship",
      level: 1,
      orphaned: false,
      descendantCount: 2,
      counts: { ...z },
      children: [
        {
          id: "c-eng",
          name: "Engagement",
          level: 2,
          orphaned: false,
          descendantCount: 1,
          counts: { ...z, rules: 2, decisions: 1 },
          children: [
            {
              id: "c-proxy",
              name: "Proxy Voting",
              level: 3,
              orphaned: false,
              descendantCount: 0,
              counts: { ...z, rules: 1, realisations: 2 },
              children: [],
            },
          ],
        },
      ],
    },
    { id: "c-orph", name: "Mystery", level: 2, orphaned: true, descendantCount: 0, counts: { ...z }, children: [] },
  ],
};

describe("CapabilityMap (presentational)", () => {
  it("renders the hierarchy with each node's non-zero evidence counts", () => {
    render(<CapabilityMap view={view} />);

    expect(screen.getByRole("list", { name: "Capability hierarchy" })).toBeInTheDocument();
    expect(screen.getByText("Stewardship")).toBeInTheDocument();
    expect(screen.getByText("Proxy Voting")).toBeInTheDocument();

    // Count summaries: only non-zero counts, correctly pluralised.
    expect(screen.getByText(/2 rules · 1 decision/)).toBeInTheDocument();
    expect(screen.getByText(/1 rule · 2 realisations/)).toBeInTheDocument();
  });

  it("nests children under their parent", () => {
    render(<CapabilityMap view={view} />);
    const engagementItem = screen.getByText("Engagement").closest("li")!;
    expect(within(engagementItem).getByText("Proxy Voting")).toBeInTheDocument();
  });

  it("flags an orphaned (unresolved-parent) capability", () => {
    render(<CapabilityMap view={view} />);
    const mysteryItem = screen.getByText("Mystery").closest("li")!;
    expect(within(mysteryItem).getByText(/orphaned/)).toBeInTheDocument();
  });

  it("renders a truncation hint (not a crash) when children are absent at the fetch boundary", () => {
    // A deep node whose `children` field was not fetched (undefined) but has a non-zero subtree.
    const truncated: CapabilityMapView = {
      roots: [
        { id: "c-deep", name: "Deep Function", level: 1, orphaned: false, descendantCount: 7, counts: { ...z } },
      ],
    };
    render(<CapabilityMap view={truncated} />);
    expect(screen.getByText("Deep Function")).toBeInTheDocument();
    expect(screen.getByText(/\+7 deeper capabilities \(not shown\)/)).toBeInTheDocument();
  });
});
