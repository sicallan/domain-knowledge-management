# ADR-0008 — Projection-first: derive views, materialise new knowledge only at three triggers

- **Status**: Accepted
- **Date**: 2026-06-29
- **Deciders**: Platform architecture (maintainer + agent, in design review for issue #84)
- **Related**: [CLAUDE.md](../../CLAUDE.md) ("views interpret the graph; agents reason over the graph"), [spec 007 View Projection](../../specs/007-view-projection-engine.md), [ADR-0001](./0001-intermediate-jsonl-vs-okf-interchange.md) (typed JSONL is the assertion ledger), issue #84 (Capability Map — the first application of this principle)

## Context

The platform structures source material into a graph of evidenced, typed **assertions** and then
exposes interpretations of that graph. A recurring design question is whether a new interpretation
(a DDD subdomain map, an EA capability map, a coverage matrix, an impact report…) should be:

- **projected** — computed at read time from the existing graph (a *view*), or
- **synthesised** — materialised as new nodes/edges written back into the graph (new *assertions*).

This surfaced concretely in #84. The "Capability Map" we wanted appeared to require a new
synthesis pass that clusters entities into invented containers. On inspection, the structure
already existed in the extracted `BusinessCapability` hierarchy — so the view was a pure
re-interpretation, not new knowledge. Getting the default wrong is costly in both directions:
needless synthesis pollutes the assertion ledger with derived, hard-to-evidence nodes and adds
provenance/idempotency/cache burden; needless projection (recomputing expensive non-deterministic
judgments on every read) is slow and non-reproducible.

## Decision

**Default to read-time projection. Materialise new knowledge only when one of three triggers
fires:**

1. **Expensive / non-deterministic judgment that must be computed once** — e.g. LLM merge
   decisions (entity `normalise`). Persist so it isn't re-run per read and stays reproducible.
2. **The interpretation must become an addressable node** — something with its own id,
   provenance, lifecycle, inbound edges, and the ability to be corrected/versioned (an impact
   report, a synthesised decision).
3. **It must feed back into the graph for agents to reason over** (impact, contradiction,
   correction — Phases 4–6).

Until a trigger fires, an interpretation is a **`ViewProjector`** (spec 007), not a new assertion.

## Consequences

- **The graph stays an honest ledger** of evidenced assertions; views can't drift from the evidence
  because they *are* the evidence, re-shaped. Multiple lenses (DDD subdomain map, EA capability map)
  project from the *same* raw material without competing materialisations.
- **#84 shrank** from an LLM synthesis pass (with provenance/idempotency/backup machinery) to a
  deterministic `CapabilityMapProjector` + screen. Duplicate-collapse stays in `normalise`
  (legitimately trigger #1).
- **This is not "projections forever."** The platform's headline value — impact assessable,
  contradictions corrected, strategic alignment — is genuine synthesis (Phases 4–6) and *will*
  materialise nodes, justified by triggers #2/#3. The discipline is the **default**, not a ban.
- **Reviewability:** every future "view vs new-node" choice cites this ADR; a PR that materialises
  knowledge should name which trigger justifies it.
