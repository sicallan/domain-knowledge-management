import { gql } from "urql";

/** Root candidates for the initial canvas view — the subdomains (L1 anchors). */
export const ROOTS_QUERY = gql`
  query ExplorerRoots($limit: Int) {
    entries(type: "Subdomain", limit: $limit) {
      items {
        id
      }
    }
  }
`;

/**
 * The subgraph around a node — the canvas's only data source (UI-D3). `data` carries the
 * type-specific fields incl. `name`, normalised to a node label by the hook.
 */
export const TRAVERSE_QUERY = gql`
  query ExplorerTraverse($startNodeId: ID!, $direction: Direction!, $maxDepth: Int!, $includeEdges: Boolean!) {
    traverse(
      startNodeId: $startNodeId
      direction: $direction
      maxDepth: $maxDepth
      includeEdges: $includeEdges
    ) {
      nodes {
        id
        type
        lifecycleStatus
        data
      }
      edges {
        id
        sourceId
        targetId
        relationshipType
      }
      truncated
    }
  }
`;
