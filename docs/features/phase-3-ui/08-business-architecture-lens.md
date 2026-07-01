# Feature 08 — Business-Architecture Lens (normalised EA model over the raw capabilities)

> Tracking issue: **#86** (sequel to #84 Capability Map / PR #85). Governing decision:
> [ADR-0009](../../adr/0009-business-architecture-classification.md). This is a **vertical slice**:
> new schema → an enrichment LLM pass → a projector → gateway → a UI lens toggle. Coverage Map / Gap
> Analysis remain the following view-screen features (09/10).

## 1. Feature

- **Name**: The **Business-Architecture Lens** — a second lens on the Capability Map that shows the
  extracted capability catalogue *normalised into a business architect's model*: ~11 curated L1
  enterprise domains → curated L2 capabilities → the raw capabilities classified beneath them as L3
  functions / L4 activities, with implementation-detail and generic mentions explicitly **rejected**
  rather than shown as top-level capabilities. It answers *"what does a mature (BIZBOK/APQC) business
  architecture of this domain look like?"* — versus the raw hierarchy's *"what did we literally
  extract?"*
- **Why**: the raw Capability Map (#84) is faithful but unusable as navigation — on the stewardship
  corpus, **222 near-synonym roots**, controls/policies/ESG themes mixed with capabilities, and
  implementation detail ("Vanguard Investor Choice", "AGM Engagement") promoted to top level. The
  business-architect normalisation ([business-architecture-review.md](../../../feedback/business-architecture-review.md))
  is the target exemplar.
- **Specs/ADRs**: [ADR-0009](../../adr/0009-business-architecture-classification.md) (the design);
  [ADR-0008](../../adr/0008-projection-first-vs-synthesis.md) (why judgment materialises but the tree
  projects); [spec 001 Schema](../../../specs/001-schema-module.md) (two new inventory types);
  [spec 005 Enrichment](../../../specs/005-enrichment-extraction-pipeline.md) (the classification pass,
  mirroring `normalise`); [spec 007 View Projection](../../../specs/007-view-projection-engine.md)
  (the projector); [spec 011 GraphQL](../../../specs/011-graphql-api-layer.md) (the query); the
  Capability Map screen (#84 / PR #85, extended here).

## 2. Summary & scope

> **Raw lens vs EA lens — the deliberate split.** The **Raw hierarchy** (shipped, #84) shows the
> capabilities *as literally extracted* (`level`/`parentCapability`) — a pure, deterministic
> projection that asserts nothing new. The **Normalised EA model** shows those same capabilities
> *classified into a curated reference architecture* — new, evidenced, correctable judgment. Raw =
> what the documents said; EA = what a business architect makes of it. Both project from the **same**
> raw graph; neither overwrites the other (ADR-0009 decision 1).

Three strata, three provenances (ADR-0009):

1. **Raw `BusinessCapability`** — extracted evidence, untouched.
2. **Curated reference spine** — a new `ReferenceCapability` type, ~11 L1 + ~45–60 L2 nodes,
   hand-authored + versioned in the repo, grounded in APQC PCF / BIZBOK. Provenance = "curated".
3. **`CapabilityClassification`** — one per raw capability, emitted by an LLM **batch pass**, placing
   it in the spine (`assignedParent`, `assignedLevel` 2–4) or **rejecting** it (generic mention /
   control / policy), each with `rationale` + `confidence` + evidence back to the raw capability.

The **EA tree is a deterministic projection** over spine + classifications (same shape as
`capability-map-projector`). The UI is a **toggle** on the existing Capability Map screen.

**In scope**
- **Schema**: `reference-capability.schema.json` + `capability-classification.schema.json`
  (+ validation tests first).
- **Reference-spine seed**: the ~11 L1 + ~45–60 L2 spine as versioned JSONL, transcribed from the
  target exemplar (curated data, not extracted).
- **Enrichment pass**: `dkm classify-architecture` (working name) — classifies raw capabilities into
  the spine via the LLM gateway; emits `CapabilityClassification` JSONL; **fake gateway golden fixture
  for CI**, real-Claude leg **env-gated** (CI contract). Idempotent + incremental (skips already-classified).
- **Projector**: `business-architecture-projector.ts` in `@dkm/view-projection` — assembles the EA
  tree from spine + classifications; surfaces `unclassified` and `rejected` buckets honestly.
- **Gateway**: a `businessArchitecture` query + SDL types + resolver + seed registration.
- **UI**: a **lens toggle** on the Capability Map screen (Raw ↔ EA), reusing the tree component; the EA
  lens shows domain → capability → function/activity, per-node rejected/unclassified counts, and (on a
  node) its classification rationale/confidence.
- Run the whole slice **for real on the stewardship corpus**.

**Out of scope**
- **In-app override** of a classification (flip rejected↔placed, re-parent) — the entity supports it;
  the affordance is a fast-follow. First-cut corrections edit the classification JSONL (as `normalise`
  output was corrected).
- **L3 curation** and **multi-framework** spines (APQC *and* BIZBOK as parallel lenses) — additive
  later (OCP).
- **Enterprise / L0** cross-domain view (org → shared-vs-dedicated capabilities) — Phase 6 / L0.
- Any change to the **raw** Capability Map projection or the extraction pipeline.

## 3. Dependencies

- **Upstream**: `@dkm/schema` (new types via the additive extension point); `modules/enrichment`
  (gateway, `normalise` pattern, golden-eval harness); `@dkm/view-projection` (`ViewProjector`,
  `capability-map-projector` to mirror); the gateway view-registration (`views.ts` / `seed.ts`); the
  Capability Map screen + tree component (PR #85).
- **Unblocks**: the "curated spine + classification pass + projector" **pattern** for future reference
  lenses (DDD subdomain map, APQC process lens); the in-app override UI; a strategic/L0 roll-up.
- **Cross-feature**: shares the Capability Map screen's tree component and route; the Context panel
  ([Feature 06](06-context-panel.md)) can later show a node's classification detail via `selectEntry`.

## 4. Applied decisions

| Decision | How it constrains this feature |
|---|---|
| **ADR-0008 (projection-first)** | Materialise only the *judgment* (classifications); the tree is a projection. A PR that materialised the whole tree would violate this. |
| **ADR-0009** | Layer alongside (no raw rewrite); curated L1+L2 spine; classification = first-class entity; batch pass; toggle UI; override deferred. |
| **TDD (rule 1)** | Schema-validation tests before schemas; golden-dataset test before the classification pass; projector unit tests before the projector; component test before the toggle. |
| **OCP (rule 2)** | New types via the schema extension point; new projector by implementing `ViewProjector`; spine + dispositions evolve additively. Core pipeline/projection engine stay closed. |
| **CI contract** | CI green fake-backed: schema tests, projector tests, the classification pass over a **fake gateway** golden fixture, component tests over MSW. The **real-Claude** classification leg auto-skips unless `ANTHROPIC_API_KEY` is set; its real-world run is a tracked follow-up. |
| **British spelling** | `Normalised`, `Realisation`, `Behaviour`, `prioritise` in all identifiers/copy. |
| **Evidence + versioning** | Every `CapabilityClassification` carries evidence (→ raw capability) + `confidence`; every `ReferenceCapability` carries curated provenance; both bi-temporal via `base-entry`. |

## 5. User stories

- *As a business/domain architect, I want the messy extracted catalogue normalised into ~11 domains
  and their capabilities, so that I can navigate the domain the way an EA model is actually organised.*
- *As an architect, I want implementation detail and generic mentions ("Vanguard Investor Choice")
  explicitly **rejected with a reason**, not shown as top-level capabilities, so that the model is
  credible.*
- *As a reviewer, I want to see **why** each capability was placed or rejected (rationale + confidence),
  so that I can trust — or correct — the normalisation.*
- *As any user, I want to **toggle** between the raw hierarchy and the normalised model on the same
  screen, so that I can see what was extracted vs what it means.*
- *As a maintainer, I want the LLM judgment run as a **reviewable batch pass** and the view to stay a
  deterministic projection, so that reads are fast, reproducible, and the ledger stays honest (ADR-0008/0009).*
- *As a new user, I want capabilities added after the last pass to show as **unclassified/pending**,
  so that the model is honest about freshness rather than silently dropping them.*

## 6. Acceptance criteria (Given/When/Then)

1. **Schemas gate** — *Given* the two new schemas, *then* valid `ReferenceCapability` /
   `CapabilityClassification` records pass and malformed ones (bad `level`, unknown `disposition`,
   missing `subject`) are rejected by the validation tests.
2. **Spine seeds** — *Given* the reference-spine JSONL, *when* loaded, *then* ~11 L1 + ~45–60 L2
   `ReferenceCapability` nodes exist with correct `level`/`parent`/curated provenance.
3. **Classification pass (fake)** — *Given* a fixture of raw capabilities + a **fake gateway**, *when*
   the pass runs, *then* it emits one `CapabilityClassification` per input matching the golden fixture
   (placements + rejections + assigned levels), and re-running is **idempotent** (already-classified
   skipped).
4. **Rejection is explicit** — *Given* an implementation-detail/generic input (e.g. "Vanguard Investor
   Choice"), *then* its classification is `disposition: rejected` with a non-empty `rationale`, and it
   does **not** appear as a placed node in the tree.
5. **Projector assembles the tree** — *Given* spine + classifications, *when* projected, *then* the EA
   tree is domains → L2 → classified L3/L4 leaves; counts are correct; `rejected` and `unclassified`
   surface as their own buckets (not silently dropped); output is deterministic and stable across runs.
6. **Gateway query** — *Given* the `businessArchitecture` query against the seeded graph, *then* it
   returns the projected tree matching the projector, and the SDL snapshot is updated.
7. **Toggle** — *Given* the Capability Map screen, *when* the user switches to "Normalised EA model",
   *then* the EA tree renders from the `businessArchitecture` query; switching back shows the raw
   hierarchy; the tree component is shared.
8. **Node detail** — *Given* a placed node, *then* its classification `rationale`/`confidence` are
   viewable; *given* the rejected/unclassified buckets, their counts are shown.
9. **CI green, no secrets** — *Given* CI, *then* schema/projector/component tests + the fake-gateway
   pass all pass; the real-Claude classification leg auto-skips without `ANTHROPIC_API_KEY`.
10. **a11y** — *Given* the EA lens, *then* the toggle is a labelled control, tree nodes are
    keyboard-navigable, disposition is conveyed in text (not colour alone), and an axe smoke passes.

## 7. Interface contracts

**Schema (indicative — finalised test-first):**

```jsonc
// reference-capability.schema.json  (L1/L2 curated spine)
{ "type": "ReferenceCapability",
  "name": "string",                 // e.g. "Investment Management" | "Portfolio Management"
  "level": 1,                       // 1 = enterprise domain, 2 = capability
  "parent": "string?",              // parent ReferenceCapability name/id (L2 → L1)
  "framework": "BIZBOK|APQC",       // provenance of the curated node
  "description": "string?" }

// capability-classification.schema.json  (one per raw BusinessCapability)
{ "type": "CapabilityClassification",
  "subject": "string",              // raw BusinessCapability id (evidence)
  "disposition": "placed|rejected",
  "assignedParent": "string?",      // ReferenceCapability id (when placed)
  "assignedLevel": 3,               // 2|3|4 when placed (4 = activity); omitted when rejected
  "rejectionReason": "generic-mention|control|policy|duplicate|not-a-capability?",
  "rationale": "string",            // the LLM's justification (always present)
  "confidence": 0.0 }               // 0–1
```

**Gateway query (indicative):**

```graphql
query BusinessArchitecture($root: String, $minConfidence: Float) {
  businessArchitecture(root: $root, minConfidence: $minConfidence) {
    domains {
      id name                                   # L1
      capabilities {                            # L2 (curated)
        id name
        children { id name level disposition confidence rationale counts { rules decisions } children { id name level } }
      }
    }
    rejected   { count byReason { reason count } }
    unclassified { count }                      # extracted after the last pass
  }
}
```

New/changed files (indicative):
- `schemas/inventory/L1/reference-capability.schema.json`, `schemas/inventory/L1/capability-classification.schema.json` (+ validation tests).
- `schemas/seed/reference-spine.jsonl` (curated) — or `demo/`-style location for loadable seed.
- `modules/enrichment/src/dkm_enrichment/architecture_classification.py` + prompt + golden fixture + `cli.py` wiring.
- `modules/view-projection/src/business-architecture-projector.ts` (+ types, index, test).
- `apps/api-gateway/src/schema/views.ts` (`businessArchitecture`) + `src/seed.ts` + SDL snapshot + resolver test.
- `apps/knowledge-studio/src/capability-map/` — lens toggle + EA query/hook; `mocks/browser.ts` fixture; tests.

## 8. TDD test plan (write these first)

- **Schema** — valid/invalid `ReferenceCapability` + `CapabilityClassification` (criterion 1).
- **Classification pass** — golden fixture over the **fake gateway**: placements, an explicit rejection
  (4), idempotent re-run (3); a small **real-Claude** golden eval gated on `ANTHROPIC_API_KEY` (9).
- **Projector** — `business-architecture-projector.test.ts`: tree assembly + counts (5), rejected +
  unclassified buckets surfaced (5), determinism/cycle-safety (mirror `capability-map-projector.test`).
- **Gateway** — extend `resolvers.test.ts`: `businessArchitecture` matches the projector (6); SDL snapshot.
- **UI** — toggle switches lenses and reuses the tree (7); node rationale/confidence + bucket counts
  (8); over MSW with no backend; axe + keyboard (10).

## 9. Task breakdown

1. [x] Schemas + validation tests (test-first): `ReferenceCapability`, `CapabilityClassification`.
2. [x] Curated reference-spine seed JSONL (L1 + L2) transcribed from the exemplar; loader/seed wiring.
3. [x] Classification pass in `modules/enrichment` (prompt, gateway call, emission), fake-gateway golden
   fixture, idempotent/incremental; `dkm classify-architecture` CLI wiring; env-gated real eval.
4. [x] `business-architecture-projector.ts` (+ types/index/tests) — assemble from spine + classifications.
5. [x] Gateway `businessArchitecture` query/resolver + seed registration + SDL snapshot + resolver test.
6. [x] UI lens toggle on the Capability Map screen (Raw ↔ EA); EA query/hook; node detail + bucket
   counts; MSW fixture; component/a11y tests.
7. [ ] Run the pass on the **stewardship corpus**; review the classification JSONL; QA the toggle.

## 10. OCP extension points

- **Open**: the **in-app override** (edit a classification → re-project); a **second framework** spine
  (APQC alongside BIZBOK) as a parallel `ReferenceCapability` set selectable in the lens; **L3 curation**
  (promote recurring L3s into the spine); new **dispositions**/`rejectionReason`s; a **strategic/L0**
  roll-up over the domains; richer visual tree behind the same query.
- **Closed**: the raw Capability Map projection (untouched); the `businessArchitecture` query contract
  (owned by projector + gateway); the extraction pipeline; the schema extension mechanism.

## 11. Open questions / risks

- **Spine authoring source.** First cut transcribes the L1+L2 spine from
  [business-architecture-review.md](../../../feedback/business-architecture-review.md) (one exemplar). Is
  that the ratified reference model, or do we want a maintainer pass to align it explicitly to APQC PCF
  / BIZBOK before it becomes seed data? *Recommend*: transcribe now, mark `framework`, refine additively.
- **Classification quality + review loop.** The pass is opinionated; the JSONL must be reviewed before
  the EA lens is "trusted". First cut = eyeball the diff (like `normalise`); the override UI is the
  proper loop (deferred). Track a real-corpus review as a follow-up.
- **`assignedParent` reference style.** Mirror the raw `parentCapability` convention (name/alias
  resolution, per `capability-map-projector`) so the projector logic is shared; confirm id-vs-name.
- **Domain-agnosticism.** The spine is Payments/asset-management-specific. Keep it as *seed/reference
  data* (swappable per domain), never hard-coded in the projector — the projector must stay
  domain-agnostic (reads whatever spine is loaded).
- **Stale processor image.** `./scripts/dkm` predates recent CLI additions; a new `classify-architecture`
  subcommand needs `docker compose build processor` (or run via the local venv, as `normalise` was).
