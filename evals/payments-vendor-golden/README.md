# Payments vendor/project golden dataset (Phase 3.2)

A small, labelled Payments **vendor/project realisation** dataset used to benchmark the
vendor-mapping extraction pass (feature 02) against the
[D-P3.1](../../docs/phase-3/decisions.md) L2 accuracy floors. The headline gate is **coverage-claim
precision** — a false "covered" turns a real hole green on the Coverage Map and corrupts
build-vs-buy, so it carries the **strictest auto-merge bar in the L2 layer** (≥ 0.92). It is the
regression gate for the `vendor.v1.md` prompt template.

## Layout

- `dataset.json` — the labels: `expectedEntities` (type + name), `expectedRelationships`
  (relationshipType + source/target **names**), and `expectedCoverage` (vendorCapability → the true
  `coverage`), plus document descriptors. It also carries an `extractionScript` block (doc → section
  → entities/relationships) that the **deterministic** (no-network) eval replays through the
  `FakeGateway`; the unchanged loader ignores that key.
- `documents/*.md` — the source docs each descriptor points at: three vendor datasheets/coverage
  matrices (Acme, Globex, Initech) and one project-spec page.

The loader (`dkm_enrichment.evaluation.load_golden_dataset`) reads each descriptor's `file` as the
document content, so the source text stays in plain Markdown under version control. Each descriptor's
`title` is also the chunk's section title, so the `extractionScript` keys on it. A
`VendorCapabilityMapping` carries no `name`, so it is keyed by its `vendorCapability`.

## What it covers

- **Three VendorProducts** (`Acme Pay Gateway`, `Globex Fraud Suite`, `Settlement Pro`), each with a
  `fulfils` edge paired with graded `VendorCapabilityMapping`s (D-P3.7 — never a bare fulfils).
- **Six VendorCapabilityMappings** spanning the full coverage vocabulary — `full`, `partial`, and an
  explicit `none` (`Globex Chargeback Automation`, the adversarial "stated non-coverage" that must
  **not** be claimed covered). Six is enough support (≥ 5) to gate the per-type and coverage floors.
- **Coverage normalisation** (D-P3.2): the source prose ("fully supports", "partial", "none") is
  normalised to the locked `{full, partial, none}` enum before emit.
- **Three ProjectSpecs** across all three `specType`s (`requirement`/`design`/`ADR`), each with a
  `specifies` edge to a `DomainConcept`.
- **The cross-pass placeholders** — `realizesVendorCap → VendorCapabilityMapping` (its `Service`
  source is an L3 endpoint not extractable here) and `satisfiedBy ← RegulatoryRequirement` (a
  regulatory source, not extractable here). Both are labelled but never scripted (the deliberate
  recall gap, mirroring the decision golden's `realizedBy → Service`, D-P2.5) — the only
  labelled-but-unscripted edges in the set.

The deterministic eval asserts the D-P3.1 L2 entity/relationship floors overall, the
`VendorCapabilityMapping` per-type floor, and — separately — the coverage-claim precision floors. The
opt-in real-Claude leg (`pytest -m llm`, needs `ANTHROPIC_API_KEY`) runs the same labels through the
live gateway.
