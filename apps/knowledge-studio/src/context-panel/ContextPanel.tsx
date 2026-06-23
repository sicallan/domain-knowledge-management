import { useShellStore } from "../store";
import { EntryDetail } from "./EntryDetail";
import { EvidenceList } from "./EvidenceList";
import { RelationshipList } from "./RelationshipList";
import { useEntry } from "./useEntry";

export interface ContextPanelProps {
  /** The entry to inspect (the store's current selection); null renders nothing. */
  entryId: string | null;
}

/**
 * The Context Panel content (UI-3.6) — fills the shell's slide-out slot. It fetches the
 * selected entry + its immediate relationships (UI-D3) and renders the full detail,
 * navigable relationships (each hop appends a breadcrumb), and evidence/provenance. Honest
 * loading/not-found states; the slide-out chrome + focus management belong to the slot.
 */
export function ContextPanel({ entryId }: ContextPanelProps) {
  const { entry, relationships, loading, error, notFound } = useEntry(entryId);
  const navigateTo = useShellStore((state) => state.navigateTo);

  if (!entryId) return null;
  if (loading) return <p className="text-sm text-muted-foreground">Loading entry…</p>;
  if (error) {
    return (
      <p role="alert" className="text-sm">
        Could not load the entry: {error}
      </p>
    );
  }
  if (notFound || !entry) {
    return <p className="text-sm text-muted-foreground">No entry found for “{entryId}”.</p>;
  }

  return (
    <div className="space-y-6">
      <EntryDetail entry={entry} />

      <section aria-label="Relationships">
        <h3 className="mb-2 text-sm font-semibold">Relationships</h3>
        <RelationshipList
          groups={relationships}
          onNavigate={(target) => navigateTo({ id: target.id, type: target.type, label: target.label })}
        />
      </section>

      <section aria-label="Evidence and provenance">
        <h3 className="mb-2 text-sm font-semibold">Evidence &amp; provenance</h3>
        <EvidenceList items={entry.evidencedBy} />
      </section>
    </div>
  );
}
