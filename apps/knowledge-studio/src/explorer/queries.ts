import { gql } from "urql";

/**
 * Root candidates for the initial canvas view, for **one** anchor type. The hook probes a
 * priority-ordered list of anchor types ({@link ROOT_SEED_TYPES}) and seeds from the first that
 * has entries — so a Subdomain-less domain (a raw `dkm process` run) still renders. The port
 * lists one type at a time, hence the `$type` arg rather than an "all entries" query.
 */
export const ROOTS_QUERY = gql`
  query ExplorerRoots($type: String, $limit: Int) {
    entries(type: $type, limit: $limit) {
      items {
        id
      }
    }
  }
`;

/**
 * The list/table's only data source (UI-3.5 / UI-D3): the gateway's cursor-paginated,
 * sortable, filterable `entries` listing. `data` carries the type-specific fields incl.
 * `name`; the rest are the base-entry columns. The table queries this **per type** (the port
 * lists one type at a time) and merges client-side.
 */
export const ENTRIES_QUERY = gql`
  query ExplorerEntries(
    $type: String
    $filter: [PropertyFilterInput!]
    $sort: SortInput
    $limit: Int
    $cursor: String
  ) {
    entries(type: $type, filter: $filter, sort: $sort, limit: $limit, cursor: $cursor) {
      items {
        id
        type
        lifecycleStatus
        validFrom
        confidence
        data
      }
      cursor
      hasMore
      totalCount
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
