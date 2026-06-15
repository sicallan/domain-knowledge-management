"""Deterministic coverage of the eval harness (no network).

The real golden eval (``test_extraction_eval``) needs Claude and auto-skips in CI, so these
tests exercise ``load_golden_dataset`` and the precision/recall/F1 maths through the
``FakeGateway`` to keep the harness on the CI gate.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from dkm_enrichment.evaluation import evaluate_pipeline, load_golden_dataset
from dkm_enrichment.gateway.fake import FakeGateway
from dkm_enrichment.models import (
    CanonicalDocument,
    DocumentSection,
    ExpectedEntity,
    ExpectedRelationship,
    ExtractionConfig,
    GoldenDataset,
)
from dkm_enrichment.pipeline import ExtractionPipeline

from .conftest import scripted_router


def _payments_golden_dir() -> Path:
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "evals" / "payments-golden"
        if (candidate / "dataset.json").exists():
            return candidate
    raise FileNotFoundError("Could not locate evals/payments-golden")


# --------------------------------------------------------------------------- loader


def test_load_golden_dataset_reads_labels_and_documents() -> None:
    golden = load_golden_dataset(_payments_golden_dir())
    assert golden.id == "payments-golden-v1"
    assert len(golden.documents) == 4
    assert len(golden.expectedEntities) == 18
    assert len(golden.expectedRelationships) == 3
    # Document content is loaded from the Markdown files, not inlined in dataset.json.
    assert any("Authorisation" in d.content for d in golden.documents)


# --------------------------------------------------------------------------- metric maths


def _synthetic_golden() -> GoldenDataset:
    document = CanonicalDocument(
        id="syn-1",
        sourceType="filesystem",
        sourcePath="syn.md",
        sourceVersion="1",
        fetchedAt="2026-01-01T00:00:00.000Z",
        sourceAuthority="scheme",
        content="x",
        title="Synthetic",
        sections=[DocumentSection(id="s", title="S", content="content")],
    )
    return GoldenDataset(
        id="syn",
        name="synthetic",
        documents=[document],
        expectedEntities=[
            ExpectedEntity(type="DomainConcept", name="Alpha"),
            ExpectedEntity(type="DomainConcept", name="Beta"),
        ],
        expectedRelationships=[
            ExpectedRelationship(
                relationshipType="relatesTo", sourceName="Alpha", targetName="Beta"
            )
        ],
    )


def _pipeline(script: dict[str, dict[str, dict[str, Any]]]) -> ExtractionPipeline:
    return ExtractionPipeline(FakeGateway(router=scripted_router(script)))


async def test_perfect_extraction_scores_one() -> None:
    script: dict[str, dict[str, dict[str, Any]]] = {
        "syn-1": {
            "S": {
                "entities": [
                    {"type": "DomainConcept", "name": "Alpha", "confidence": 0.95},
                    {"type": "DomainConcept", "name": "Beta", "confidence": 0.95},
                ],
                "relationships": [
                    {"type": "relatesTo", "source": "Alpha", "target": "Beta",
                     "confidence": 0.95},
                ],
            }
        }
    }
    metrics = await evaluate_pipeline(_pipeline(script), _synthetic_golden(), ExtractionConfig())
    assert metrics.entities.precision == 1.0
    assert metrics.entities.recall == 1.0
    assert metrics.entities.f1 == 1.0
    assert metrics.entities.autoMergeBandPrecision == 1.0
    assert metrics.relationships.recall == 1.0
    assert metrics.entities.perType["DomainConcept"].support == 2


async def test_missed_entity_lowers_recall() -> None:
    script: dict[str, dict[str, dict[str, Any]]] = {
        "syn-1": {
            "S": {
                "entities": [
                    {"type": "DomainConcept", "name": "Alpha", "confidence": 0.95},
                ],
            }
        }
    }
    metrics = await evaluate_pipeline(_pipeline(script), _synthetic_golden(), ExtractionConfig())
    assert metrics.entities.recall == 0.5
    assert metrics.entities.precision == 1.0
    assert metrics.relationships.recall == 0.0


async def test_spurious_entity_lowers_precision() -> None:
    script: dict[str, dict[str, dict[str, Any]]] = {
        "syn-1": {
            "S": {
                "entities": [
                    {"type": "DomainConcept", "name": "Alpha", "confidence": 0.95},
                    {"type": "DomainConcept", "name": "Beta", "confidence": 0.95},
                    {"type": "DomainConcept", "name": "Gamma", "confidence": 0.95},
                ],
            }
        }
    }
    metrics = await evaluate_pipeline(_pipeline(script), _synthetic_golden(), ExtractionConfig())
    # 2 of 3 predicted entities are in the gold set.
    assert metrics.entities.precision == round(2 / 3, 4)
    assert metrics.entities.recall == 1.0
