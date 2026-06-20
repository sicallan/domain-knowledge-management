"""Unit — decision prompt templates (feature 03 §8, tasks 1-2; D-P2.7).

Decision is the highest-value node, so it gets a dedicated, **versioned** prompt template that
sharpens entity extraction *and* encodes the Decision-vs-Rule boundary (feature 03 §11 risk: a
Decision *uses* rules but is not a rule). The library auto-selects the latest version; adding the
new ``decision.v2.md`` is purely additive (no engine change, D-P2.7 / spec 005 Decision 1). The
deterministic fake then turns a canned decision-log chunk into a schema-valid ``Decision`` entity.
"""

from __future__ import annotations

from typing import Any

from dkm_enrichment.extraction_schemas import build_entity_result_schema
from dkm_enrichment.gateway.fake import FakeGateway
from dkm_enrichment.models import (
    DECISION_SPECIFIC_RELATIONSHIP_TYPES,
    DECISION_TYPE,
    PHASE_0A_L1_TYPES,
    CanonicalDocument,
    DocumentSection,
    ExtractionConfig,
)
from dkm_enrichment.pipeline import ExtractionPipeline
from dkm_enrichment.prompts import PromptLibrary
from dkm_enrichment.prompts.library import TYPE_TEMPLATE_NAMES
from dkm_enrichment.schema_validation import SchemaValidator

from .conftest import decision_targets, scripted_router


def test_decision_constants_are_additive() -> None:
    assert DECISION_TYPE == "Decision"
    # Decision stays a Phase 0a structural target (Feature 03 owns it), never a behaviour type.
    assert DECISION_TYPE in PHASE_0A_L1_TYPES
    # The six decision-specific edges (schemas/relationships/decision-specific.schema.json, 2.1).
    assert DECISION_SPECIFIC_RELATIONSHIP_TYPES == (
        "evaluates",
        "consumes",
        "constrainedBy",
        "triggeredBy",
        "produces",
        "realizedBy",
    )


def test_decision_template_is_versioned_and_latest_wins() -> None:
    library = PromptLibrary()
    assert TYPE_TEMPLATE_NAMES["Decision"] == "decision"
    # A new sharper version ships additively (D-P2.7) and the library selects the latest.
    assert library.version_of("decision") == "v2"
    text = library.text("decision")
    assert text.strip()
    # The Decision-vs-Rule boundary must be encoded in the prompt (feature 03 §11).
    assert "Rule" in text
    lowered = text.lower()
    assert "not a rule" in lowered or "is not a rule" in lowered
    # The decision-specific edges are catalogued so the extractor knows what to relate.
    for edge in DECISION_SPECIFIC_RELATIONSHIP_TYPES:
        assert edge in text


def test_entity_prompt_includes_decision_guidance_when_targeted() -> None:
    library = PromptLibrary()
    from dkm_enrichment.chunking import chunk_document

    document = CanonicalDocument(
        id="d",
        sourceType="filesystem",
        sourcePath="p.md",
        sourceVersion="1",
        fetchedAt="2026-01-01T00:00:00.000Z",
        sourceAuthority="scheme",
        content="x",
        title="T",
        sections=[DocumentSection(id="s", title="S", content="some decision content")],
    )
    chunk = chunk_document(document)[0]
    prompt = library.build_entity_prompt(chunk, ["Decision", "Rule"])
    assert "## Decision" in prompt
    assert "## Rule" in prompt
    # A type not requested for this chunk is absent (composed from targetTypes only).
    assert "## ReferenceData" not in prompt


def test_entity_result_schema_offers_decision_type() -> None:
    schema = build_entity_result_schema(decision_targets())
    enum = schema["properties"]["entities"]["items"]["properties"]["type"]["enum"]
    assert DECISION_TYPE in enum


async def test_canned_decision_log_chunk_yields_schema_valid_decision() -> None:
    document = CanonicalDocument(
        id="doc-decision-log",
        sourceType="filesystem",
        sourcePath="decisions.md",
        sourceVersion="1",
        fetchedAt="2026-01-01T00:00:00.000Z",
        sourceAuthority="scheme",
        content="x",
        title="Decision Log",
        sections=[DocumentSection(id="s1", title="Decision Log", content="content")],
    )
    script: dict[str, dict[str, dict[str, Any]]] = {
        "doc-decision-log": {
            "Decision Log": {
                "entities": [
                    {
                        "type": "Decision",
                        "name": "Authorise Payment",
                        "decisionType": "automated",
                        "inputs": ["available balance", "card status"],
                        "outcomes": ["approve", "decline", "refer"],
                        "owner": "Authorisation Team",
                        "confidence": 0.9,
                    },
                ]
            }
        }
    }
    pipeline = ExtractionPipeline(FakeGateway(router=scripted_router(script)))
    result = await pipeline.extract_single(
        document, ExtractionConfig(targetTypes=decision_targets())
    )

    validator = SchemaValidator()
    decisions = [e for e in result.entities if e.type == DECISION_TYPE]
    assert len(decisions) == 1
    outcome = validator.validate_data("Decision", decisions[0].data)
    assert outcome.valid, outcome.error
    # decisionType (not `type`) is the Decision axis field, matching the Event eventType convention.
    assert decisions[0].data["decisionType"] == "automated"
