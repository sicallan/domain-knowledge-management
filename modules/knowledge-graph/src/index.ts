export * from "./port";
export { InMemoryGraphAdapter } from "./in-memory-adapter";
export type { InMemoryGraphOptions } from "./in-memory-adapter";
export { Neo4jGraphAdapter, neo4jAdapterFromEnv } from "./neo4j-adapter";
export type { Neo4jGraphOptions } from "./neo4j-adapter";
// The contract suite imports vitest, so it is exposed via its own module path
// (`@dkm/knowledge-graph/src/contract`) and intentionally not re-exported here.
