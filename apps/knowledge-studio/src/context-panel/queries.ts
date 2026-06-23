import { gql } from "urql";

/**
 * One round-trip for the panel (UI-D3): the entry itself plus its immediate neighbourhood
 * (`traverse` depth 1) for the relationship list. Nothing more — the panel inspects one
 * entry, it does not refetch the world.
 */
export const ENTRY_QUERY = gql`
  query EntryDetail($id: ID!) {
    entry(id: $id) {
      id
      type
      version
      lifecycleStatus
      validFrom
      validTo
      confidence
      data
      evidencedBy {
        source
        location
        fetchedAt
        sourceAuthority
      }
    }
    traverse(startNodeId: $id, direction: BOTH, maxDepth: 1, includeEdges: true) {
      nodes {
        id
        type
        data
      }
      edges {
        id
        sourceId
        targetId
        relationshipType
      }
    }
  }
`;
