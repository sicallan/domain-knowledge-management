# @dkm/knowledge-graph — Graph Persistence Port (spec 002)

The abstract **graph persistence port** every storage adapter implements, an
adapter-agnostic **contract test suite**, and two adapters (D-P1.2):

- **`InMemoryGraphAdapter`** — unit/contract/dev; no external service. The **CI gate**.
- **`Neo4jGraphAdapter`** — the Phase 1 integration target; satisfies the *identical*
  `GraphPort` and passes the *identical* contract suite.

No graph-DB API leaks above the port — the production database choice stays an ADR
(deferred), so Neo4j is an integration target, not a commitment.

See [specs/002-graph-persistence-port.md](../../specs/002-graph-persistence-port.md).

## Layout

- `src/port.ts` — `GraphPort` (nodes, edges, traversal, transactions, event log).
- `src/contract.ts` — `runGraphPortContractTests(name, factory)`: the suite every adapter passes.
- `src/in-memory-adapter.ts` — in-memory adapter with bi-temporal history + event log.
- `src/neo4j-adapter.ts` — Neo4j adapter + `neo4jAdapterFromEnv()` (returns `null` when unset).
- `test/graph-port.contract.test.ts` — runs the suite against **both** adapters.

## Running the Neo4j contract suite locally (opt-in)

The Neo4j variant **auto-skips unless `NEO4J_URI` is set** — it is never a CI gate and
needs no external service by default. To exercise it locally:

```bash
docker run -d --rm -p 7687:7687 -e NEO4J_AUTH=neo4j/testpassword neo4j:5

NEO4J_URI=bolt://localhost:7687 NEO4J_USER=neo4j NEO4J_PASSWORD=testpassword \
  pnpm exec vitest run modules/knowledge-graph
```

The same env vars also enable the Neo4j-backed `GraphLoader` integration test in
`@dkm/loaders` (`modules/loaders/test/graph-loader.int.test.ts`).
