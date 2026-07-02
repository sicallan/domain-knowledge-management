import { BlockDiagram, type BlockNode } from "../components/BlockDiagram";
import type { CapabilityCounts } from "../capability-map/useCapabilityMap";
import type { BusinessArchitectureNode, BusinessArchitectureView } from "./useBusinessArchitecture";

/** How the EA tree is drawn: an indented outline, or a nested containment block diagram. */
export type BusinessArchitectureMode = "outline" | "block";

export interface BusinessArchitectureProps {
  view: BusinessArchitectureView;
  mode?: BusinessArchitectureMode;
}

/** 1 domain · 2 capability · 3 function · 4 activity — the disposition, always conveyed in words. */
const LEVEL_LABELS: Record<number, string> = {
  1: "domain",
  2: "capability",
  3: "function",
  4: "activity",
};

const COUNT_LABELS: [keyof CapabilityCounts, string][] = [
  ["rules", "rule"],
  ["invariants", "invariant"],
  ["decisions", "decision"],
  ["concepts", "concept"],
  ["realisations", "realisation"],
];

function countBadges(counts?: CapabilityCounts | null): string[] {
  if (!counts) return [];
  return COUNT_LABELS.filter(([key]) => counts[key] > 0).map(
    ([key, noun]) => `${counts[key]} ${noun}${counts[key] === 1 ? "" : "s"}`,
  );
}

function countSummary(counts?: CapabilityCounts | null): string {
  return countBadges(counts).join(" · ");
}

function levelLabel(level: number): string {
  return LEVEL_LABELS[level] ?? `level ${level}`;
}

/** Map an EA node onto the generic {@link BlockNode}: classified nodes carry a confidence heat + ring. */
function toBlockNode(node: BusinessArchitectureNode): BlockNode {
  const classified = node.origin === "classified";
  const confidence = typeof node.confidence === "number" ? node.confidence : null;
  const meta = [
    levelLabel(node.level),
    classified && confidence !== null ? `${Math.round(confidence * 100)}%` : node.framework,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    id: node.id,
    label: node.name,
    meta: meta || undefined,
    badges: classified ? countBadges(node.counts) : [],
    heat: classified ? confidence : null,
    accent: classified,
    children: node.children?.map(toBlockNode),
  };
}

function BusinessArchitectureTreeNode({ node }: { node: BusinessArchitectureNode }) {
  const children = node.children ?? [];
  // `children` absent (not just empty) marks the fetch-depth boundary — there may be more below.
  const truncated = node.children === undefined && node.descendantCount > 0;
  const summary = countSummary(node.counts);
  const confidence =
    typeof node.confidence === "number" ? `${Math.round(node.confidence * 100)}%` : null;
  return (
    <li>
      <div className="flex flex-wrap items-baseline gap-x-2 py-1">
        <span className="font-medium">{node.name}</span>
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {levelLabel(node.level)}
        </span>
        {node.origin === "reference" && node.framework && (
          <span className="text-xs text-muted-foreground">· {node.framework}</span>
        )}
        {confidence && (
          <span className="text-xs text-muted-foreground">· {confidence} confidence</span>
        )}
        {summary && <span className="text-sm text-muted-foreground">— {summary}</span>}
      </div>
      {node.rationale && (
        <p className="max-w-2xl text-sm italic text-muted-foreground">{node.rationale}</p>
      )}
      {children.length > 0 && (
        <ul className="ml-4 border-l border-border/60 pl-3">
          {children.map((child) => (
            <BusinessArchitectureTreeNode key={child.id} node={child} />
          ))}
        </ul>
      )}
      {truncated && (
        <p className="ml-4 pl-3 text-xs text-muted-foreground">
          +{node.descendantCount} deeper {node.descendantCount === 1 ? "node" : "nodes"} (not shown)
        </p>
      )}
    </li>
  );
}

/**
 * The presentational Business-Architecture model: the curated spine (domain → capability) with raw
 * capabilities classified beneath it as functions / activities, each classified node showing its
 * rationale and confidence. Below the tree, the **rejected** and **unclassified** buckets are
 * surfaced honestly (with counts) rather than silently dropped. Pure — renders the view it is given.
 */
export function BusinessArchitecture({ view, mode = "outline" }: BusinessArchitectureProps) {
  const { domains, rejected, unclassified } = view;
  return (
    <div className="flex flex-col gap-5">
      {mode === "block" ? (
        <BlockDiagram
          nodes={domains.map(toBlockNode)}
          ariaLabel="Business-architecture block diagram"
          initialDepth={3}
        />
      ) : (
        <ul aria-label="Business-architecture model" className="flex flex-col gap-1">
          {domains.map((domain) => (
            <BusinessArchitectureTreeNode key={domain.id} node={domain} />
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:gap-8">
        <section
          role="group"
          aria-label={`Rejected — ${rejected.count}`}
          className="flex flex-col gap-1"
        >
          <h2 className="text-sm font-semibold">Rejected — {rejected.count}</h2>
          {rejected.count === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing rejected.</p>
          ) : (
            <ul className="text-sm text-muted-foreground">
              {rejected.byReason.map(({ reason, count }) => (
                <li key={reason}>
                  {reason} — {count}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          role="group"
          aria-label={`Unclassified — ${unclassified.count}`}
          className="flex flex-col gap-1"
        >
          <h2 className="text-sm font-semibold">Unclassified — {unclassified.count}</h2>
          {unclassified.count === 0 ? (
            <p className="text-sm text-muted-foreground">Everything classified.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Capabilities awaiting a classification pass:
              </p>
              <ul className="text-sm text-muted-foreground">
                {unclassified.names.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
              {unclassified.count > unclassified.names.length && (
                <p className="text-xs text-muted-foreground">
                  +{unclassified.count - unclassified.names.length} more (not shown)
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
