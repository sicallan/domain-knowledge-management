import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import { useEffect, useRef } from "react";
import { buildStylesheet, layoutNameFor, type LayoutMode } from "./encoding";

export interface GraphCanvasProps {
  /** The renderer elements from the adapter (`toCytoscapeElements`). */
  elements: ElementDefinition[];
  layout: LayoutMode;
  /** The currently selected node id (shows selected styling). */
  selectedId?: string | null;
  /** Fired when a node is tapped — the `selectEntry` event (criterion 3). */
  onSelect: (id: string) => void;
}

/**
 * The Cytoscape canvas (UI-3.4) — a **thin** mount over the renderer. It holds no graph
 * model: it renders the adapter's elements, wires node-tap → `onSelect`, applies selected
 * styling, and re-runs the layout when data/layout change. Pan/zoom is Cytoscape-native
 * (criterion 2). Swapping Cytoscape for Sigma.js (ADR-0005) replaces only this file — the
 * `toCytoscapeElements` adapter and the `onSelect` contract stay put.
 */
export function GraphCanvas({ elements, layout, selectedId, onSelect }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  // Keep the latest onSelect without re-mounting the canvas.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Mount once with the initial elements/layout.
  useEffect(() => {
    if (!containerRef.current) return undefined;
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: buildStylesheet(),
      layout: { name: layoutNameFor(layout) },
    });
    cy.on("tap", "node", (event) => onSelectRef.current(event.target.id()));
    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
    // Mount-once: subsequent element/layout/selection changes are handled below.
  }, []);

  // Sync elements + re-run layout when the data or layout mode changes.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().remove();
    cy.add(elements);
    cy.layout({ name: layoutNameFor(layout) }).run();
  }, [elements, layout]);

  // Reflect the current selection.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().removeClass("selected");
    if (selectedId) cy.getElementById(selectedId).addClass("selected");
  }, [selectedId]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Knowledge graph canvas"
      className="h-[60vh] w-full rounded-md border border-border bg-background"
    />
  );
}
