import type { RelationshipGroup, RelationshipRow } from "./useEntry";

export interface RelationshipListProps {
  groups: RelationshipGroup[];
  /** Navigate to a related entry (criterion 3) — emits a `navigateTo`, appending a breadcrumb hop. */
  onNavigate: (target: RelationshipRow["target"]) => void;
}

/**
 * The relationship list (criteria 2 + 3): incoming/outgoing edges grouped by relationship
 * type, each row a button that navigates the panel to the related entry.
 */
export function RelationshipList({ groups, onNavigate }: RelationshipListProps) {
  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">No relationships.</p>;
  }
  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.relationshipType}>
          <h4 className="text-xs uppercase text-muted-foreground">{group.relationshipType}</h4>
          <ul className="mt-1 space-y-1">
            {group.rows.map((row) => (
              <li key={row.edgeId}>
                <button
                  type="button"
                  onClick={() => onNavigate(row.target)}
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-border px-2 py-1 text-left text-sm hover:bg-muted"
                >
                  <span>
                    <span className="sr-only">{row.direction} </span>
                    <span aria-hidden="true" className="text-muted-foreground">
                      {row.direction === "outgoing" ? "→ " : "← "}
                    </span>
                    {row.target.label}
                  </span>
                  {row.target.type && (
                    <span className="shrink-0 text-xs text-muted-foreground">{row.target.type}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
