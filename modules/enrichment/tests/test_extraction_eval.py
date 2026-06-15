"""Golden-dataset eval against the **real** Claude gateway (feature 02 acceptance criterion 6).

This is the only test that touches the network. It is marked ``@pytest.mark.llm`` and
auto-skips when ``ANTHROPIC_API_KEY`` is absent (or the optional ``anthropic`` extra is not
installed), so it is **never** a CI gate — CI runs ``pytest -m 'not llm'``. Run it locally with
``pip install -e ".[dev,llm]"`` and an exported key.

It asserts the [D-P1.5](../../docs/phase-1/decisions.md) extraction-quality floor: entities and
relationships are gated separately, with a strict auto-merge-band precision bar and a lower
recall floor (real-but-uncertain extractions route to a human review queue).
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from dkm_enrichment.evaluation import load_golden_dataset
from dkm_enrichment.models import EvaluationMetrics, ExtractionConfig
from dkm_enrichment.pipeline import ExtractionPipeline

pytestmark = pytest.mark.llm

_NO_KEY = not os.environ.get("ANTHROPIC_API_KEY")

# D-P1.5 floors (the gate).
ENTITY_PRECISION_FLOOR = 0.85
ENTITY_RECALL_FLOOR = 0.70
ENTITY_F1_FLOOR = 0.77
ENTITY_BAND_PRECISION_FLOOR = 0.90
REL_PRECISION_FLOOR = 0.75
REL_RECALL_FLOOR = 0.60
REL_F1_FLOOR = 0.67
REL_BAND_PRECISION_FLOOR = 0.85
ENTITY_PER_TYPE_F1_FLOOR = 0.65
REL_PER_TYPE_F1_FLOOR = 0.55
PER_TYPE_MIN_SUPPORT = 5


def _payments_golden_dir() -> Path:
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "evals" / "payments-golden"
        if (candidate / "dataset.json").exists():
            return candidate
    raise FileNotFoundError("Could not locate evals/payments-golden")


@pytest.mark.skipif(_NO_KEY, reason="ANTHROPIC_API_KEY not set — real-Claude eval is opt-in")
async def test_extraction_meets_d_p1_5_floor() -> None:
    pytest.importorskip("anthropic", reason="install the [llm] extra to run the golden eval")
    from dkm_enrichment.gateway.claude import ClaudeGateway

    golden = load_golden_dataset(_payments_golden_dir())
    pipeline = ExtractionPipeline(ClaudeGateway())
    metrics = await pipeline.evaluate(golden, ExtractionConfig())

    _report(metrics)

    ent = metrics.entities
    assert ent.precision >= ENTITY_PRECISION_FLOOR, ent
    assert ent.recall >= ENTITY_RECALL_FLOOR, ent
    assert ent.f1 >= ENTITY_F1_FLOOR, ent
    assert ent.autoMergeBandPrecision >= ENTITY_BAND_PRECISION_FLOOR, ent

    rel = metrics.relationships
    assert rel.precision >= REL_PRECISION_FLOOR, rel
    assert rel.recall >= REL_RECALL_FLOOR, rel
    assert rel.f1 >= REL_F1_FLOOR, rel
    assert rel.autoMergeBandPrecision >= REL_BAND_PRECISION_FLOOR, rel

    for type_name, tm in ent.perType.items():
        if tm.support >= PER_TYPE_MIN_SUPPORT:
            assert tm.f1 >= ENTITY_PER_TYPE_F1_FLOOR, (type_name, tm)
    for rel_type, tm in rel.perType.items():
        if tm.support >= PER_TYPE_MIN_SUPPORT:
            assert tm.f1 >= REL_PER_TYPE_F1_FLOOR, (rel_type, tm)


def _report(metrics: EvaluationMetrics) -> None:
    print("\n=== Payments golden eval (D-P1.5) ===")
    for label, cat in (("entities", metrics.entities), ("relationships", metrics.relationships)):
        print(
            f"{label:>14}: P={cat.precision:.3f} R={cat.recall:.3f} F1={cat.f1:.3f} "
            f"band-P={cat.autoMergeBandPrecision:.3f}"
        )
        for type_name, tm in sorted(cat.perType.items()):
            print(
                f"               - {type_name}: P={tm.precision:.3f} R={tm.recall:.3f} "
                f"F1={tm.f1:.3f} (n={tm.support})"
            )
    print(f"  calibration (signal only): {metrics.confidenceCalibration:.3f}")
