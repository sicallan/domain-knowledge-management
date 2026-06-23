/**
 * `@dkm/api-gateway` public surface. Intentionally **node-free** (no `http`/`fs` at this
 * entry) so the studio's MSW can import the schema + context to execute queries in-process
 * (UI-D2). The Yoga HTTP server lives in `./server` (a node-only dev entry), imported
 * directly, not re-exported here.
 */
export { schema } from "./schema";
export { sdl } from "./schema/sdl";
export { createGraphQLContext, devQueryContext } from "./context";
export type { GraphQLContext } from "./context";
export { seedInMemoryGraph, SEED_JSONL_PATHS } from "./seed";
export type { SeedOptions, SeededBackend } from "./seed";
