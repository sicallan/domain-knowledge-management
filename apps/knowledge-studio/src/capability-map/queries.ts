import { gql } from "urql";

/**
 * The Capability Map's data source (UI-D3): the gateway's `capabilityMap` projection — the
 * BusinessCapability hierarchy with per-node attached-evidence counts. GraphQL can't express a
 * self-recursive selection, so `children` is expanded to a fixed depth (5 levels — the extracted
 * hierarchy is ~3); `root` scopes to one root subtree.
 */
export const CAPABILITY_MAP_QUERY = gql`
  query CapabilityMap($root: String) {
    capabilityMap(root: $root) {
      roots {
        ...CapNode
        children {
          ...CapNode
          children {
            ...CapNode
            children {
              ...CapNode
              children { ...CapNode }
            }
          }
        }
      }
    }
  }

  fragment CapNode on CapabilityNode {
    id
    name
    level
    orphaned
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
