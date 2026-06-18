# Payments demo — sources → knowledge graph → decisions-first Domain Map

One command turns a slice of Payments source material — **prose docs *and* a structured JSON
export** — into a **living Domain Map** where the **decisions** (the highest-value,
regulation-bearing nodes) are first-class and traced back to where they came from.

```bash
pnpm demo
```

It runs the real pipeline end to end:

```
sources → [connectors] → CanonicalDocuments → [extraction, captured] → JSONL
        → [GraphLoader] → graph → [Query Interface] → [View Projection Engine] → Domain Map
```

Outputs (regenerated each run):
- [`payments-domain-map.json`](payments-domain-map.json) — the **UI-ready `DomainMapView`**: the
  exact structure the product UI/API will consume (subdomains → bounded contexts → counts +
  cross-context relationships).
- [`payments-domain-map.puml`](payments-domain-map.puml) — the generated PlantUML.
- `payments-domain-map.png` — the rendered map (best-effort, via the `plantuml/plantuml`
  Docker image; the `.puml` renders anywhere if Docker isn't present).

> `domain-map.puml` / `domain-map.png` are the earlier **hand-drawn** sketch, kept for
> comparison. The point of the demo is that the machine now draws the richer one.

## The story (for a 3-minute show)

1. **Any source, one pipeline (extensibility).** Two formats are ingested through the **same
   connector registry** — the Payments Markdown docs via the `filesystem` connector, and
   [`sources/payments-reference-data.json`](sources/payments-reference-data.json) via the `json`
   connector — both becoming uniform `CanonicalDocument`s. Adding the JSON format was *one
   registration line* with no change to the pipeline (the Open-Closed Principle, demonstrated).
2. **Before / after.** Open [`evals/payments-golden/documents/authorisation.md`](../evals/payments-golden/documents/authorisation.md)
   — plain prose. Then show the generated map: the same knowledge as a structured, navigable
   model, with **no manual modelling**.
3. **Decisions are first-class.** Four decisions surface as gold hexagons — *Authorise Payment,
   Score Transaction Risk, Net Settlement, Approve Refund* — each wired to the rules,
   reference-data and invariants it governs. That's where compliance and business logic
   concentrate, and the platform makes them visible and traceable.
4. **Structure, not just a picture.** The map is a real projection: `payments-domain-map.json`
   is the same `DomainMapView` the UI will render, with subdomains, bounded contexts, per-context
   counts and cross-context relationships — produced by the **real** View Projection Engine.
5. **It already hangs together.** Cross-context links emerge automatically —
   `Authorise Payment → triggers → Score Transaction Risk`, `Refund → derivedFrom → Settlement` —
   so separate documents become one coherent domain, and every box knows which source it came from.

## What's real vs. captured

- **Real**: the **connector registry** (`@dkm/source-connectors`, spec 004) ingesting two source
  formats; the `GraphLoader` (spec 003) populating the graph; the **Query Interface**
  (`@dkm/query`, spec 006) reading it; and the **View Projection Engine**
  (`@dkm/view-projection`, spec 007) projecting the `DomainMapView` — the *same* APIs that feed
  the product UI.
- **Captured (deterministic)**: `payments-*.jsonl` is the intermediate format the LLM extraction
  step emits, recorded here so the demo is fast, reproducible and needs no API key or network.
  Swapping in live extraction is a flag, not a rewrite.

## How it evolves

The exporter ([`src/domain-map-exporter.ts`](src/domain-map-exporter.ts)) is a demo-local consumer
of the projected `DomainMapView` (feature #9, spec 007). The demo is the thin, visible end of the
Phase 1 slice (connectors → extraction → loader → graph → **query → view → diagram**), now with the
ingestion OCP gate (feature #10, the `json` connector) wired in.
