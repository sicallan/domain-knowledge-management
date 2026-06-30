import { gql } from "urql";

/**
 * The Capability Map's data source (UI-D3): the gateway's `capabilityMap` projection — the
 * BusinessCapability hierarchy with per-node attached-evidence counts. GraphQL can't express a
 * self-recursive selection, so `children` is expanded to a fixed depth (8 levels). Real hierarchies
 * are ~3 levels but messy `parentCapability` chains can run deeper; anything beyond is surfaced as a
 * "+N deeper" hint rather than fetched (the projector still counts it in `descendantCount`). `root`
 * scopes to one root subtree.
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
