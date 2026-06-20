"""Golden-dataset eval for the decision pass (feature 03 §8; D-P2.1 / D-P2.7).

The deterministic leg replays ``evals/payments-decision-golden/``'s ``extractionScript`` through the
``FakeGateway`` and asserts the [D-P2.1](../../docs/phase-2/decisions.md) decision floors — the
**strictest bars in the system** (Decision auto-merge-band precision ≥ 0.92) — overall and per type,
giving the decision prompts a no-network CI regression gate. The real-Claude leg is
``@pytest.mark.llm`` and auto-skips without ``ANTHROPIC_API_KEY``.
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
    DECISION_SPECIFIC_RELATIONSHIP_TYPES,
    DECISION_TYPE,
    CategoryMetrics,
    EvaluationMetrics,
    ExtractionConfig,
)
from dkm_enrichment.pipeline import ExtractionPipeline

from .conftest import decision_targets, scripted_router

# D-P2.1 decision floors (the gate). Decision entities carry the strictest auto-merge-band bar
# anywhere — a wrong auto-merged Decision is the costliest failure in the system.
ENT_PRECISION_FLOOR = 0.85
ENT_RECALL_FLOOR = 0.65
ENT_F1_FLOOR = 0.74
ENT_BAND_FLOOR = 0.92
DECISION_PER_TYPE_F1_FLOOR = 0.74
REL_PRECISION_FLOOR = 0.75
REL_RECALL_FLOOR = 0.55
REL_F1_FLOOR = 0.63
REL_BAND_FLOOR = 0.88
REL_PER_TYPE_F1_FLOOR = 0.55
PER_TYPE_MIN_SUPPORT = 5


def _decision_golden_dir() -> Path:
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "evals" / "payments-decision-golden"
        if (candidate / "dataset.json").exists():
            return candidate
    raise FileNotFoundError("Could not locate evals/payments-decision-golden")


def _spec() -> dict[str, Any]:
    return json.loads((_decision_golden_dir() / "dataset.json").read_text(encoding="utf-8"))


def _script_name(item: dict[str, Any]) -> str:
    for key in ("name", "statement", "expression"):
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value
    raise AssertionError(f"scripted entity has no name/statement/expression: {item}")


def _assert_entity_floor(ent: CategoryMetrics) -> None:
    assert ent.precision >= ENT_PRECISION_FLOOR, ent
    assert ent.recall >= ENT_RECALL_FLOOR, ent
    assert ent.f1 >= ENT_F1_FLOOR, ent
    assert ent.autoMergeBandPrecision >= ENT_BAND_FLOOR, ent
    # Decision is the gated entity type: its own precision/recall/F1 must clear the floor.
    decision = ent.perType[DECISION_TYPE]
    assert decision.support >= PER_TYPE_MIN_SUPPORT, decision
    assert decision.precision >= ENT_PRECISION_FLOOR, decision
    assert decision.recall >= ENT_RECALL_FLOOR, decision
    assert decision.f1 >= DECISION_PER_TYPE_F1_FLOOR, decision


def _assert_relationship_floor(rel: CategoryMetrics) -> None:
    assert rel.precision >= REL_PRECISION_FLOOR, rel
    assert rel.recall >= REL_RECALL_FLOOR, rel
    assert rel.f1 >= REL_F1_FLOOR, rel
    assert rel.autoMergeBandPrecision >= REL_BAND_FLOOR, rel
    for rel_type, tm in rel.perType.items():
        if tm.support >= PER_TYPE_MIN_SUPPORT:
            assert tm.f1 >= REL_PER_TYPE_F1_FLOOR, (rel_type, tm)


# --------------------------------------------------------------------------- deterministic gate


async def test_decision_eval_meets_d_p2_1_floor_deterministically() -> None:
    spec = _spec()
    golden = load_golden_dataset(_decision_golden_dir())
    pipeline = ExtractionPipeline(FakeGateway(router=scripted_router(spec["extractionScript"])))
    metrics = await pipeline.evaluate(golden, ExtractionConfig(targetTypes=decision_targets()))

    _assert_entity_floor(metrics.entities)
    _assert_relationship_floor(metrics.relationships)


async def test_eval_reports_decision_and_every_decision_edge_type() -> None:
    golden = load_golden_dataset(_decision_golden_dir())
    spec = _spec()
    pipeline = ExtractionPipeline(FakeGateway(router=scripted_router(spec["extractionScript"])))
    metrics = await pipeline.evaluate(golden, ExtractionConfig(targetTypes=decision_targets()))

    assert DECISION_TYPE in metrics.entities.perType
    # Every one of the six decision-specific relationship types is reported (realizedBy is a
    # cross-pass placeholder, present in the labels and therefore in perType, with 0 predicted).
    for rel_type in DECISION_SPECIFIC_RELATIONSHIP_TYPES:
        assert rel_type in metrics.relationships.perType, rel_type


def test_extraction_script_is_consistent_with_the_labels() -> None:
    """Guard against script ↔ label drift: every scripted item is labelled, and the only
    labelled-but-unscripted edges are the cross-pass ``realizedBy → Service`` placeholders
    (Service is an L2/L3 endpoint that arrives in Phase 3 — D-P2.5)."""

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
                scripted_entities.add((ent["type"], normalise_name(_script_name(ent))))
            for rel in section.get("relationships", []):
                scripted_rels.add(
                    (rel["type"], normalise_name(rel["source"]), normalise_name(rel["target"]))
                )

    assert scripted_entities == expected_entities
    assert scripted_rels <= expected_rels
    unscripted = expected_rels - scripted_rels
    assert unscripted and all(kind == "realizedBy" for kind, _, _ in unscripted), unscripted


def test_decision_vs_rule_boundary_is_encoded_in_labels() -> None:
    """Feature 03 §11: a Decision *uses* rules but is not a rule. The adversarial rule — whose
    prose reads like a decision ("...decides to block...") — is labelled a ``Rule``, never a
    ``Decision``, and a genuine Decision ``evaluates`` it rather than collapsing the two."""

    spec = _spec()
    adversarial = "Block the card after three consecutive CVV failures"
    rules = {e["name"] for e in spec["expectedEntities"] if e["type"] == "Rule"}
    decisions = {e["name"] for e in spec["expectedEntities"] if e["type"] == "Decision"}
    assert adversarial in rules
    assert adversarial not in decisions
    # The boundary edge: a Decision evaluates the adversarial rule (uses it, is not it).
    evaluates_targets = {
        r["targetName"]
        for r in spec["expectedRelationships"]
        if r["relationshipType"] == "evaluates"
    }
    assert adversarial in evaluates_targets


# --------------------------------------------------------------------------- opt-in real-Claude


@pytest.mark.llm
@pytest.mark.skipif(
    not os.environ.get("ANTHROPIC_API_KEY"),
    reason="ANTHROPIC_API_KEY not set — real-Claude decision eval is opt-in",
)
async def test_decision_extraction_meets_d_p2_1_floor() -> None:
    pytest.importorskip("anthropic", reason="install the [llm] extra to run the golden eval")
    from dkm_enrichment.gateway.claude import ClaudeGateway

    golden = load_golden_dataset(_decision_golden_dir())
    pipeline = ExtractionPipeline(ClaudeGateway())
    metrics = await pipeline.evaluate(golden, ExtractionConfig(targetTypes=decision_targets()))

    _report(metrics)
    _assert_entity_floor(metrics.entities)
    _assert_relationship_floor(metrics.relationships)


def _report(metrics: EvaluationMetrics) -> None:
    print("\n=== Payments decision golden eval (D-P2.1) ===")
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
