"""Unit — behavioural relationship extraction & quarantine (feature 02 §8, criterion 3 + D-P2.5).

Valid behavioural edges (``triggers``/``emits``/``transitionsTo``/``compensates``/``invokes``)
are emitted with endpoints that reference emitted entity ids and validate against
``schemas/relationships/behavioural.schema.json``. Edges with the wrong endpoint *types*, or
whose endpoint is not (yet) committed — e.g. ``invokes(Step → Decision)`` before the Decision
pass — are **quarantined to the review queue and counted**, never written as dangling edges
(D-P2.5).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from dkm_enrichment.emission import read_jsonl
from dkm_enrichment.gateway.fake import FakeGateway
from dkm_enrichment.models import (
    CanonicalDocument,
    DocumentSection,
    ExtractionConfig,
)
from dkm_enrichment.pipeline import ExtractionPipeline
from dkm_enrichment.schema_validation import SchemaValidator

from .conftest import behaviour_targets, scripted_router


def _doc(doc_id: str = "doc-edges") -> CanonicalDocument:
    return CanonicalDocument(
        id=doc_id,
        sourceType="filesystem",
        sourcePath="edges.md",
        sourceVersion="1",
        fetchedAt="2026-01-01T00:00:00.000Z",
        sourceAuthority="scheme",
        content="x",
        title="Edges",
        sections=[DocumentSection(id="s1", title="Flow", content="content")],
    )


def _config() -> ExtractionConfig:
    return ExtractionConfig(targetTypes=behaviour_targets())


async def _run(
    script: dict[str, Any], tmp_path: Path
) -> tuple[Any, list[dict[str, Any]], set[str]]:
    pipeline = ExtractionPipeline(FakeGateway(router=scripted_router(script)))
    result = await pipeline.run([_doc()], _config(), tmp_path)
    rels = read_jsonl(Path(result.outputFiles.relationships))
    emitted_ids = {e["id"] for e in read_jsonl(Path(result.outputFiles.extractions))}
    return result, rels, emitted_ids


def _flow(name: str, steps: list[str]) -> dict[str, Any]:
    return {"type": "OrchestrationFlow", "name": name, "steps": steps, "confidence": 0.92}


def _step(name: str, sequence: int, action: str = "invoke-service") -> dict[str, Any]:
    return {
        "type": "OrchestrationStep",
        "name": name,
        "sequence": sequence,
        "actionType": action,
        "confidence": 0.92,
    }


def _event(name: str, event_type: str = "domain") -> dict[str, Any]:
    return {"type": "Event", "name": name, "eventType": event_type, "confidence": 0.92}


def _transition(name: str) -> dict[str, Any]:
    return {
        "type": "StateTransition",
        "name": name,
        "entity": "Payment",
        "fromState": "a",
        "toState": "b",
        "confidence": 0.92,
    }


async def test_valid_behavioural_edges_are_emitted(tmp_path: Path) -> None:
    script = {
        "doc-edges": {
            "Flow": {
                "entities": [
                    _flow("Saga Flow", ["Reserve", "Release", "Publish"]),
                    _step("Reserve", 0),
                    _step("Release", 1, "compensate"),
                    _step("Publish", 2, "publish-event"),
                    _event("Reserved"),
                    _event("FlowStarted", "integration"),
                    _transition("Reserved transition"),
                ],
                "relationships": [
                    {"type": "triggers", "source": "FlowStarted", "target": "Saga Flow",
                     "confidence": 0.9},
                    {"type": "emits", "source": "Publish", "target": "Reserved",
                     "confidence": 0.9},
                    {"type": "transitionsTo", "source": "Reserve",
                     "target": "Reserved transition", "confidence": 0.9},
                    {"type": "compensates", "source": "Release", "target": "Reserve",
                     "confidence": 0.9},
                ],
            }
        }
    }
    result, rels, emitted_ids = await _run(script, tmp_path)

    kinds = {r["data"]["relationshipType"] for r in rels}
    assert kinds == {"triggers", "emits", "transitionsTo", "compensates"}
    # Every emitted edge references emitted entity ids (never dangling).
    for r in rels:
        assert r["data"]["sourceEntityId"] in emitted_ids
        assert r["data"]["targetEntityId"] in emitted_ids
    assert result.stats.relationshipsExtracted == 4
    assert result.stats.quarantined == 0


async def test_invokes_to_resolved_decision_is_committed(tmp_path: Path) -> None:
    script = {
        "doc-edges": {
            "Flow": {
                "entities": [
                    _step("Score", 0, "evaluate-decision"),
                    {
                        "type": "Decision",
                        "name": "Score Risk",
                        "decisionType": "automated",
                        "outcomes": ["low", "high"],
                        "confidence": 0.92,
                    },
                ],
                "relationships": [
                    {"type": "invokes", "source": "Score", "target": "Score Risk",
                     "confidence": 0.9},
                ],
            }
        }
    }
    result, rels, _ = await _run(script, tmp_path)
    assert [r["data"]["relationshipType"] for r in rels] == ["invokes"]
    assert result.stats.quarantined == 0


async def test_invokes_to_placeholder_decision_is_quarantined(tmp_path: Path) -> None:
    # The Decision is referenced but excluded from the committed set (it arrives in Feature 03's
    # pass). The invokes edge must be quarantined + counted, never written as a dangling edge.
    script = {
        "doc-edges": {
            "Flow": {
                "entities": [
                    _step("Score", 0, "evaluate-decision"),
                    {
                        "type": "Decision",
                        "name": "Future Decision",
                        "decisionType": "automated",
                        "outcomes": ["a", "b"],
                        "confidence": 0.25,  # below the 0.5 emit gate → excluded → placeholder
                    },
                ],
                "relationships": [
                    {"type": "invokes", "source": "Score", "target": "Future Decision",
                     "confidence": 0.9},
                ],
            }
        }
    }
    result, rels, emitted_ids = await _run(script, tmp_path)
    assert rels == []  # nothing dangling committed
    assert result.stats.quarantined == 1
    # The Step is committed; the placeholder Decision is not.
    assert result.stats.entitiesExtracted == 1


async def test_invalid_endpoint_types_are_quarantined(tmp_path: Path) -> None:
    # triggers requires an Event/Command source; a Step source is the wrong endpoint type and
    # must be quarantined against the behavioural schema rather than committed.
    script = {
        "doc-edges": {
            "Flow": {
                "entities": [
                    _flow("Bad Flow", ["Kick"]),
                    _step("Kick", 0),
                ],
                "relationships": [
                    {"type": "triggers", "source": "Kick", "target": "Bad Flow",
                     "confidence": 0.9},
                ],
            }
        }
    }
    result, rels, _ = await _run(script, tmp_path)
    assert rels == []
    assert result.stats.quarantined == 1


def test_behavioural_schema_validation_covers_all_six_edge_kinds() -> None:
    # The behavioural-schema endpoint check (reused from schema_validation) admits each valid
    # {kind: (sourceType, targetType)} pair and rejects a wrong one — including consumes
    # (Service → Event), whose Service endpoint is out of scope for the golden set.
    validator = SchemaValidator()
    valid = [
        ("triggers", "Event", "OrchestrationFlow"),
        ("emits", "OrchestrationStep", "Event"),
        ("consumes", "Service", "Event"),
        ("transitionsTo", "OrchestrationStep", "StateTransition"),
        ("compensates", "OrchestrationStep", "OrchestrationStep"),
        ("invokes", "OrchestrationStep", "Decision"),
    ]
    for kind, source_type, target_type in valid:
        outcome = validator.validate_behavioural_relationship(kind, source_type, target_type)
        assert outcome.valid, (kind, outcome.error)

    bad = validator.validate_behavioural_relationship("triggers", "OrchestrationStep", "Event")
    assert not bad.valid
