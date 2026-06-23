import { useMemo } from "react";
import { useQuery } from "urql";
import { ENTRY_QUERY } from "./queries";

/** Provenance link shown in the evidence list. */
export interface EvidenceItem {
  source: string;
  location?: string | null;
  fetchedAt: string;
  sourceAuthority?: string | null;
}

/** The full entry detail the panel renders. `data` carries type-specific fields. */
export interface EntryDetail {
  id: string;
  type: string;
  version: string;
  lifecycleStatus: string;
  validFrom: string;
  validTo?: string | null;
  confidence?: number | null;
  data: Record<string, unknown>;
  evidencedBy: EvidenceItem[];
}

/** One related entry, reached by a single edge. */
export interface RelationshipRow {
  edgeId: string;
  direction: "outgoing" | "incoming";
  relationshipType: string;
  target: { id: string; type: string; label: string };
}

/** Relationships grouped by relationship type (criterion 2). */
export interface RelationshipGroup {
  relationshipType: string;
  rows: RelationshipRow[];
}

export interface UseEntryResult {
  entry: EntryDetail | null;
  relationships: RelationshipGroup[];
  loading: boolean;
  error: string | null;
  /** True when the gateway resolved `entry` to `null` (criterion 8 — empty state, not an error). */
  notFound: boolean;
}

interface RawNode {
  id: string;
  type: string;
  data?: { name?: unknown } | null;
}
interface RawEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationshipType: string;
}
interface RawEntryData {
  entry: EntryDetail | null;
  traverse: { nodes: RawNode[]; edges: RawEdge[] };
}

function labelOf(node: RawNode | undefined, id: string): string {
  const name = node?.data?.name;
  return typeof name === "string" ? name : id;
}

function groupRelationships(entryId: string, traverse: RawEntryData["traverse"]): RelationshipGroup[] {
  const nodeById = new Map(traverse.nodes.map((node) => [node.id, node]));
  const groups = new Map<string, RelationshipRow[]>();

  for (const edge of traverse.edges) {
    let direction: "outgoing" | "incoming";
    let otherId: string;
    if (edge.sourceId === entryId) {
      direction = "outgoing";
      otherId = edge.targetId;
    } else if (edge.targetId === entryId) {
      direction = "incoming";
      otherId = edge.sourceId;
    } else {
      continue; // edge between two neighbours — not this entry's relationship
    }
    const other = nodeById.get(otherId);
    const row: RelationshipRow = {
      edgeId: edge.id,
      direction,
      relationshipType: edge.relationshipType,
      target: { id: otherId, type: other?.type ?? "", label: labelOf(other, otherId) },
    };
    const existing = groups.get(edge.relationshipType);
    if (existing) existing.push(row);
    else groups.set(edge.relationshipType, [row]);
  }

  return [...groups.entries()]
    .map(([relationshipType, rows]) => ({ relationshipType, rows }))
    .sort((a, b) => a.relationshipType.localeCompare(b.relationshipType));
}

/**
 * Read one entry + its immediate relationships through the gateway (UI-D3). Returns the
 * detail, the grouped relationship rows, and an honest `notFound` state when the id is
 * unknown (`entry: null`, not an error — criterion 8).
 */
export function useEntry(entryId: string | null): UseEntryResult {
  const [{ data, fetching, error }] = useQuery<RawEntryData>({
    query: ENTRY_QUERY,
    variables: { id: entryId ?? "" },
    pause: !entryId,
  });

  const relationships = useMemo(
    () => (entryId && data?.traverse ? groupRelationships(entryId, data.traverse) : []),
    [entryId, data?.traverse],
  );

  return {
    entry: data?.entry ?? null,
    relationships,
    loading: fetching,
    error: error?.message ?? null,
    notFound: !fetching && !error && data !== undefined && data.entry === null,
  };
}
