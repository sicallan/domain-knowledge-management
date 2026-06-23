import { render, screen } from "@testing-library/react";
import type { ElementDefinition } from "cytoscape";
import { describe, expect, it, vi } from "vitest";

/**
 * `GraphCanvas` mounts the real Cytoscape renderer, which needs a canvas jsdom lacks — so
 * Cytoscape is mocked. The test asserts the component (a) hands the adapter elements to the
 * renderer and (b) wires node-tap → `onSelect` (criteria 1 + 3). The graph *logic* is
 * covered by the pure adapter/encoding tests.
 */

interface TapEvent {
  target: { id: () => string };
}

const mocks = vi.hoisted(() => {
  const handlers: Record<string, (event: TapEvent) => void> = {};
  const fakeCy = {
    on: (event: string, _selector: string, cb: (event: TapEvent) => void) => {
      handlers[event] = cb;
    },
    elements: () => ({ remove: () => {} }),
    add: () => {},
    layout: () => ({ run: () => {} }),
    nodes: () => ({ removeClass: () => {} }),
    getElementById: () => ({ addClass: () => {} }),
    destroy: () => {},
  };
  return { handlers, factory: vi.fn((_options: { elements: ElementDefinition[] }) => fakeCy) };
});

vi.mock("cytoscape", () => ({ default: mocks.factory }));

const { GraphCanvas } = await import("../src/explorer/GraphCanvas");

const elements: ElementDefinition[] = [
  { group: "nodes", data: { id: "n1", label: "Node 1", layer: "L1", colour: "#000" } },
  { group: "nodes", data: { id: "n2", label: "Node 2", layer: "L3", colour: "#111" } },
  { group: "edges", data: { id: "e1", source: "n1", target: "n2", label: "belongsTo" } },
];

describe("GraphCanvas", () => {
  it("renders an application landmark and mounts the renderer with the elements (criterion 1)", () => {
    render(<GraphCanvas elements={elements} layout="force" onSelect={() => {}} />);
    expect(screen.getByRole("application", { name: "Knowledge graph canvas" })).toBeInTheDocument();
    expect(mocks.factory).toHaveBeenCalledTimes(1);
    const options = mocks.factory.mock.calls[0]?.[0];
    expect(options?.elements).toBe(elements);
  });

  it("emits onSelect with the node id on tap (criterion 3)", () => {
    const onSelect = vi.fn();
    render(<GraphCanvas elements={elements} layout="force" onSelect={onSelect} />);
    mocks.handlers.tap?.({ target: { id: () => "n1" } });
    expect(onSelect).toHaveBeenCalledWith("n1");
  });
});
