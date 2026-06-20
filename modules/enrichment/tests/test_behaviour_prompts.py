"""Unit — behaviour prompt templates (feature 02 §8, task 2).

Each of the four behaviour types has a versioned ``<type>.v1.md`` template, the prompt library
composes them additively for behaviour ``targetTypes``, and the structured-output schema offers
them as extraction targets. The deterministic fake then turns a canned chunk into behaviour
entities that validate against the Feature 01 L3 schemas.
"""

from __future__ import annotations

from typing import Any

from dkm_enrichment.extraction_schemas import build_entity_result_schema
from dkm_enrichment.gateway.fake import FakeGateway
from dkm_enrichment.models import (
    PHASE_0A_L1_TYPES,
    PHASE_2_BEHAVIOUR_TYPES,
    CanonicalDocument,
    DocumentSection,
    ExtractionConfig,
)
from dkm_enrichment.pipeline import ExtractionPipeline
from dkm_enrichment.prompts import PromptLibrary
from dkm_enrichment.prompts.library import TYPE_TEMPLATE_NAMES
from dkm_enrichment.schema_validation import SchemaValidator

from .conftest import behaviour_targets, scripted_router

_BEHAVIOUR_TEMPLATES = {
    "OrchestrationFlow": "orchestration-flow",
    "OrchestrationStep": "orchestration-step",
    "Event": "event",
    "StateTransition": "state-transition",
}


def test_behaviour_types_are_a_distinct_additive_constant() -> None:
    assert PHASE_2_BEHAVIOUR_TYPES == (
        "OrchestrationFlow",
        "OrchestrationStep",
        "Event",
        "StateTransition",
    )
    # Additive: the behaviour constant must not have leaked into the Phase 0a structural set.
    assert not set(PHASE_2_BEHAVIOUR_TYPES) & set(PHASE_0A_L1_TYPES)
    # Decision stays structural (Feature 03 owns it), never a behaviour type.
    assert "Decision" not in PHASE_2_BEHAVIOUR_TYPES


def test_each_behaviour_type_registers_a_versioned_template() -> None:
    library = PromptLibrary()
    for type_name, stem in _BEHAVIOUR_TEMPLATES.items():
        assert TYPE_TEMPLATE_NAMES[type_name] == stem
        assert library.version_of(stem) == "v1"
        assert library.text(stem).strip()


def test_decision_template_is_untouched() -> None:
    # Feature 03 owns Decision; this feature must not register/alter it.
    assert TYPE_TEMPLATE_NAMES["Decision"] == "decision"


def test_entity_prompt_includes_only_requested_behaviour_guidance() -> None:
    library = PromptLibrary()
    chunk_targets = ["OrchestrationFlow", "Event"]
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
        sections=[DocumentSection(id="s", title="S", content="some flow content")],
    )
    chunk = chunk_document(document)[0]
    prompt = library.build_entity_prompt(chunk, chunk_targets)
    assert "## OrchestrationFlow" in prompt
    assert "## Event" in prompt
    # Types not requested for this chunk are absent (composed from targetTypes only).
    assert "## StateTransition" not in prompt


def test_entity_result_schema_offers_behaviour_types() -> None:
    schema = build_entity_result_schema(behaviour_targets())
    enum = schema["properties"]["entities"]["items"]["properties"]["type"]["enum"]
    for type_name in PHASE_2_BEHAVIOUR_TYPES:
        assert type_name in enum


async def test_canned_chunk_yields_schema_valid_behaviour_entities() -> None:
    document = CanonicalDocument(
        id="doc-flow",
        sourceType="filesystem",
        sourcePath="flow.md",
        sourceVersion="1",
        fetchedAt="2026-01-01T00:00:00.000Z",
        sourceAuthority="scheme",
        content="x",
        title="Flow",
        sections=[DocumentSection(id="s1", title="Flow", content="content")],
    )
    script: dict[str, dict[str, dict[str, Any]]] = {
        "doc-flow": {
            "Flow": {
                "entities": [
                    {
                        "type": "OrchestrationFlow",
                        "name": "Capture Flow",
                        "steps": ["Capture", "Notify"],
                        "trigger": "CaptureRequested",
                        "confidence": 0.9,
                    },
                    {
                        "type": "OrchestrationStep",
                        "name": "Capture",
                        "sequence": 0,
                        "actionType": "invoke-service",
                        "confidence": 0.9,
                    },
                    {
                        "type": "Event",
                        "name": "CaptureRequested",
                        "eventType": "integration",
                        "confidence": 0.9,
                    },
                    {
                        "type": "StateTransition",
                        "name": "Captured",
                        "entity": "Payment",
                        "fromState": "authorised",
                        "toState": "captured",
                        "confidence": 0.9,
                    },
                ]
            }
        }
    }
    pipeline = ExtractionPipeline(FakeGateway(router=scripted_router(script)))
    result = await pipeline.extract_single(
        document, ExtractionConfig(targetTypes=behaviour_targets())
    )

    validator = SchemaValidator()
    by_type = {e.type for e in result.entities}
    assert by_type == set(PHASE_2_BEHAVIOUR_TYPES)
    for entity in result.entities:
        outcome = validator.validate_data(entity.type, entity.data)
        assert outcome.valid, f"{entity.type} invalid: {outcome.error}"
