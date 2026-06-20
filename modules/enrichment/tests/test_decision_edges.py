"""Unit — decision-specific relationship extraction & quarantine (feature 03 §8 crit. 2 + D-P2.5).

The six decision-specific edges (``evaluates``/``consumes``/``constrainedBy``/``triggeredBy``/
``produces``/``realizedBy``) are emitted with endpoints that reference committed entity ids and
validate against ``schemas/relationships/decision-specific.schema.json``. Edges with the wrong
endpoint *types*, or whose endpoint is not (yet) committed — e.g. ``evaluates → a Rule`` excluded
below the emit gate, or ``realizedBy → a Service`` (an L2/L3 endpoint that arrives in Phase 3) —
are **quarantined to the review queue and counted**, never written as dangling edges (D-P2.5).
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

from .conftest import decision_targets, scripted_router


def _doc(doc_id: str = "doc-decision-edges") -> CanonicalDocument:
    return CanonicalDocument(
        id=doc_id,
        sourceType="filesystem",
        sourcePath="decision-edges.md",
        sourceVersion="1",
        fetchedAt="2026-01-01T00:00:00.000Z",
        sourceAuthority="scheme",
        content="x",
        title="Decision Edges",
        sections=[DocumentSection(id="s1", title="Decisions", content="content")],
    )


def _config() -> ExtractionConfig:
    return ExtractionConfig(targetTypes=decision_targets())


async def _run(
    script: dict[str, Any], tmp_path: Path
) -> tuple[Any, list[dict[str, Any]], set[str]]:
    pipeline = ExtractionPipeline(FakeGateway(router=scripted_router(script)))
    result = await pipeline.run([_doc()], _config(), tmp_path)
    rels = read_jsonl(Path(result.outputFiles.relationships))
    emitted_ids = {e["id"] for e in read_jsonl(Path(result.outputFiles.extractions))}
    return result, rels, emitted_ids


def _decision(name: str, decision_type: str = "automated") -> dict[str, Any]:
    return {
        "type": "Decision",
        "name": name,
        "decisionType": decision_type,
        "outcomes": ["approve", "decline"],
        "confidence": 0.92,
    }


def _rule(expression: str, rule_type: str = "decision") -> dict[str, Any]:
    return {"type": "Rule", "expression": expression, "ruleType": rule_type, "confidence": 0.92}


def _reference_data(name: str) -> dict[str, Any]:
    return {"type": "ReferenceData", "name": name, "owner": "Risk Team", "confidence": 0.92}


def _invariant(statement: str) -> dict[str, Any]:
    return {
        "type": "BusinessInvariant",
        "statement": statement,
        "severity": "high",
        "scope": "context-specific",
        "confidence": 0.92,
    }


def _event(name: str, event_type: str = "domain") -> dict[str, Any]:
    return {"type": "Event", "name": name, "eventType": event_type, "confidence": 0.92}


def _transition(name: str) -> dict[str, Any]:
    return {
        "type": "StateTransition",
        "name": name,
        "entity": "Payment",
        "fromState": "pending",
        "toState": "authorised",
        "confidence": 0.92,
    }


async def test_valid_decision_edges_are_emitted(tmp_path: Path) -> None:
    script = {
        "doc-decision-edges": {
            "Decisions": {
                "entities": [
                    _decision("Authorise Payment"),
                    _rule("Available funds must cover the amount", "validation"),
                    _reference_data("Card Status Reference"),
                    _invariant("An authorisation must never exceed the available balance"),
                    _event("AuthorisationRequested", "integration"),
                    _event("PaymentAuthorised"),
                    _transition("Payment authorised"),
                ],
                "relationships": [
                    {"type": "evaluates", "source": "Authorise Payment",
                     "target": "Available funds must cover the amount", "confidence": 0.9},
                    {"type": "consumes", "source": "Authorise Payment",
                     "target": "Card Status Reference", "confidence": 0.9},
                    {"type": "constrainedBy", "source": "Authorise Payment",
                     "target": "An authorisation must never exceed the available balance",
                     "confidence": 0.9},
                    {"type": "triggeredBy", "source": "AuthorisationRequested",
                     "target": "Authorise Payment", "confidence": 0.9},
                    {"type": "produces", "source": "Authorise Payment",
                     "target": "PaymentAuthorised", "confidence": 0.9},
                    {"type": "produces", "source": "Authorise Payment",
                     "target": "Payment authorised", "confidence": 0.9},
                ],
            }
        }
    }
    result, rels, emitted_ids = await _run(script, tmp_path)

    kinds = sorted(r["data"]["relationshipType"] for r in rels)
    assert kinds == ["constrainedBy", "consumes", "evaluates", "produces", "produces",
                     "triggeredBy"]
    for r in rels:
        assert r["data"]["sourceEntityId"] in emitted_ids
        assert r["data"]["targetEntityId"] in emitted_ids
    assert result.stats.relationshipsExtracted == 6
    assert result.stats.quarantined == 0


async def test_triggered_by_from_committed_step_is_committed(tmp_path: Path) -> None:
    # triggeredBy(OrchestrationStep → Decision): both committed in the decision pass → committed.
    script = {
        "doc-decision-edges": {
            "Decisions": {
                "entities": [
                    {"type": "OrchestrationStep", "name": "Score Risk", "sequence": 0,
                     "actionType": "evaluate-decision", "confidence": 0.92},
                    _decision("Score Transaction Risk"),
                    _rule("High scores are high risk"),
                    _event("RiskScored"),
                ],
                "relationships": [
                    {"type": "triggeredBy", "source": "Score Risk",
                     "target": "Score Transaction Risk", "confidence": 0.9},
                    {"type": "evaluates", "source": "Score Transaction Risk",
                     "target": "High scores are high risk", "confidence": 0.9},
                    {"type": "produces", "source": "Score Transaction Risk",
                     "target": "RiskScored", "confidence": 0.9},
                ],
            }
        }
    }
    result, rels, _ = await _run(script, tmp_path)
    assert sorted(r["data"]["relationshipType"] for r in rels) == [
        "evaluates", "produces", "triggeredBy"
    ]
    assert result.stats.quarantined == 0


async def test_evaluates_to_placeholder_rule_is_quarantined(tmp_path: Path) -> None:
    # The Rule is referenced but excluded below the 0.5 emit gate (a cross-pass placeholder).
    # The evaluates edge must be quarantined + counted, never written as a dangling edge.
    script = {
        "doc-decision-edges": {
            "Decisions": {
                "entities": [
                    _decision("Authorise Payment"),
                    {"type": "Rule", "expression": "Future rule", "ruleType": "decision",
                     "confidence": 0.25},  # below the 0.5 emit gate → placeholder
                    _event("PaymentAuthorised"),
                ],
                "relationships": [
                    {"type": "evaluates", "source": "Authorise Payment",
                     "target": "Future rule", "confidence": 0.9},
                    {"type": "produces", "source": "Authorise Payment",
                     "target": "PaymentAuthorised", "confidence": 0.9},
                ],
            }
        }
    }
    result, rels, _ = await _run(script, tmp_path)
    assert [r["data"]["relationshipType"] for r in rels] == ["produces"]
    assert result.stats.quarantined == 1


async def test_realized_by_wrong_endpoint_type_is_quarantined(tmp_path: Path) -> None:
    # realizedBy(Decision → Service|Component): pointed at a committed Event it is the wrong
    # endpoint type and must be quarantined against the decision-specific schema. (A genuine
    # realizedBy → Service is a cross-pass recall gap — Service is an L2/L3 endpoint, Phase 3 —
    # so it never reaches this gate; it is exercised as a label in the golden set instead.)
    script = {
        "doc-decision-edges": {
            "Decisions": {
                "entities": [
                    _decision("Authorise Payment"),
                    _rule("Available funds must cover the amount", "validation"),
                    _event("PaymentAuthorised"),
                ],
                "relationships": [
                    {"type": "evaluates", "source": "Authorise Payment",
                     "target": "Available funds must cover the amount", "confidence": 0.9},
                    {"type": "produces", "source": "Authorise Payment",
                     "target": "PaymentAuthorised", "confidence": 0.9},
                    {"type": "realizedBy", "source": "Authorise Payment",
                     "target": "PaymentAuthorised", "confidence": 0.9},
                ],
            }
        }
    }
    result, rels, _ = await _run(script, tmp_path)
    assert sorted(r["data"]["relationshipType"] for r in rels) == ["evaluates", "produces"]
    assert result.stats.quarantined == 1


async def test_wrong_endpoint_types_are_quarantined(tmp_path: Path) -> None:
    # evaluates requires a Rule|BusinessInvariant target; a ReferenceData target is the wrong
    # endpoint type and must be quarantined against the decision-specific schema, not committed.
    script = {
        "doc-decision-edges": {
            "Decisions": {
                "entities": [
                    _decision("Authorise Payment"),
                    _reference_data("Card Status Reference"),
                    _event("PaymentAuthorised"),
                ],
                "relationships": [
                    {"type": "evaluates", "source": "Authorise Payment",
                     "target": "Card Status Reference", "confidence": 0.9},
                    {"type": "produces", "source": "Authorise Payment",
                     "target": "PaymentAuthorised", "confidence": 0.9},
                ],
            }
        }
    }
    result, rels, _ = await _run(script, tmp_path)
    assert [r["data"]["relationshipType"] for r in rels] == ["produces"]
    assert result.stats.quarantined == 1


def test_decision_schema_validation_covers_all_six_edge_kinds() -> None:
    # The decision-specific endpoint check admits each valid {kind: (sourceType, targetType)}
    # pair and rejects a wrong one — mirroring validate_behavioural_relationship.
    validator = SchemaValidator()
    valid = [
        ("evaluates", "Decision", "Rule"),
        ("evaluates", "Decision", "BusinessInvariant"),
        ("consumes", "Decision", "ReferenceData"),
        ("constrainedBy", "Decision", "BusinessInvariant"),
        ("triggeredBy", "Event", "Decision"),
        ("triggeredBy", "OrchestrationStep", "Decision"),
        ("produces", "Decision", "Event"),
        ("produces", "Decision", "StateTransition"),
        ("realizedBy", "Decision", "Service"),
    ]
    for kind, source_type, target_type in valid:
        outcome = validator.validate_decision_relationship(kind, source_type, target_type)
        assert outcome.valid, (kind, outcome.error)

    # Wrong endpoint type for produces (Decision → Rule is not an outcome endpoint).
    bad = validator.validate_decision_relationship("produces", "Decision", "Rule")
    assert not bad.valid
    # triggeredBy must point AT a Decision, not away from one.
    bad_dir = validator.validate_decision_relationship("triggeredBy", "Decision", "Event")
    assert not bad_dir.valid
