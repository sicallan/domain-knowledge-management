# Payments behaviour golden dataset (Phase 2.2)

A small, labelled Payments **behaviour** dataset used to benchmark the behavioural extraction pass
(feature 02) against the [D-P2.1](../../docs/phase-2/decisions.md) accuracy floors. It is the
regression gate for the four behaviour prompt templates (D-P2.7).

## Layout

- `dataset.json` — the labels: `expectedEntities` (type + name) and `expectedRelationships`
  (relationshipType + source/target **names**), plus document descriptors. It also carries an
  `extractionScript` block (doc → section → entities/relationships) that the **deterministic**
  (no-network) eval replays through the `FakeGateway`; the unchanged loader ignores that key.
- `documents/*.md` — the source process docs each descriptor points at: a flow specification, a
  runbook, a sequence diagram, and a two-flow disputes runbook.

The loader (`dkm_enrichment.evaluation.load_golden_dataset`) reads each descriptor's `file` as the
document content, so the source text stays in plain Markdown under version control.

## What it covers

| Behaviour type | Golden instances | Gated per-type (≥ 5)? |
|---|---|---|
| OrchestrationFlow | 5 | yes |
| OrchestrationStep | 22 | yes |
| Event | 10 | yes |
| StateTransition | 4 | reported only |

| Behavioural relationship | Golden instances | Gated per-type (≥ 5)? |
|---|---|---|
| triggers | 5 | yes |
| emits | 5 | yes |
| transitionsTo | 4 | reported only |
| compensates | 2 | reported only |
| invokes (→ Decision) | 4 | reported only |

`invokes(Step → Decision)` edges target Decisions that this pass does **not** extract (Decision
extraction is Feature 03). Per [D-P2.5](../../docs/phase-2/decisions.md) they are routed to the
review queue and counted — never emitted as dangling committed edges — so they show up as a
behavioural-relationship **recall gap** here, not a precision hit. `consumes(Service → Event)`
needs a `Service` entity (L2/L3, Phase 3) and is therefore exercised by the behavioural-schema
unit test rather than this golden set.

## Running the eval

The deterministic eval (`tests/test_behaviour_eval.py`) replays the `extractionScript` through the
`FakeGateway`, so it runs on the CI gate with **no network and no secrets**. The opt-in real-Claude
eval (`tests/test_behaviour_eval.py::test_behaviour_extraction_meets_d_p2_1_floor`) is marked
`@pytest.mark.llm` and **auto-skips** when `ANTHROPIC_API_KEY` is absent.

```bash
cd modules/enrichment
pip install -e ".[dev,llm]"      # adds the Anthropic SDK
export ANTHROPIC_API_KEY=sk-...  # never commit a key
pytest -m llm                    # runs the real-Claude behaviour eval
```

## The D-P2.1 floor (the gate)

| Category | Precision | Recall | F1 | Auto-merge-band precision |
|---|---|---|---|---|
| Behaviour entities | ≥ 0.85 | ≥ 0.70 | ≥ 0.77 | ≥ 0.90 |
| Behavioural relationships | ≥ 0.75 | ≥ 0.55 | ≥ 0.63 | ≥ 0.85 |

Per-type F1 ≥ 0.65 (entities) / ≥ 0.55 (relationships) for any type with ≥ 5 golden instances.
The recall floor for behavioural relationships is **lower** than Phase 1's (0.55 vs 0.60) because
behavioural edges are frequently *implicit* in prose. This is a **revisable floor** (the gate),
not an aspiration — raise it as the golden set grows.
