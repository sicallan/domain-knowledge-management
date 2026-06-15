"""Confidence scoring + the confidence gate (feature 02 acceptance criterion 4).

Below-threshold entries are excluded from JSONL **and counted** in stats — never silently
dropped.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from dkm_enrichment.confidence import passes_gate, score_confidence
from dkm_enrichment.emission import read_jsonl
from dkm_enrichment.gateway.fake import FakeGateway
from dkm_enrichment.models import (
    CanonicalDocument,
    DocumentSection,
    ExtractionConfig,
)
from dkm_enrichment.pipeline import ExtractionPipeline

from .conftest import scripted_router

# --------------------------------------------------------------------------- scoring unit


def test_passes_gate_is_inclusive_of_the_threshold() -> None:
    assert passes_gate(0.5, 0.5) is True
    assert passes_gate(0.49, 0.5) is False
    assert passes_gate(0.8, 0.5) is True


def test_score_confidence_is_bounded_and_authority_weighted() -> None:
    regulatory = score_confidence(0.9, source_authority="regulatory", completeness=0.5)
    operational = score_confidence(0.9, source_authority="operational", completeness=0.5)
    assert 0.0 <= operational <= regulatory <= 1.0
    # A perfect model confidence cannot exceed 1.0 even at full completeness.
    assert score_confidence(1.0, source_authority="regulatory", completeness=1.0) <= 1.0


# --------------------------------------------------------------------------- pipeline gate


def _doc() -> CanonicalDocument:
    return CanonicalDocument(
        id="doc-gate",
        sourceType="filesystem",
        sourcePath="gate.md",
        sourceVersion="1",
        fetchedAt="2026-01-01T00:00:00.000Z",
        sourceAuthority="scheme",
        content="x",
        title="Gate",
        sections=[DocumentSection(id="s1", title="Only", content="content")],
    )


async def test_below_threshold_entity_is_excluded_and_counted(tmp_path: Path) -> None:
    script: dict[str, dict[str, dict[str, Any]]] = {
        "doc-gate": {
            "Only": {
                "entities": [
                    {
                        "type": "DomainConcept",
                        "name": "Kept Concept",
                        "conceptType": "aggregate",
                        "confidence": 0.92,
                    },
                    {
                        "type": "DomainConcept",
                        "name": "Dropped Concept",
                        "conceptType": "aggregate",
                        "confidence": 0.4,
                    },
                ],
            }
        }
    }
    gateway = FakeGateway(router=scripted_router(script))
    pipeline = ExtractionPipeline(gateway)
    result = await pipeline.run(
        [_doc()], ExtractionConfig(confidenceThreshold=0.5), tmp_path
    )

    entities = read_jsonl(Path(result.outputFiles.extractions))
    names = {line["data"]["name"] for line in entities}
    assert names == {"Kept Concept"}
    assert result.stats.belowThreshold == 1
    assert result.stats.entitiesExtracted == 1
