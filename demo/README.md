# Payments demo — sources → knowledge graph → domain map + behaviour & decisions

One command turns a slice of Payments source material — **prose docs *and* a structured JSON
export** — into a **living knowledge graph**, then draws two pictures from it: the **Domain Map**
(static structure) and the **Behaviour & Decisions** flow (runtime behaviour + the decisions it
invokes, with full traceability). The **decisions** — the highest-value, regulation-bearing nodes —
are first-class throughout.

```bash
pnpm demo
```

It runs the real pipeline end to end:

```
sources → [connectors] → CanonicalDocuments → [extraction, captured] → JSONL
        → [GraphLoader] → graph → [Query Interface] → [View Projection Engine] → views
```

Outputs (regenerated each run):
- [`payments-domain-map.json`](payments-domain-map.json) — the **UI-ready `DomainMapView`**: the
  exact structure the product UI/API will consume (subdomains → bounded contexts → counts +
  cross-context relationships).
- [`payments-domain-map.puml`](payments-domain-map.puml) / `.png` — the **Phase 1 Domain Map**
  (static L1 structure), rendered best-effort via the `plantuml/plantuml` Docker image.
- [`payments-behaviour-flow.puml`](payments-behaviour-flow.puml) / `.png` — **NEW (Phase 2):** the
  **Card Authorisation Flow** the behaviour pass (2.2) extracts — its ordered steps, the event
  that triggers it, the events/state-transitions its steps emit — and the **decisions** those
  steps invoke (decision pass, 2.3), each shown with its full traceability (the rules it
  evaluates, the data it consumes, the invariants that constrain it, what triggers it, what it
  produces). The `.puml` renders anywhere if Docker isn't present.

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
6. **From structure to behaviour (Phase 2).** The second picture
   ([`payments-behaviour-flow.puml`](payments-behaviour-flow.puml)) shows the platform now models
   *runtime behaviour*, not just static structure: the **Card Authorisation Flow** runs
   `Validate Card → Check Funds → Score Risk → Authorise → Publish Outcome`, two of those steps
   **invoke decisions**, and each decision carries its **full traceability** — *Authorise Payment*
   evaluates a rule, consumes card-status data, is constrained by the available-balance invariant,
   is triggered by `AuthorisationRequested`, and produces the `PaymentAuthorised` event and the
   `pending → authorised` state transition. That is exactly the evidence a compliance officer needs,
   generated from prose.

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

Two demo-local exporters read back through the same Query Interface:
[`src/domain-map-exporter.ts`](src/domain-map-exporter.ts) consumes the projected `DomainMapView`
(feature #9, spec 007); [`src/behaviour-flow-exporter.ts`](src/behaviour-flow-exporter.ts) renders
the Phase 2 behaviour + decision subgraph (a dedicated Behaviour Flow *view* is Feature 2.4). The
demo is the thin, visible end of the slice (connectors → extraction → loader → graph → **query →
view → diagram**) — now spanning Phase 1 structure **and** the Phase 2 behaviour & decision layer.
