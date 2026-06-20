"""Unit — step sequencing & flow membership (feature 02 §8, acceptance criterion 2).

Ordered steps keep their zero-based ``sequence`` through extraction and the owning
``OrchestrationFlow`` lists its steps in document order. Out-of-order / unnumbered inputs are
preserved as the model emits them (the prompt instructs appearance-order numbering).
"""

from __future__ import annotations

from typing import Any

from dkm_enrichment.gateway.fake import FakeGateway
from dkm_enrichment.models import (
    CanonicalDocument,
    DocumentSection,
    ExtractionConfig,
)
from dkm_enrichment.pipeline import ExtractionPipeline

from .conftest import behaviour_targets, scripted_router


def _doc() -> CanonicalDocument:
    return CanonicalDocument(
        id="doc-seq",
        sourceType="filesystem",
        sourcePath="seq.md",
        sourceVersion="1",
        fetchedAt="2026-01-01T00:00:00.000Z",
        sourceAuthority="scheme",
        content="x",
        title="Seq",
        sections=[DocumentSection(id="s1", title="Flow", content="content")],
    )


def _flow_script(steps: list[dict[str, Any]], flow_steps: list[str]) -> dict[str, Any]:
    return {
        "doc-seq": {
            "Flow": {
                "entities": [
                    {
                        "type": "OrchestrationFlow",
                        "name": "Ordered Flow",
                        "steps": flow_steps,
                        "confidence": 0.9,
                    },
                    *steps,
                ]
            }
        }
    }


def _step(name: str, sequence: int) -> dict[str, Any]:
    return {
        "type": "OrchestrationStep",
        "name": name,
        "sequence": sequence,
        "actionType": "invoke-service",
        "confidence": 0.9,
    }


async def _extract(script: dict[str, Any]) -> list[Any]:
    pipeline = ExtractionPipeline(FakeGateway(router=scripted_router(script)))
    result = await pipeline.extract_single(
        _doc(), ExtractionConfig(targetTypes=behaviour_targets())
    )
    return result.entities


async def test_ordered_steps_preserve_sequence_and_membership() -> None:
    steps = [_step("Validate", 0), _step("Reserve", 1), _step("Capture", 2)]
    entities = await _extract(_flow_script(steps, ["Validate", "Reserve", "Capture"]))

    step_seq = {
        e.data["name"]: e.data["sequence"] for e in entities if e.type == "OrchestrationStep"
    }
    assert step_seq == {"Validate": 0, "Reserve": 1, "Capture": 2}

    flow = next(e for e in entities if e.type == "OrchestrationFlow")
    # The owning flow lists its steps in document order (step → flow membership).
    assert flow.data["steps"] == ["Validate", "Reserve", "Capture"]


async def test_unnumbered_steps_take_appearance_order() -> None:
    # The model assigns sequence by appearance when the document does not number steps;
    # the pipeline preserves whatever it emits, contiguous from zero.
    steps = [_step("Open", 0), _step("Work", 1), _step("Close", 2)]
    entities = await _extract(_flow_script(steps, ["Open", "Work", "Close"]))
    sequences = sorted(
        e.data["sequence"] for e in entities if e.type == "OrchestrationStep"
    )
    assert sequences == [0, 1, 2]


async def test_out_of_order_emission_is_preserved_not_reindexed() -> None:
    # If steps arrive out of order, the pipeline does not silently re-index them — the emitted
    # sequence is the model's, so a downstream consumer can detect and review the anomaly.
    steps = [_step("Second", 1), _step("First", 0)]
    entities = await _extract(_flow_script(steps, ["First", "Second"]))
    step_seq = {
        e.data["name"]: e.data["sequence"] for e in entities if e.type == "OrchestrationStep"
    }
    assert step_seq == {"First": 0, "Second": 1}
