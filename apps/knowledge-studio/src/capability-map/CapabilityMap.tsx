import type { CapabilityCounts, CapabilityMapView, CapabilityNode } from "./useCapabilityMap";

export interface CapabilityMapProps {
  view: CapabilityMapView;
}

const COUNT_LABELS: [keyof CapabilityCounts, string][] = [
  ["rules", "rule"],
  ["invariants", "invariant"],
  ["decisions", "decision"],
  ["concepts", "concept"],
  ["realisations", "realisation"],
];

/** "2 rules · 1 decision" — the non-zero attached-evidence counts, or "" when a leaf has none. */
function countSummary(counts: CapabilityCounts): string {
  return COUNT_LABELS.filter(([key]) => counts[key] > 0)
    .map(([key, noun]) => `${counts[key]} ${noun}${counts[key] === 1 ? "" : "s"}`)
    .join(" · ");
}

function CapabilityTreeNode({ node }: { node: CapabilityNode }) {
  const summary = countSummary(node.counts);
  return (
    <li>
      <div className="flex flex-wrap items-baseline gap-x-2 py-1">
        <span className="font-medium">{node.name}</span>
        {node.orphaned && (
          <span className="text-xs text-muted-foreground" title="declared parent could not be resolved">
            (orphaned)
          </span>
        )}
        {summary && <span className="text-sm text-muted-foreground">— {summary}</span>}
      </div>
      {node.children.length > 0 && (
        <ul className="ml-4 border-l border-border/60 pl-3">
          {node.children.map((child) => (
            <CapabilityTreeNode key={child.id} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * The presentational Capability Map: the BusinessCapability hierarchy as a nested tree, each node
 * annotated with the non-zero counts of evidence attached to it (governing rules, constraining
 * invariants, related decisions/concepts, realising flows/services). Pure — renders the view it is
 * given. Orphans (unresolved parent) appear as roots, flagged.
 */
export function CapabilityMap({ view }: CapabilityMapProps) {
  return (
    <ul aria-label="Capability hierarchy" className="flex flex-col gap-1">
      {view.roots.map((root) => (
        <CapabilityTreeNode key={root.id} node={root} />
      ))}
    </ul>
  );
}
