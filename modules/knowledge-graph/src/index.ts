export * from "./port";
export { InMemoryGraphAdapter } from "./in-memory-adapter";
export type { InMemoryGraphOptions } from "./in-memory-adapter";
// The contract suite imports vitest, so it is exposed via its own module path
// (`@dkm/knowledge-graph/src/contract`) and intentionally not re-exported here.
