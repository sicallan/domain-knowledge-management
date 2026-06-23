import { formatDate } from "./format";
import type { EvidenceItem } from "./useEntry";

/**
 * The evidence/provenance list (criterion 4) — the "the document is the evidence; the entry
 * is the assertion" rule made visible. Renders the entry's own `evidencedBy`.
 */
export function EvidenceList({ items }: { items: EvidenceItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No evidence recorded.</p>;
  }
  return (
    <ul aria-label="Evidence" className="space-y-2">
      {items.map((item, index) => (
        <li key={`${item.source}-${index}`} className="rounded-md border border-border p-2 text-sm">
          <div className="break-words font-medium">{item.source}</div>
          <div className="text-muted-foreground">
            {formatDate(item.fetchedAt)}
            {item.sourceAuthority ? ` · ${item.sourceAuthority}` : ""}
          </div>
          {item.location && <div className="text-xs text-muted-foreground">{item.location}</div>}
        </li>
      ))}
    </ul>
  );
}
