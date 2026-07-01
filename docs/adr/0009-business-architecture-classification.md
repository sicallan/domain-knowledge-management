# ADR-0009 — Business-architecture lens: curated reference spine + materialised LLM classification, projected

- **Status**: Accepted
- **Date**: 2026-07-01
- **Deciders**: Platform architecture (maintainer + agent, in design review — grilling session)
- **Related**: [ADR-0008](./0008-projection-first-vs-synthesis.md) (this is its **first genuine synthesis
  application** — the case 0008 explicitly anticipated), [spec 001 Schema](../../specs/001-schema-module.md),
  [spec 005 Enrichment](../../specs/005-enrichment-extraction-pipeline.md) (the `normalise` precedent),
  [spec 007 View Projection](../../specs/007-view-projection-engine.md) (`capability-map-projector`),
  the Capability Map (#84 / PR #85), [business-architecture-review.md](../../feedback/business-architecture-review.md)
  (the target exemplar that seeded this)

## Context

The Capability Map (#84) faithfully renders the extracted `BusinessCapability` hierarchy
(`level` / `parentCapability`) as a read-time projection — it asserts nothing new (ADR-0008). But
*the raw hierarchy is the problem*: on the real stewardship corpus it yields **222 near-synonym
roots** ("Active Ownership" / "Active Ownership and Stewardship" / "Active Stewardship"),
implementation detail promoted to top-level capabilities ("Vanguard Investor Choice", "AGM
Engagement", "Voting Alert Issuance"), and controls/policies/ESG-themes mixed in with genuine
capabilities. The extraction is *faithful* — those things really are in the source — but it is not a
business architecture.

Fed the same catalogue, an LLM asked for a Business-Architect (BIZBOK / TOGAF / APQC) view produced
a clean **4-level** normalisation — ~11 L1 enterprise domains → L2 capabilities → L3 functions → L4
activities — that resonates far more as *the* navigable model
([business-architecture-review.md](../../feedback/business-architecture-review.md)). The design question:
how should that view be incorporated — its own materialised model, generated on-demand via LLM, or
something else?

This is precisely the **synthesis** case ADR-0008 anticipated: *"the platform's headline value —
impact assessable, contradictions corrected, strategic alignment — is genuine synthesis (Phases 4–6)
and will materialise nodes, justified by triggers #2/#3. The discipline is the default, not a ban."*
Turning a messy catalogue into a normalised architecture is a **non-deterministic semantic judgment**
(ADR-0008 trigger #1) whose per-item decisions must be **addressable and correctable** (trigger #2).
It cannot be a deterministic projection the way the raw Capability Map is.

## Decision

Incorporate the business-architecture view as a **layer alongside** the raw graph — new, evidenced,
correctable knowledge — decomposed so that only the *judgment* is materialised and the *presentation*
stays a projection:

1. **Layer alongside, never a rewrite.** The raw extracted `BusinessCapability` nodes are left
   untouched as evidence. The EA model is *new knowledge* that references them. "Vanguard Investor
   Choice" is not deleted or re-parented in place — it is *classified* (here: rejected as a generic
   industry mention), and that classification can be disagreed with. Multiple lenses (BIZBOK vs APQC
   vs a DDD subdomain map) can coexist over the *same* raw material.

2. **A curated, versioned reference spine — not emergent clustering.** The stable skeleton (the ~11
   L1 enterprise domains **and** the ~45–60 L2 capabilities) is **hand-authored, versioned repo data**
   grounded in APQC PCF / BIZBOK, modelled as a distinct **`ReferenceCapability`** entity type
   (`level` 1/2 + `parent`, provenance = "curated"). Curating down to **L2** — not L1-only — is
   deliberate: the disease we cure is synonym sprawl and inconsistent structure; an emergent L2 tier
   reintroduces exactly that one level down. L3/L4 stay emergent (genuinely corpus-specific leaves).

3. **Materialise classifications, not a tree.** An LLM **batch classification pass** (in
   `modules/enrichment`, the home of the gateway, `normalise`, and the golden-eval harness) maps each
   raw `BusinessCapability` into the spine and emits **one first-class `CapabilityClassification`
   entity** per capability: `{ subject, assignedParent, assignedLevel (2|3|4), disposition
   (placed | rejected), rationale, confidence, evidence }`. This is the only genuinely new persisted
   judgment. It is materialised because it is expensive/non-deterministic (**trigger #1**, exactly like
   `normalise`) *and* because each decision must be an addressable node with its own provenance,
   lifecycle, and override path (**trigger #2**).

4. **The EA tree is a deterministic projection** over (reference spine + classifications) — the same
   pattern as `CapabilityMapProjector`. ADR-0008's projection-first default is thus honoured on the
   *presentation* even though the *judgment* is synthesised: we materialise the minimum (atomic,
   evidenced classification facts) and project the rest (the tree render).

5. **Produced by an explicit batch pass, not triggered by the view.** The pass is run on demand (like
   `normalise` — a reviewable, diffable JSONL artifact an architect eyeballs before trusting); the
   view never invokes the LLM. New capabilities arriving unclassified surface as "unclassified /
   pending" (honest freshness) until the next pass.

6. **Surfaced as a lens toggle on the Capability Map screen** — "Raw hierarchy" ↔ "Normalised EA
   model" — same tree component, different query. The before/after juxtaposition (222 roots → 11
   domains, same data) *is* the platform's value proposition made visible.

7. **Corrections, first cut, are by editing the classification JSONL** (as the `normalise` output was
   corrected); the in-app override affordance is a fast-follow. The entity supports override from day
   one — only the UI is deferred.

## Consequences

- **The ledger stays honest.** Three separately-provenanced strata: raw extracted capabilities
  (evidence, from source docs), the curated reference spine (authored, cites APQC/BIZBOK), and
  classifications (LLM opinions, each with rationale + confidence + evidence back to a raw capability).
  No stratum is silently overwritten by another.
- **Reproducibility.** A fixed spine means only *leaf assignments* can vary run-to-run, not the
  navigation skeleton — the difference between a model you can trust and "generate and hope."
- **Incremental.** Ingest a doc → extract N new capabilities → classify only those N; the rest of the
  model is stable.
- **A compelling, honest demo** and a real diagnostic: the toggle shows the mess and the normalisation
  side by side on identical data.
- **OCP.** The spine evolves additively; new dispositions, a second framework's spine (APQC vs BIZBOK
  as parallel `ReferenceCapability` sets), and the override UI are all extensions, not modifications.
- **Costs accepted.** We author and maintain an opinionated reference taxonomy (one framework's view);
  we own a new LLM pass with its own golden eval (CI stays green fake-backed, the real-Claude leg is
  env-gated per the CI contract); and classification quality needs review before the model is trusted.
- **Sets the pattern** for future "normalise into a reference model" lenses (e.g. a DDD subdomain map,
  an APQC process lens) — each is a curated spine + a classification pass + a projector, never an
  in-place rewrite of the evidence.
