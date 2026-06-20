"""Integration — decision docs → both JSONL files → schema-valid (feature 03 §8, criteria 1-5, 7).

Drives a decision-log fixture through the full ``run`` and validates every emitted line against the
canonical ``/schemas``: entities against their type schema, decision-specific edges against the
intermediate relationship shape with endpoint types that satisfy
``schemas/relationships/decision-specific.schema.json``. It also proves the cross-pass contract
(D-P2.5): a ``triggeredBy(Step → Decision)`` whose Decision the behaviour pass (2.2) could only
quarantine now **commits** because the decision pass extracts the Decision; a wrong-typed
``realizedBy`` edge is quarantined (a genuine ``realizedBy → Service`` is a Phase 3 recall gap that
never reaches this gate — it is exercised as a label in the golden set); and a Decision missing
``produces`` is flagged for review.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from dkm_enrichment.emission import read_jsonl
from dkm_enrichment.gateway.fake import FakeGateway
from dkm_enrichment.models import (
    DECISION_SPECIFIC_RELATIONSHIP_TYPES,
    CanonicalDocument,
    DocumentSection,
    ExtractionConfig,
)
from dkm_enrichment.pipeline import ExtractionPipeline
from dkm_enrichment.schema_validation import SchemaValidator

from .conftest import decision_targets, scripted_router

_DOC_ID = "doc-decision-e2e"
_SECTION = "Authorisation Decisions"


def _document() -> CanonicalDocument:
    return CanonicalDocument(
        id=_DOC_ID,
        sourceType="filesystem",
        sourcePath="payments/authorisation-decisions.md",
        sourceVersion="1",
        fetchedAt="2026-01-01T00:00:00.000Z",
        sourceAuthority="scheme",
        content="(sections carry the content)",
        title="Authorisation Decision Log",
        sections=[DocumentSection(id="s1", title=_SECTION, content="content")],
    )


def _script() -> dict[str, dict[str, dict[str, Any]]]:
    return {
        _DOC_ID: {
            _SECTION: {
                "entities": [
                    {"type": "OrchestrationStep", "name": "Score Risk", "sequence": 0,
                     "actionType": "evaluate-decision", "confidence": 0.92},
                    {"type": "Decision", "name": "Authorise Payment", "decisionType": "automated",
                     "inputs": ["available balance"], "outcomes": ["approve", "decline", "refer"],
                     "owner": "Authorisation Team", "confidence": 0.92},
                    {"type": "Decision", "name": "Score Transaction Risk",
                     "decisionType": "automated", "outcomes": ["low", "medium", "high"],
                     "confidence": 0.92},
                    {"type": "Rule", "expression": "Available funds must cover the amount",
                     "ruleType": "validation", "confidence": 0.92},
                    {"type": "Rule", "expression": "High scores are treated as high risk",
                     "ruleType": "decision", "confidence": 0.92},
                    {"type": "ReferenceData", "name": "Card Status Reference",
                     "owner": "Card Ops", "confidence": 0.92},
                    {"type": "BusinessInvariant",
                     "statement": "An authorisation must never exceed the available balance",
                     "severity": "high", "scope": "context-specific", "confidence": 0.92},
                    {"type": "Event", "name": "AuthorisationRequested", "eventType": "integration",
                     "confidence": 0.92},
                    {"type": "Event", "name": "PaymentAuthorised", "eventType": "domain",
                     "confidence": 0.92},
                    {"type": "StateTransition", "name": "Payment authorised", "entity": "Payment",
                     "fromState": "pending", "toState": "authorised", "confidence": 0.92},
                ],
                "relationships": [
                    {"type": "triggeredBy", "source": "AuthorisationRequested",
                     "target": "Authorise Payment", "confidence": 0.9},
                    {"type": "evaluates", "source": "Authorise Payment",
                     "target": "Available funds must cover the amount", "confidence": 0.9},
                    {"type": "consumes", "source": "Authorise Payment",
                     "target": "Card Status Reference", "confidence": 0.9},
                    {"type": "constrainedBy", "source": "Authorise Payment",
                     "target": "An authorisation must never exceed the available balance",
                     "confidence": 0.9},
                    {"type": "produces", "source": "Authorise Payment",
                     "target": "PaymentAuthorised", "confidence": 0.9},
                    {"type": "produces", "source": "Authorise Payment",
                     "target": "Payment authorised", "confidence": 0.9},
                    # Cross-pass: a Step triggers a Decision the behaviour pass could only
                    # quarantine — it now commits because the decision pass extracts the Decision.
                    {"type": "triggeredBy", "source": "Score Risk",
                     "target": "Score Transaction Risk", "confidence": 0.9},
                    {"type": "evaluates", "source": "Score Transaction Risk",
                     "target": "High scores are treated as high risk", "confidence": 0.9},
                    # realizedBy pointed at a committed non-Service endpoint is the wrong type →
                    # quarantined. (A genuine realizedBy → Service is a Phase 3 recall gap — Service
                    # isn't extractable yet, so it never reaches this gate; it is a golden label.)
                    {"type": "realizedBy", "source": "Score Transaction Risk",
                     "target": "PaymentAuthorised", "confidence": 0.9},
                ],
            }
        }
    }


async def _run(tmp_path: Path) -> tuple[Any, list[dict[str, Any]], list[dict[str, Any]]]:
    pipeline = ExtractionPipeline(FakeGateway(router=scripted_router(_script())))
    result = await pipeline.run(
        [_document()], ExtractionConfig(targetTypes=decision_targets()), tmp_path
    )
    entities = read_jsonl(Path(result.outputFiles.extractions))
    relationships = read_jsonl(Path(result.outputFiles.relationships))
    return result, entities, relationships


async def test_decision_pass_emits_only_schema_valid_lines(tmp_path: Path) -> None:
    result, entities, relationships = await _run(tmp_path)
    validator = SchemaValidator()

    assert entities and relationships
    decision_names = {e["data"]["name"] for e in entities if e["type"] == "Decision"}
    assert {"Authorise Payment", "Score Transaction Risk"} <= decision_names

    # Every entity line validates against its canonical inventory schema.
    by_id_type: dict[str, str] = {}
    for line in entities:
        outcome = validator.validate_data(line["type"], line["data"])
        assert outcome.valid, f"{line['type']} invalid: {outcome.error}"
        by_id_type[line["id"]] = line["type"]

    # Every relationship references committed entities; decision edges have valid endpoint types.
    emitted_ids = set(by_id_type)
    for line in relationships:
        assert line["type"] == "Relationship"
        data = line["data"]
        assert validator.validate_entry("Relationship", data).valid
        assert data["sourceEntityId"] in emitted_ids
        assert data["targetEntityId"] in emitted_ids
        if data["relationshipType"] in DECISION_SPECIFIC_RELATIONSHIP_TYPES:
            endpoint = validator.validate_decision_relationship(
                data["relationshipType"],
                by_id_type[data["sourceEntityId"]],
                by_id_type[data["targetEntityId"]],
            )
            assert endpoint.valid, (data["relationshipType"], endpoint.error)

    # The realizedBy → Service edge was quarantined, never written dangling.
    assert "realizedBy" not in {r["data"]["relationshipType"] for r in relationships}
    assert result.stats.quarantined == 1


async def test_cardinality_flag_and_clean_decision_coexist(tmp_path: Path) -> None:
    result, entities, _ = await _run(tmp_path)

    decisions = {e["data"]["name"]: e for e in entities if e["type"] == "Decision"}
    # Authorise Payment is fully wired (evaluates + produces + triggeredBy) → committed clean.
    assert (decisions["Authorise Payment"].get("metadata") or {}).get("reviewQueue") is None
    # Score Transaction Risk has evaluates + triggeredBy but no produces → flagged for review.
    flagged = decisions["Score Transaction Risk"]["metadata"]
    assert flagged["reviewQueue"] == "cardinality"
    assert "produces>=1" in flagged["cardinalityViolations"]
    assert result.stats.cardinalityFlagged == 1


async def test_decision_payload_survives_to_jsonl(tmp_path: Path) -> None:
    _, entities, _ = await _run(tmp_path)
    authorise = next(
        e for e in entities if e["type"] == "Decision" and e["data"]["name"] == "Authorise Payment"
    )
    assert authorise["data"]["decisionType"] == "automated"
    assert authorise["data"]["outcomes"] == ["approve", "decline", "refer"]
    # Every asserted fact is evidenced + versioned (CLAUDE.md conventions).
    assert authorise["data"]["evidencedBy"]
    assert authorise["data"]["version"]
