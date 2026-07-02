import { gql } from "urql";

/**
 * The Business-Architecture lens's data source (Feature 08, #86): the gateway's
 * `businessArchitecture` projection — the curated ReferenceCapability spine (L1 domain → L2
 * capability) with raw capabilities classified beneath it as L3 functions / L4 activities, plus the
 * `rejected` and `unclassified` buckets. As with the raw Capability Map, GraphQL can't express a
 * self-recursive selection, so `children` is expanded to a fixed depth (the EA tree tops out at L4,
 * so five levels is ample); anything deeper is surfaced as a "+N deeper" hint via `descendantCount`.
 */
export const BUSINESS_ARCHITECTURE_QUERY = gql`
  query BusinessArchitecture($root: String, $minConfidence: Float) {
    businessArchitecture(root: $root, minConfidence: $minConfidence) {
      domains {
        ...BANode
        children {
          ...BANode
          children {
            ...BANode
            children {
              ...BANode
              children { ...BANode }
            }
          }
        }
      }
      rejected {
        count
        byReason { reason count }
      }
      unclassified {
        count
        names
      }
    }
  }

  fragment BANode on BusinessArchitectureNode {
    id
    name
    level
    origin
    framework
    confidence
    rationale
    descendantCount
    counts {
      rules
      invariants
      decisions
      concepts
      realisations
    }
  }
`;
