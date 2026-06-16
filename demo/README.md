# Payments demo — docs → knowledge graph → decisions-first Domain Map

One command turns a slice of Payments documentation into a **living Domain Map** where the
**decisions** — the highest-value, regulation-bearing nodes — are first-class and traced back
to the document they came from.

```bash
pnpm demo
```

Outputs (regenerated each run):
- [`payments-domain-map.puml`](payments-domain-map.puml) — the generated PlantUML.
- `payments-domain-map.png` — the rendered map (best-effort, via the `plantuml/plantuml`
  Docker image; the `.puml` renders anywhere if Docker isn't present).

> `domain-map.puml` / `domain-map.png` are the earlier **hand-drawn** sketch, kept for
> comparison. The point of the demo is that the machine now draws the richer one.

## The story (for a 2-minute show)

1. **Before / after.** Open [`evals/payments-golden/documents/authorisation.md`](../evals/payments-golden/documents/authorisation.md)
   — plain prose. Then show the generated map: the same knowledge as a structured, navigable
   diagram, with **no manual modelling**.
2. **Decisions are first-class.** Four decisions surface as gold hexagons — *Authorise Payment,
   Score Transaction Risk, Net Settlement, Approve Refund* — each wired to the rules,
   reference-data and invariants it governs. That's where compliance and business logic
   concentrate, and the platform makes them visible and traceable.
3. **It already hangs together across documents.** Cross-document links emerge automatically —
   `Authorise Payment → triggers → Score Transaction Risk`, `Refund → derivedFrom → Settlement`
   — so four separate documents become one coherent domain.
4. **Solid base.** Every box is evidenced (it knows which document each fact came from) and the
   map is produced by the **real pipeline**, not a mock.

## What's real vs. staged

- **Real**: the `GraphLoader` (spec 003) populating the graph, and the **Query Interface**
  (`@dkm/query`, spec 006) that reads it — the *same* API that will feed the product UI builds
  this map (`listEntries` for nodes, `traverse` for relationships).
- **Pre-baked (deterministic)**: `payments-*.jsonl` is the intermediate format the LLM
  extraction step emits, captured here so the demo is fast, reproducible and needs no API key
  or network. Swapping in live extraction is a flag, not a rewrite.

## How it evolves

The exporter ([`src/domain-map-exporter.ts`](src/domain-map-exporter.ts)) is the seed of the
real **Domain Map View** (feature #9, spec 007 View Projection Engine): a projection consumer
over the same query primitives. The demo is the thin, visible end of the Phase 1 slice
(connector → extraction → loader → graph → **query → view → diagram**).
