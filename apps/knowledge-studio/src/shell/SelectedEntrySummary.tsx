import type { SelectedEntry } from "../store";

/**
 * A minimal selected-entry summary shown in the context-panel slot. UI-3.6 replaces this
 * with the full detail + relationships + evidence; for now it closes the explore→inspect
 * loop so a canvas selection is visibly reflected.
 */
export function SelectedEntrySummary({ entry }: { entry: SelectedEntry }) {
  return (
    <dl className="space-y-3 text-sm">
      <div>
        <dt className="text-xs uppercase text-muted-foreground">Name</dt>
        <dd className="font-medium">{entry.label ?? entry.id}</dd>
      </div>
      {entry.type && (
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Type</dt>
          <dd>{entry.type}</dd>
        </div>
      )}
      <div>
        <dt className="text-xs uppercase text-muted-foreground">ID</dt>
        <dd className="font-mono text-xs">{entry.id}</dd>
      </div>
      <p className="pt-2 text-muted-foreground">
        Full detail, relationships and evidence arrive in UI-3.6.
      </p>
    </dl>
  );
}
