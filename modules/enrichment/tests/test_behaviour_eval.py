"""Golden-dataset eval for the behaviour pass (feature 02 §8; D-P2.1 / D-P2.7).

The deterministic leg replays ``evals/payments-behaviour-golden/``'s ``extractionScript`` through
the ``FakeGateway`` and asserts the [D-P2.1](../../docs/phase-2/decisions.md) behaviour floors —
overall and per type — so the behaviour prompts have a no-network CI regression gate. It also
asserts the behaviour pass causes **no regression** to a structural eval. The real-Claude legs are
``@pytest.mark.llm`` and auto-skip without ``ANTHROPIC_API_KEY``.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pytest

from dkm_enrichment.entity_resolution import normalise_name
from dkm_enrichment.evaluation import load_golden_dataset
from dkm_enrichment.gateway.fake import FakeGateway
from dkm_enrichment.models import (
    PHASE_0A_L1_TYPES,
    PHASE_2_BEHAVIOUR_TYPES,
    CanonicalDocument,
    CategoryMetrics,
    DocumentSection,
    EvaluationMetrics,
    ExpectedEntity,
    ExpectedRelationship,
    ExtractionConfig,
    GoldenDataset,
)
from dkm_enrichment.pipeline import ExtractionPipeline

from .conftest import behaviour_targets, scripted_router

# D-P2.1 behaviour floors (the gate).
ENT_PRECISION_FLOOR = 0.85
ENT_RECALL_FLOOR = 0.70
ENT_F1_FLOOR = 0.77
ENT_BAND_FLOOR = 0.90
ENT_PER_TYPE_F1_FLOOR = 0.65
REL_PRECISION_FLOOR = 0.75
REL_RECALL_FLOOR = 0.55
REL_F1_FLOOR = 0.63
REL_BAND_FLOOR = 0.85
REL_PER_TYPE_F1_FLOOR = 0.55
PER_TYPE_MIN_SUPPORT = 5


def _behaviour_golden_dir() -> Path:
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "evals" / "payments-behaviour-golden"
        if (candidate / "dataset.json").exists():
            return candidate
    raise FileNotFoundError("Could not locate evals/payments-behaviour-golden")


def _spec() -> dict[str, Any]:
    return json.loads((_behaviour_golden_dir() / "dataset.json").read_text(encoding="utf-8"))


def _assert_entity_floor(ent: CategoryMetrics) -> None:
    assert ent.precision >= ENT_PRECISION_FLOOR, ent
    assert ent.recall >= ENT_RECALL_FLOOR, ent
    assert ent.f1 >= ENT_F1_FLOOR, ent
    assert ent.autoMergeBandPrecision >= ENT_BAND_FLOOR, ent
    for type_name, tm in ent.perType.items():
        if tm.support >= PER_TYPE_MIN_SUPPORT:
            assert tm.f1 >= ENT_PER_TYPE_F1_FLOOR, (type_name, tm)


def _assert_relationship_floor(rel: CategoryMetrics) -> None:
    assert rel.precision >= REL_PRECISION_FLOOR, rel
    assert rel.recall >= REL_RECALL_FLOOR, rel
    assert rel.f1 >= REL_F1_FLOOR, rel
    assert rel.autoMergeBandPrecision >= REL_BAND_FLOOR, rel
    for rel_type, tm in rel.perType.items():
        if tm.support >= PER_TYPE_MIN_SUPPORT:
            assert tm.f1 >= REL_PER_TYPE_F1_FLOOR, (rel_type, tm)


# --------------------------------------------------------------------------- deterministic gate


async def test_behaviour_eval_meets_d_p2_1_floor_deterministically() -> None:
    spec = _spec()
    golden = load_golden_dataset(_behaviour_golden_dir())
    pipeline = ExtractionPipeline(FakeGateway(router=scripted_router(spec["extractionScript"])))
    metrics = await pipeline.evaluate(golden, ExtractionConfig(targetTypes=behaviour_targets()))

    _assert_entity_floor(metrics.entities)
    _assert_relationship_floor(metrics.relationships)


async def test_eval_reports_per_type_for_every_behaviour_type() -> None:
    golden = load_golden_dataset(_behaviour_golden_dir())
    spec = _spec()
    pipeline = ExtractionPipeline(FakeGateway(router=scripted_router(spec["extractionScript"])))
    metrics = await pipeline.evaluate(golden, ExtractionConfig(targetTypes=behaviour_targets()))

    for type_name in PHASE_2_BEHAVIOUR_TYPES:
        assert type_name in metrics.entities.perType, type_name
    # The five behavioural relationship kinds present in the golden are reported per-type.
    for rel_type in ("triggers", "emits", "transitionsTo", "compensates", "invokes"):
        assert rel_type in metrics.relationships.perType, rel_type


def test_extraction_script_is_consistent_with_the_labels() -> None:
    """Guard against script ↔ label drift: every scripted item is labelled, and the only
    labelled-but-unscripted edges are the cross-pass ``invokes`` placeholders (D-P2.5)."""

    spec = _spec()
    expected_entities = {
        (e["type"], normalise_name(e["name"])) for e in spec["expectedEntities"]
    }
    expected_rels = {
        (r["relationshipType"], normalise_name(r["sourceName"]), normalise_name(r["targetName"]))
        for r in spec["expectedRelationships"]
    }

    scripted_entities: set[tuple[str, str]] = set()
    scripted_rels: set[tuple[str, str, str]] = set()
    for sections in spec["extractionScript"].values():
        for section in sections.values():
            for ent in section.get("entities", []):
                scripted_entities.add((ent["type"], normalise_name(ent["name"])))
            for rel in section.get("relationships", []):
                scripted_rels.add(
                    (rel["type"], normalise_name(rel["source"]), normalise_name(rel["target"]))
                )

    assert scripted_entities == expected_entities  # every entity is both scripted and labelled
    assert scripted_rels <= expected_rels
    unscripted = expected_rels - scripted_rels
    assert unscripted and all(kind == "invokes" for kind, _, _ in unscripted), unscripted


# --------------------------------------------------------------------------- no-regression gate


def _structural_synthetic() -> tuple[GoldenDataset, dict[str, Any]]:
    document = CanonicalDocument(
        id="syn-structural",
        sourceType="filesystem",
        sourcePath="syn.md",
        sourceVersion="1",
        fetchedAt="2026-01-01T00:00:00.000Z",
        sourceAuthority="scheme",
        content="x",
        title="Synthetic",
        sections=[DocumentSection(id="s", title="S", content="content")],
    )
    golden = GoldenDataset(
        id="syn",
        name="synthetic-structural",
        documents=[document],
        expectedEntities=[
            ExpectedEntity(type="Decision", name="Net Settlement"),
            ExpectedEntity(type="ReferenceData", name="Scheme Fee Table"),
        ],
        expectedRelationships=[
            ExpectedRelationship(
                relationshipType="consumes",
                sourceName="Net Settlement",
                targetName="Scheme Fee Table",
            )
        ],
    )
    script = {
        "syn-structural": {
            "S": {
                "entities": [
                    {"type": "Decision", "name": "Net Settlement", "decisionType": "automated",
                     "outcomes": ["net"], "confidence": 0.95},
                    {"type": "ReferenceData", "name": "Scheme Fee Table", "confidence": 0.95},
                ],
                "relationships": [
                    {"type": "consumes", "source": "Net Settlement",
                     "target": "Scheme Fee Table", "confidence": 0.95},
                ],
            }
        }
    }
    return golden, script


async def test_no_regression_on_structural_eval_with_behaviour_enabled() -> None:
    golden, script = _structural_synthetic()
    pipeline = ExtractionPipeline(FakeGateway(router=scripted_router(script)))

    baseline = await pipeline.evaluate(
        golden, ExtractionConfig(targetTypes=list(PHASE_0A_L1_TYPES))
    )
    with_behaviour = await pipeline.evaluate(
        golden, ExtractionConfig(targetTypes=behaviour_targets())
    )
    # Turning the behaviour pass on leaves the structural metrics byte-for-byte identical.
    assert with_behaviour.model_dump() == baseline.model_dump()


# --------------------------------------------------------------------------- opt-in real-Claude


@pytest.mark.llm
@pytest.mark.skipif(
    not os.environ.get("ANTHROPIC_API_KEY"),
    reason="ANTHROPIC_API_KEY not set — real-Claude behaviour eval is opt-in",
)
async def test_behaviour_extraction_meets_d_p2_1_floor() -> None:
    pytest.importorskip("anthropic", reason="install the [llm] extra to run the golden eval")
    from dkm_enrichment.gateway.claude import ClaudeGateway

    golden = load_golden_dataset(_behaviour_golden_dir())
    pipeline = ExtractionPipeline(ClaudeGateway())
    metrics = await pipeline.evaluate(golden, ExtractionConfig(targetTypes=behaviour_targets()))

    _report(metrics)
    _assert_entity_floor(metrics.entities)
    _assert_relationship_floor(metrics.relationships)


@pytest.mark.llm
@pytest.mark.skipif(
    not os.environ.get("ANTHROPIC_API_KEY"),
    reason="ANTHROPIC_API_KEY not set — real-Claude regression eval is opt-in",
)
async def test_phase1_structural_floor_holds_with_behaviour_enabled() -> None:
    # The true criterion-6 regression gate: the Phase 1 D-P1.5 floors still hold when the
    # behaviour types are added to targetTypes (run against the Phase 1 golden, real Claude).
    pytest.importorskip("anthropic", reason="install the [llm] extra to run the golden eval")
    from dkm_enrichment.gateway.claude import ClaudeGateway

    here = Path(__file__).resolve()
    phase1_dir = next(
        p / "evals" / "payments-golden"
        for p in here.parents
        if (p / "evals" / "payments-golden" / "dataset.json").exists()
    )
    golden = load_golden_dataset(phase1_dir)
    pipeline = ExtractionPipeline(ClaudeGateway())
    metrics = await pipeline.evaluate(golden, ExtractionConfig(targetTypes=behaviour_targets()))

    assert metrics.entities.precision >= 0.85, metrics.entities
    assert metrics.entities.recall >= 0.70, metrics.entities
    assert metrics.relationships.precision >= 0.75, metrics.relationships
    assert metrics.relationships.recall >= 0.60, metrics.relationships


def _report(metrics: EvaluationMetrics) -> None:
    print("\n=== Payments behaviour golden eval (D-P2.1) ===")
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
