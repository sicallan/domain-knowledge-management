# Phase 1 — Locked Technical Decisions

These decisions were agreed before fleshing out Phase 1 features. They are inputs to every
Phase 1 feature definition. Promote any of these to a full ADR in `docs/adr/` if they prove
contentious or far-reaching.

Phase 1 goal (from [plan.md](../../plan.md)): **one complete vertical slice** — source document
→ intermediate JSONL → loader → graph → queryable **Domain Map** view — plus OCP validation
(a second connector and a second loader).

## D-P1.1 — LLM access: Claude behind a thin gateway
- Extraction (step 1.2) calls **Claude** through a small, provider-agnostic **gateway interface**,
  not the vendor SDK directly.
- Default model **Sonnet 4.6** for extraction; **escalate low-confidence items to Opus 4.8** on re-run.
- The gateway is the only place that knows about a provider/model; swapping later touches no
  pipeline code. Keep it thin — no multi-provider routing yet.
- Model IDs: `claude-sonnet-4-6`, `claude-opus-4-8`.

## D-P1.2 — Graph store: in-memory + Neo4j adapters
- The graph persistence **port** (Phase 0b) gets two adapters in Phase 1:
  - **in-memory** adapter — unit/contract tests and fast local dev (no external service);
  - **Neo4j** adapter — the integration environment and realistic load.
- Two adapters also exercise the OCP port boundary. No graph-DB choice is hard-coded above the port.

## D-P1.3 — Language split: TypeScript slice, Python for extraction
- Connectors (1.1), graph loader (1.3), query interface (1.4), and Domain Map view (1.5) are
  **TypeScript**.
- The **LLM extraction** step (1.2) is **Python**, integrated across the JSONL/process boundary
  (extraction writes intermediate JSONL; the TS loader consumes it — no in-process coupling).
- Matches [CLAUDE.md](../../CLAUDE.md): "TypeScript for schemas/core/API, Python for ML/NLP/agent workloads."

## D-P1.4 — Scope of this exercise: flesh out, don't build
- This round produces **detailed feature definitions** (docs) + **GitHub issues** only.
- No implementation, no scaffolding. Implementation is gated on review of the fleshed-out specs.

## OCP validation targets for Phase 1
- **Second connector**: JSON ingestion adapter — added without modifying the core pipeline.
- **Second loader**: in-memory vector-store stub — added without modifying extraction or the graph loader.
