"""Contract — the behaviour pass is additive (feature 02 §8, §10; acceptance criterion 6).

Enabling the behaviour pass must not change the ``ExtractionPipeline`` / ``LLMGateway``
signatures, must stay deterministic through the fake gateway, and — critically — must **not
perturb the Phase 1 structural pass**. The overloaded ``consumes`` edge (a Decision consuming
ReferenceData in Phase 1; a Service consuming an Event in behaviour) is the canary: turning the
behaviour types on must not quarantine the structural one.
"""

from __future__ import annotations

import inspect
from pathlib import Path
from typing import Any

from dkm_enrichment.emission import read_jsonl
from dkm_enrichment.gateway.base import LLMGateway
from dkm_enrichment.gateway.fake import FakeGateway
from dkm_enrichment.models import (
    PHASE_0A_L1_TYPES,
    CanonicalDocument,
    DocumentSection,
    ExtractionConfig,
    ExtractionResult,
    JsonlEntry,
)
from dkm_enrichment.pipeline import ExtractionPipeline

from .conftest import behaviour_targets, scripted_router


def _structural_doc() -> CanonicalDocument:
    return CanonicalDocument(
        id="doc-structural",
        sourceType="filesystem",
        sourcePath="settlement.md",
        sourceVersion="1",
        fetchedAt="2026-01-01T00:00:00.000Z",
        sourceAuthority="scheme",
        content="x",
        title="Settlement",
        sections=[DocumentSection(id="s1", title="Net Settlement", content="content")],
    )


def _structural_script() -> dict[str, dict[str, dict[str, Any]]]:
    return {
        "doc-structural": {
            "Net Settlement": {
                "entities": [
                    {"type": "DomainConcept", "name": "Settlement",
                     "conceptType": "aggregate", "confidence": 0.92},
                    {"type": "Decision", "name": "Net Settlement",
                     "decisionType": "automated", "outcomes": ["net", "gross"],
                     "confidence": 0.92},
                    {"type": "ReferenceData", "name": "Scheme Fee Table",
                     "owner": "Scheme Operations", "confidence": 0.92},
                ],
                "relationships": [
                    # Phase 1's overloaded `consumes`: Decision → ReferenceData.
                    {"type": "consumes", "source": "Net Settlement",
                     "target": "Scheme Fee Table", "confidence": 0.9},
                ],
            }
        }
    }


def _entity_keys(result: ExtractionResult) -> set[tuple[str, str]]:
    return {(e.type, _name(e)) for e in result.entities}


def _rel_keys(result: ExtractionResult) -> set[tuple[str, str, str]]:
    id_to_name = {e.id: _name(e) for e in result.entities}
    return {
        (
            r.data["relationshipType"],
            id_to_name.get(r.data["sourceEntityId"], "?"),
            id_to_name.get(r.data["targetEntityId"], "?"),
        )
        for r in result.relationships
    }


def _name(entry: JsonlEntry) -> str:
    for key in ("name", "statement", "expression"):
        value = entry.data.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return entry.id


def test_gateway_and_pipeline_signatures_are_unchanged() -> None:
    assert isinstance(FakeGateway(), LLMGateway)
    assert list(inspect.signature(ExtractionPipeline.run).parameters) == [
        "self", "documents", "config", "output_dir",
    ]
    assert list(inspect.signature(ExtractionPipeline.extract_single).parameters) == [
        "self", "document", "config",
    ]
    assert list(inspect.signature(LLMGateway.extract_structured).parameters) == [
        "self", "prompt", "schema", "options",
    ]


async def test_enabling_behaviour_types_does_not_change_structural_extraction() -> None:
    pipeline = ExtractionPipeline(FakeGateway(router=scripted_router(_structural_script())))

    structural_only = await pipeline.extract_single(
        _structural_doc(), ExtractionConfig(targetTypes=list(PHASE_0A_L1_TYPES))
    )
    with_behaviour = await pipeline.extract_single(
        _structural_doc(), ExtractionConfig(targetTypes=behaviour_targets())
    )

    assert _entity_keys(structural_only) == _entity_keys(with_behaviour)
    assert _rel_keys(structural_only) == _rel_keys(with_behaviour)
    # And the structural consumes edge is present in both.
    assert ("consumes", "Net Settlement", "Scheme Fee Table") in _rel_keys(with_behaviour)


async def test_structural_consumes_survives_behavioural_gate_on_run(tmp_path: Path) -> None:
    pipeline = ExtractionPipeline(FakeGateway(router=scripted_router(_structural_script())))
    result = await pipeline.run(
        [_structural_doc()], ExtractionConfig(targetTypes=behaviour_targets()), tmp_path
    )
    rels = read_jsonl(Path(result.outputFiles.relationships))
    kinds = [(r["data"]["relationshipType"]) for r in rels]
    assert kinds == ["consumes"]
    # The Phase 1 consumes(Decision → ReferenceData) edge is NOT a behavioural edge, so the
    # behavioural endpoint gate leaves it untouched.
    assert result.stats.quarantined == 0
    assert result.stats.relationshipsExtracted == 1


async def test_fake_gateway_keeps_the_pass_deterministic(tmp_path: Path) -> None:
    pipeline = ExtractionPipeline(FakeGateway(router=scripted_router(_structural_script())))
    first = await pipeline.run(
        [_structural_doc()], ExtractionConfig(targetTypes=behaviour_targets()), tmp_path / "a"
    )
    second = await pipeline.run(
        [_structural_doc()], ExtractionConfig(targetTypes=behaviour_targets()), tmp_path / "b"
    )
    a_entities = [e["data"].get("name") for e in read_jsonl(Path(first.outputFiles.extractions))]
    b_entities = [e["data"].get("name") for e in read_jsonl(Path(second.outputFiles.extractions))]
    assert a_entities == b_entities
    assert FakeGateway().models_used == set()  # no network seam touched
