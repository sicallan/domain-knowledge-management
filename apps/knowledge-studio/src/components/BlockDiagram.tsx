import { type CSSProperties, useState } from "react";

/**
 * A node in a {@link BlockDiagram}. Deliberately shape-agnostic so the diagram renders *any* tree —
 * callers map their domain nodes onto this. Only `id`, `label` and `children` drive structure; the
 * rest are optional visual hints.
 */
export interface BlockNode {
  id: string;
  label: string;
  /** A short secondary line under the label (e.g. "capability · 90%"). */
  meta?: string;
  /** Tiny chips rendered on the tile (e.g. attached-evidence counts). */
  badges?: string[];
  /** 0–1 heat: tints the tile on the primary scale (e.g. classifier confidence). */
  heat?: number | null;
  /** Marks the tile as distinct from its container (e.g. derived vs curated) with a ring. */
  accent?: boolean;
  children?: BlockNode[];
}

export interface BlockDiagramProps {
  /** The roots of the tree to render. */
  nodes: BlockNode[];
  /** Accessible name for the diagram region. */
  ariaLabel: string;
  /**
   * Tiles at this depth (0-based) or deeper start **collapsed** to a "+N nested" summary, so a big
   * tree opens to a legible overview. Omit to expand everything.
   */
  initialDepth?: number;
  /** Called when a tile is activated (click / Enter). When set, the tile label becomes a button. */
  onSelect?: (id: string) => void;
}

/** Total descendants under a node (for the collapsed "+N" summary). */
function descendantCount(node: BlockNode): number {
  return (node.children ?? []).reduce((n, child) => n + 1 + descendantCount(child), 0);
}

function tileStyle(node: BlockNode, depth: number): CSSProperties {
  if (typeof node.heat === "number") {
    // Heat tiles read as a primary-tinted heat-map (e.g. low → faint, high → saturated).
    const alpha = 0.08 + Math.max(0, Math.min(1, node.heat)) * 0.2;
    return { backgroundColor: `hsl(var(--primary) / ${alpha.toFixed(3)})` };
  }
  // Otherwise deepen a neutral muted tint with nesting, so containment reads at a glance.
  const alpha = Math.min(0.06 + depth * 0.06, 0.3);
  return { backgroundColor: `hsl(var(--muted) / ${alpha.toFixed(3)})` };
}

function BlockDiagramNode({
  node,
  depth,
  initialDepth,
  onSelect,
}: {
  node: BlockNode;
  depth: number;
  initialDepth: number;
  onSelect?: (id: string) => void;
}) {
  const children = node.children ?? [];
  const hasChildren = children.length > 0;
  const [open, setOpen] = useState(depth < initialDepth);

  return (
    <li>
      <div
        className={`flex flex-col gap-2 rounded-md border border-border p-2.5 ${
          node.accent ? "ring-1 ring-primary/40" : ""
        }`}
        style={tileStyle(node, depth)}
      >
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {hasChildren && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={`${open ? "Collapse" : "Expand"} ${node.label}`}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <span aria-hidden="true">{open ? "▾" : "▸"}</span>
            </button>
          )}
          {onSelect ? (
            <button
              type="button"
              onClick={() => onSelect(node.id)}
              className="rounded font-medium hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              {node.label}
            </button>
          ) : (
            <span className="font-medium">{node.label}</span>
          )}
          {node.meta && <span className="text-xs text-muted-foreground">{node.meta}</span>}
          {node.badges?.map((badge) => (
            <span
              key={badge}
              className="rounded-full border border-border px-1.5 text-[0.7rem] text-muted-foreground"
            >
              {badge}
            </span>
          ))}
        </div>

        {hasChildren && open && (
          <ul className="flex flex-wrap gap-2">
            {children.map((child) => (
              <BlockDiagramNode
                key={child.id}
                node={child}
                depth={depth + 1}
                initialDepth={initialDepth}
                onSelect={onSelect}
              />
            ))}
          </ul>
        )}
        {hasChildren && !open && (
          <p className="text-xs text-muted-foreground">+{descendantCount(node)} nested</p>
        )}
      </div>
    </li>
  );
}

/**
 * A nested **containment** block diagram — the capability-map idiom enterprise architects draw,
 * where each parent tile visually *contains* its children (rather than a connector tree/indented
 * list). Pure and generic: it renders whatever {@link BlockNode} tree it is handed, so it serves the
 * business-architecture model today and any other hierarchy (raw capabilities, a DDD subdomain map)
 * tomorrow. Tiles carry an optional `heat` tint (for a confidence/coverage heat-map), an `accent`
 * ring, a `meta` line and count `badges`; deep branches collapse to a "+N" summary.
 *
 * Structure is an accessible nested list (`ul`/`li`); the collapse control and optional select are
 * real buttons, so the diagram is keyboard-operable and screen-reader legible — not a canvas.
 */
export function BlockDiagram({ nodes, ariaLabel, initialDepth, onSelect }: BlockDiagramProps) {
  const depthLimit = initialDepth ?? Number.POSITIVE_INFINITY;
  return (
    <ul aria-label={ariaLabel} className="flex flex-col gap-2">
      {nodes.map((node) => (
        <BlockDiagramNode
          key={node.id}
          node={node}
          depth={0}
          initialDepth={depthLimit}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}
