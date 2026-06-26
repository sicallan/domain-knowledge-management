import { createServer } from "node:http";
import { createYoga } from "graphql-yoga";
import { createGraphQLContext } from "./context";
import { schema } from "./schema";
import { resolveSeedJsonlPaths, SEED_JSONL_PATHS, seedInMemoryGraph } from "./seed";

/**
 * Build a Yoga handler over a freshly seeded in-memory backend (UI-D2). The same
 * `schema` + `createGraphQLContext` the resolver tests use — the dev server is the
 * real read path on an ephemeral store. The seed source defaults to the environment
 * (`DKM_JSONL` / `DKM_DATA_DIR`, see {@link resolveSeedJsonlPaths}) so docker-compose can
 * point the gateway at a processed domain's JSONL; with no env it serves the Payments demo.
 * Swapping `seedInMemoryGraph({ graph: neo4j })` (D-P1.2) makes this production-bound with no
 * schema/resolver change.
 */
export async function buildYoga(jsonlPaths: readonly string[] = resolveSeedJsonlPaths()) {
  const backend = await seedInMemoryGraph({ jsonlPaths });
  return createYoga({
    schema,
    // Dev-fake identity per request (UI-D8) until Feature 03 derives it from auth.
    context: () => createGraphQLContext(backend),
    graphqlEndpoint: "/graphql",
  });
}

async function main(): Promise<void> {
  const jsonlPaths = resolveSeedJsonlPaths();
  const yoga = await buildYoga(jsonlPaths);
  const server = createServer(yoga);
  const port = Number(process.env.PORT ?? 4000);
  const isDemo =
    jsonlPaths.length === SEED_JSONL_PATHS.length &&
    jsonlPaths.every((path, index) => path === SEED_JSONL_PATHS[index]);
  const source = isDemo ? "bundled Payments demo" : `${jsonlPaths.length} JSONL file(s)`;
  server.listen(port, () => {
    console.log(`▶ @dkm/api-gateway → http://localhost:${port}/graphql (seeded from ${source})`);
  });
}

// This module is a dev entry (run via `tsx src/server.ts`), never imported by the app
// surface — so booting on load is intentional.
void main();
