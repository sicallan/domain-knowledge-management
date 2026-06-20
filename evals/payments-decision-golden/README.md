# Payments decision golden dataset (Phase 2.3)

A small, labelled Payments **decision** dataset used to benchmark the decision extraction pass
(feature 03) against the [D-P2.1](../../docs/phase-2/decisions.md) accuracy floors — the **strictest
bars in the system** (Decision auto-merge-band precision ≥ 0.92, a wrong auto-merged Decision being
the costliest failure). It is the regression gate for the decision prompt templates (D-P2.7).

## Layout

- `dataset.json` — the labels: `expectedEntities` (type + name) and `expectedRelationships`
  (relationshipType + source/target **names**), plus document descriptors. It also carries an
  `extractionScript` block (doc → section → entities/relationships) that the **deterministic**
  (no-network) eval replays through the `FakeGateway`; the unchanged loader ignores that key.
- `documents/*.md` — the source decision docs each descriptor points at: a decision log, a refund
  policy, and a settlement rulebook.

The loader (`dkm_enrichment.evaluation.load_golden_dataset`) reads each descriptor's `file` as the
document content, so the source text stays in plain Markdown under version control. Each descriptor's
`title` is also the chunk's section title, so the `extractionScript` keys on it.

## What it covers

- **Five Decisions** (`Authorise Payment`, `Score Transaction Risk`, `Apply Card Block`, `Approve
  Refund`, `Select Settlement Route`) spanning `automated` and `hybrid` `decisionType`s, with their
  `inputs`/`outcomes`/`owner` populated — enough support (≥ 5) to gate the Decision per-type floor.
- **All six decision-specific edge types** — `evaluates`, `consumes`, `constrainedBy`, `triggeredBy`,
  `produces`, `realizedBy`. `realizedBy → Service` is a deliberate **cross-pass recall gap**: Service
  is an L2/L3 endpoint that arrives in Phase 3, so it is labelled but never scripted (D-P2.5) — the
  only labelled-but-unscripted edges in the set.
- **The Decision-vs-Rule boundary** (feature 03 §11): the adversarial rule *"Block the card after
  three consecutive CVV failures"* reads like a decision but is labelled a `Rule`; a genuine
  `Decision` (`Apply Card Block`) **evaluates** it rather than collapsing the two.

The deterministic eval asserts the D-P2.1 decision floors overall, the Decision per-type floor, and
that every decision-specific relationship type is reported. The opt-in real-Claude leg
(`pytest -m llm`, needs `ANTHROPIC_API_KEY`) runs the same labels through the live gateway.
