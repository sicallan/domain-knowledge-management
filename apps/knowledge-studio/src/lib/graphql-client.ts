import { Client, cacheExchange, fetchExchange } from "urql";

/**
 * The urql GraphQL client (UI-D7 pin: urql). The endpoint is read from the environment
 * so the **same shell** points at the live `@dkm/api-gateway` (Feature 02) by default, or
 * at the MSW worker in standalone dev (UI-D2) — no component change either way.
 */
export function createGraphQLClient(url = import.meta.env.VITE_GRAPHQL_ENDPOINT ?? "/graphql"): Client {
  return new Client({
    url,
    exchanges: [cacheExchange, fetchExchange],
  });
}
