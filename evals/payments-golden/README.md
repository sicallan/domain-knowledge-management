# Payments golden dataset (Phase 1)

A small, labelled Payments dataset used to benchmark the LLM extraction pipeline against the
[D-P1.5](../../docs/phase-1/decisions.md) extraction-quality floor (feature 02 acceptance
criterion 6).

## Layout

- `dataset.json` — the labels: `expectedEntities` (type + name) and `expectedRelationships`
  (relationshipType + source/target **names**), plus document descriptors.
- `documents/*.md` — the source Markdown each descriptor points at.

The loader (`dkm_enrichment.evaluation.load_golden_dataset`) reads each descriptor's `file`
as the document content, so the source text stays in plain Markdown under version control.

## Running the eval

The golden eval calls the **real** Claude gateway. It is marked `@pytest.mark.llm` and
**auto-skips** when `ANTHROPIC_API_KEY` is absent, so it is **never** a CI gate (CI has no
secrets and runs `pytest -m 'not llm'`).

```bash
cd modules/enrichment
pip install -e ".[dev,llm]"      # adds the Anthropic SDK
export ANTHROPIC_API_KEY=sk-...  # never commit a key
pytest -m llm                    # runs tests/test_extraction_eval.py
```

The harness reports precision / recall / F1 overall and per type for entities and
relationships separately, plus the auto-merge-band (`confidence >= 0.8`) precision — the
strict graph-integrity gate. `confidenceCalibration` is reported as a sanity signal only.

## The D-P1.5 floor (the gate)

| Category | Precision | Recall | F1 | Auto-merge-band precision |
|---|---|---|---|---|
| Entities | ≥ 0.85 | ≥ 0.70 | ≥ 0.77 | ≥ 0.90 |
| Relationships | ≥ 0.75 | ≥ 0.60 | ≥ 0.67 | ≥ 0.85 |

Per-type F1 ≥ 0.65 (entities) / ≥ 0.55 (relationships) for any type with ≥ 5 golden
instances. Matching is conservative: an entity matches a label iff it shares a type and a
normalised name; a relationship matches iff its type and both endpoint names match.

This is a **revisable floor** (the gate), not an aspiration. It is intentionally a two-tier
gate: strict precision where extractions auto-merge into the graph; a lower recall floor
because real-but-uncertain extractions route to a human review queue rather than being lost.
