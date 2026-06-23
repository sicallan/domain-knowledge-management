import { createServer } from "node:http";
import { createYoga } from "graphql-yoga";
import { createGraphQLContext } from "./context";
import { schema } from "./schema";
import { seedInMemoryGraph } from "./seed";

/**
 * Build a Yoga handler over a freshly seeded in-memory backend (UI-D2). The same
 * `schema` + `createGraphQLContext` the resolver tests use — the dev server is the
 * real read path on an ephemeral store. Swapping `seedInMemoryGraph({ graph: neo4j })`
 * (D-P1.2) makes this production-bound with no schema/resolver change.
 */
export async function buildYoga() {
  const backend = await seedInMemoryGraph();
  return createYoga({
    schema,
    // Dev-fake identity per request (UI-D8) until Feature 03 derives it from auth.
    context: () => createGraphQLContext(backend),
    graphqlEndpoint: "/graphql",
  });
}

async function main(): Promise<void> {
  const yoga = await buildYoga();
  const server = createServer(yoga);
  const port = Number(process.env.PORT ?? 4000);
  server.listen(port, () => {
    console.log(`▶ @dkm/api-gateway → http://localhost:${port}/graphql (seeded in-memory backend)`);
  });
}

// This module is a dev entry (run via `tsx src/server.ts`), never imported by the app
// surface — so booting on load is intentional.
void main();
