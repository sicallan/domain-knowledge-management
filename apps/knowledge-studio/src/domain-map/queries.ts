import { gql } from "urql";

/**
 * The Domain Map's only data source (UI-D3): the gateway's `domainMap` projection — subdomains →
 * bounded contexts (with concept/service counts and their relationships) → cross-context
 * relationships. `subdomain` scopes the view to one subdomain (id or name); `depth` is reserved.
 */
export const DOMAIN_MAP_QUERY = gql`
  query DomainMap($subdomain: String, $depth: Int) {
    domainMap(subdomain: $subdomain, depth: $depth) {
      subdomains {
        id
        name
        contexts {
          id
          name
          conceptCount
          serviceCount
          relationships {
            targetContextId
            type
          }
        }
      }
      crossContextRelationships {
        source
        target
        type
        strength
      }
    }
  }
`;
