import {
  createGraphQLContext,
  schema,
  seedInMemoryGraph,
  type SeededBackend,
} from "@dkm/api-gateway";
import { graphql as executeGraphQL } from "graphql";
import { http, HttpResponse } from "msw";

/**
 * MSW handler that **executes the gateway's own GraphQL schema** over the shared
 * `seedInMemoryGraph()` (UI-D2). The standalone-dev/test "mock backend" is therefore the
 * *real* read path on the *same* seed the gateway and its resolver tests use — there is no
 * second, drift-prone fixture set, and the SDL is honoured by construction.
 */

export const GRAPHQL_ENDPOINT = "/graphql";
/** Match the GraphQL endpoint on any origin (relative `/graphql` resolves to an absolute URL). */
const GRAPHQL_URL_PATTERN = /\/graphql$/;

let backendPromise: Promise<SeededBackend> | null = null;
function getBackend(): Promise<SeededBackend> {
  backendPromise ??= seedInMemoryGraph();
  return backendPromise;
}

interface GraphQLRequestBody {
  query: string;
  variables?: Record<string, unknown>;
  operationName?: string;
}

export const handlers = [
  http.post(GRAPHQL_URL_PATTERN, async ({ request }) => {
    const { query, variables, operationName } = (await request.json()) as GraphQLRequestBody;
    const backend = await getBackend();
    const result = await executeGraphQL({
      schema,
      source: query,
      variableValues: variables,
      operationName,
      contextValue: createGraphQLContext(backend),
    });
    return HttpResponse.json(result);
  }),
];
