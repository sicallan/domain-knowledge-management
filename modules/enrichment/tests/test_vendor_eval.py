"""Golden-dataset eval for the vendor/project pass (feature 02 §8; D-P3.1 precision-first coverage).

The deterministic leg replays ``evals/payments-vendor-golden/``'s ``extractionScript`` through the
``FakeGateway`` and asserts the [D-P3.1](../../docs/phase-3/decisions.md) L2 floors — overall and
per type for entities and relationships, and **separately** the coverage-claim floors (the
strictest L2 bar: a false "covered" is the costly failure). The real-Claude leg is
``@pytest.mark.llm`` and auto-skips without ``ANTHROPIC_API_KEY``.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pytest

from dkm_enrichment.entity_resolution import normalise_name
from dkm_enrichment.evaluation import (
    _validate_coverage_labels,
    load_golden_dataset,
    score_coverage_claims,
)
from dkm_enrichment.gateway.fake import FakeGateway
from dkm_enrichment.models import (
    L2_STRUCTURAL_RELATIONSHIP_TYPES,
    VENDOR_CAPABILITY_MAPPING_TYPE,
    CategoryMetrics,
    CoverageClaimMetrics,
    EvaluationMetrics,
    ExtractionConfig,
    JsonlEntry,
)
from dkm_enrichment.pipeline import ExtractionPipeline

from .conftest import scripted_router, vendor_targets

# D-P3.1 L2 entity floors (mirror the Phase 2 behaviour-entity floors — as recoverable as those).
ENT_PRECISION_FLOOR = 0.85
ENT_RECALL_FLOOR = 0.70
ENT_F1_FLOOR = 0.77
ENT_BAND_FLOOR = 0.90
L2_PER_TYPE_F1_FLOOR = 0.65
# D-P3.1 coverage-claim floors (the strictest L2 bar — precision-first, modest recall).
COV_COVERED_PRECISION_FLOOR = 0.90
COV_BAND_FLOOR = 0.92
COV_RECALL_FLOOR = 0.65
# D-P3.1 L2 structural-relationship floors (cross-layer edges are often implicit in vendor prose).
REL_PRECISION_FLOOR = 0.75
REL_RECALL_FLOOR = 0.55
REL_F1_FLOOR = 0.63
REL_BAND_FLOOR = 0.85
PER_TYPE_MIN_SUPPORT = 5


def _vendor_golden_dir() -> Path:
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "evals" / "payments-vendor-golden"
        if (candidate / "dataset.json").exists():
            return candidate
    raise FileNotFoundError("Could not locate evals/payments-vendor-golden")


def _spec() -> dict[str, Any]:
    return json.loads((_vendor_golden_dir() / "dataset.json").read_text(encoding="utf-8"))


def _script_name(item: dict[str, Any]) -> str:
    for key in ("name", "statement", "expression", "vendorCapability"):
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value
    raise AssertionError(f"scripted entity has no name/vendorCapability: {item}")


def _config() -> ExtractionConfig:
    return ExtractionConfig(targetTypes=vendor_targets())


async def _predicted_entities(pipeline: ExtractionPipeline) -> list[JsonlEntry]:
    golden = load_golden_dataset(_vendor_golden_dir())
    entities: list[JsonlEntry] = []
    for document in golden.documents:
        result = await pipeline.extract_single(document, _config())
        entities.extend(result.entities)
    return entities


def _assert_entity_floor(ent: CategoryMetrics) -> None:
    assert ent.precision >= ENT_PRECISION_FLOOR, ent
    assert ent.recall >= ENT_RECALL_FLOOR, ent
    assert ent.f1 >= ENT_F1_FLOOR, ent
    assert ent.autoMergeBandPrecision >= ENT_BAND_FLOOR, ent
    # VendorCapabilityMapping is the gated L2 entity type (≥ 5 golden instances): its F1 must clear.
    mapping = ent.perType[VENDOR_CAPABILITY_MAPPING_TYPE]
    assert mapping.support >= PER_TYPE_MIN_SUPPORT, mapping
    assert mapping.f1 >= L2_PER_TYPE_F1_FLOOR, mapping


def _assert_relationship_floor(rel: CategoryMetrics) -> None:
    assert rel.precision >= REL_PRECISION_FLOOR, rel
    assert rel.recall >= REL_RECALL_FLOOR, rel
    assert rel.f1 >= REL_F1_FLOOR, rel
    assert rel.autoMergeBandPrecision >= REL_BAND_FLOOR, rel


def _assert_coverage_floor(cov: CoverageClaimMetrics) -> None:
    assert cov.coveredPrecision >= COV_COVERED_PRECISION_FLOOR, cov
    assert cov.autoMergeBandCoveredPrecision >= COV_BAND_FLOOR, cov
    assert cov.coveredRecall >= COV_RECALL_FLOOR, cov


# --------------------------------------------------------------------------- deterministic gate


async def test_vendor_eval_meets_d_p3_1_floor_deterministically() -> None:
    spec = _spec()
    golden = load_golden_dataset(_vendor_golden_dir())
    pipeline = ExtractionPipeline(FakeGateway(router=scripted_router(spec["extractionScript"])))
    metrics = await pipeline.evaluate(golden, _config())

    _assert_entity_floor(metrics.entities)
    _assert_relationship_floor(metrics.relationships)

    coverage = score_coverage_claims(
        await _predicted_entities(pipeline), golden.expectedCoverage, _config().autoMergeBand
    )
    _assert_coverage_floor(coverage)


async def test_eval_reports_every_l2_type_and_edge() -> None:
    golden = load_golden_dataset(_vendor_golden_dir())
    spec = _spec()
    pipeline = ExtractionPipeline(FakeGateway(router=scripted_router(spec["extractionScript"])))
    metrics = await pipeline.evaluate(golden, _config())

    for type_name in ("VendorProduct", VENDOR_CAPABILITY_MAPPING_TYPE, "ProjectSpec"):
        assert type_name in metrics.entities.perType, type_name
    # The committed L2 edges are reported; realizesVendorCap is a labelled cross-pass placeholder.
    for rel_type in ("fulfils", "specifies"):
        assert rel_type in metrics.relationships.perType, rel_type


def test_coverage_scoring_penalises_a_false_covered() -> None:
    # A precision-first guard: claiming covered where the truth is none drops covered-precision
    # below the floor — the costly failure the gate exists to catch (D-P3.1).
    golden = load_golden_dataset(_vendor_golden_dir())

    def _mapping(cap: str, coverage: str, conf: float = 0.95) -> JsonlEntry:
        return JsonlEntry(
            id=f"m-{cap}", type=VENDOR_CAPABILITY_MAPPING_TYPE, version="1.0.0",
            source={"file": "x", "location": "x", "fetchedAt": "x", "sourceAuthority": "vendor"},
            confidence=conf, extractedAt="x",
            data={"vendorCapability": cap, "coverage": coverage},
        )

    # Truth for "Globex Chargeback Automation" is none; asserting "full" is a false covered.
    predicted = [
        _mapping("Acme Card Authorisation", "full"),
        _mapping("Globex Chargeback Automation", "full"),  # WRONG — truth is none
    ]
    cov = score_coverage_claims(predicted, golden.expectedCoverage, 0.8)
    assert cov.coveredPrecision < COV_COVERED_PRECISION_FLOOR


def test_extraction_script_is_consistent_with_the_labels() -> None:
    """Guard against script ↔ label drift: every scripted item is labelled, and the only
    labelled-but-unscripted edges are the cross-pass placeholders (``realizesVendorCap`` →
    Service, ``satisfiedBy`` ← RegulatoryRequirement — endpoints that are not extractable here)."""

    spec = _spec()
    _validate_coverage_labels(load_golden_dataset(_vendor_golden_dir()).expectedCoverage)

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
    assert unscripted and all(
        kind in {"realizesVendorCap", "satisfiedBy"} for kind, _, _ in unscripted
    ), unscripted
    # Every scripted committed edge is an L2 structural kind (the pass's own edges).
    assert all(kind in L2_STRUCTURAL_RELATIONSHIP_TYPES for kind, _, _ in scripted_rels)


# --------------------------------------------------------------------------- opt-in real-Claude


@pytest.mark.llm
@pytest.mark.skipif(
    not os.environ.get("ANTHROPIC_API_KEY"),
    reason="ANTHROPIC_API_KEY not set — real-Claude vendor eval is opt-in",
)
async def test_vendor_extraction_meets_d_p3_1_floor() -> None:
    pytest.importorskip("anthropic", reason="install the [llm] extra to run the golden eval")
    from dkm_enrichment.gateway.claude import ClaudeGateway

    golden = load_golden_dataset(_vendor_golden_dir())
    pipeline = ExtractionPipeline(ClaudeGateway())
    metrics = await pipeline.evaluate(golden, _config())
    coverage = score_coverage_claims(
        await _predicted_entities(pipeline), golden.expectedCoverage, _config().autoMergeBand
    )

    _report(metrics, coverage)
    _assert_entity_floor(metrics.entities)
    _assert_relationship_floor(metrics.relationships)
    _assert_coverage_floor(coverage)


def _report(metrics: EvaluationMetrics, coverage: CoverageClaimMetrics) -> None:
    print("\n=== Payments vendor/project golden eval (D-P3.1) ===")
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
    print(
        f"      coverage: covered-P={coverage.coveredPrecision:.3f} "
        f"covered-R={coverage.coveredRecall:.3f} "
        f"band-P={coverage.autoMergeBandCoveredPrecision:.3f} "
        f"exact={coverage.exactValueAccuracy:.3f} (n={coverage.support})"
    )
