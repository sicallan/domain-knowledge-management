import { gql } from "urql";

/**
 * The Vendor Coverage Map's only data source (UI-D3): the gateway's `coverageMap` projection —
 * L1 capabilities (rows) × vendor products (columns), each cell a RAG coverage status, plus the
 * per-row roll-up and a weighted summary. `vendor` scopes the columns to one vendor and `domain`
 * scopes the rows to one domain (both honoured server-side by the projector); `rowKind` is reserved
 * (defaults to `BusinessCapability`).
 */
export const COVERAGE_MAP_QUERY = gql`
  query CoverageMap($vendor: String, $domain: String, $rowKind: String) {
    coverageMap(vendor: $vendor, domain: $domain, rowKind: $rowKind) {
      columns {
        id
        name
        vendor
      }
      rows {
        id
        name
        kind
        status
        gap
        domain
      }
      cells {
        rowId
        columnId
        status
        coveragePercentage
        mappingId
        gaps
      }
      summary {
        totalCapabilities
        covered
        partial
        uncovered
        coveragePercentage
      }
    }
  }
`;
