"""Shared fixtures for the deterministic (no-network) test suite.

Everything here drives the pipeline through the :class:`FakeGateway` so the tests are
hermetic and reproducible (feature 02 acceptance criterion 3). The :func:`scripted_router`
helper resolves relationship endpoints by *name* from the entity roster the pipeline embeds
in every relationship prompt, so scripts never have to predict the runtime-generated entity
ids.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any

import pytest

from dkm_enrichment.entity_resolution import normalise_name
from dkm_enrichment.gateway.base import ENTITY_RESULT_TITLE, RELATIONSHIP_RESULT_TITLE
from dkm_enrichment.models import (
    PHASE_0A_L1_TYPES,
    PHASE_2_BEHAVIOUR_TYPES,
    PHASE_3_L2_TYPES,
    CanonicalDocument,
    DocumentSection,
    ExtractionConfig,
    LLMOptions,
)

Router = Callable[[str, dict[str, Any], LLMOptions], dict[str, Any]]

_ROSTER_RE = re.compile(r"- id=(?P<id>\S+) type=(?P<type>\S+) name=(?P<name>.+)")


def marker(prompt: str, key: str) -> str:
    """Extract a ``[[key:value]]`` provenance marker the pipeline embeds in every prompt."""

    token = f"[[{key}:"
    start = prompt.find(token)
    if start == -1:
        return ""
    start += len(token)
    end = prompt.find("]]", start)
    return prompt[start:end] if end != -1 else ""


def _roster_name_to_id(prompt: str) -> dict[str, str]:
    name_to_id: dict[str, str] = {}
    for line in prompt.splitlines():
        match = _ROSTER_RE.match(line.strip())
        if match:
            name_to_id[normalise_name(match.group("name"))] = match.group("id")
    return name_to_id


def scripted_router(scripts: dict[str, dict[str, dict[str, Any]]]) -> Router:
    """Build a deterministic router.

    ``scripts`` is keyed ``{doc_id: {section_title: {"entities": [...],
    "relationships": [{"type", "source", "target", "confidence"}]}}}``. Entities are
    returned verbatim; relationships are resolved against the prompt's entity roster by
    normalised name, so the scripts stay id-agnostic.
    """

    def route(prompt: str, schema: dict[str, Any], _options: LLMOptions) -> dict[str, Any]:
        doc_id = marker(prompt, "doc")
        section = marker(prompt, "section")
        sec = scripts.get(doc_id, {}).get(section, {})
        title = str(schema.get("title", ""))
        if title == ENTITY_RESULT_TITLE:
            return {"entities": list(sec.get("entities", []))}
        if title == RELATIONSHIP_RESULT_TITLE:
            name_to_id = _roster_name_to_id(prompt)
            relationships: list[dict[str, Any]] = []
            for rel in sec.get("relationships", []):
                source_id = name_to_id.get(normalise_name(rel["source"]))
                target_id = name_to_id.get(normalise_name(rel["target"]))
                if source_id and target_id:
                    relationships.append(
                        {
                            "relationshipType": rel["type"],
                            "sourceEntityId": source_id,
                            "targetEntityId": target_id,
                            "confidence": rel.get("confidence", 0.9),
                        }
                    )
            return {"relationships": relationships}
        return {}

    return route


@pytest.fixture
def payments_document() -> CanonicalDocument:
    """A small Payments document with two logical sections."""

    return CanonicalDocument(
        id="doc-authorisation",
        sourceType="filesystem",
        sourcePath="payments/authorisation.md",
        sourceVersion="1",
        fetchedAt="2026-01-01T00:00:00.000Z",
        sourceAuthority="scheme",
        content="(sections carry the content)",
        title="Card Authorisation",
        sections=[
            DocumentSection(
                id="s1",
                title="Authorisation",
                content=(
                    "The Authorisation aggregate captures a card payment authorisation. "
                    "An authorisation must not exceed the cardholder's available balance."
                ),
                level=1,
            ),
            DocumentSection(
                id="s2",
                title="Risk Scoring",
                content=(
                    "The risk engine scores each authorisation using the fraud reference "
                    "dataset before approval."
                ),
                level=1,
            ),
        ],
    )


# --------------------------------------------------------------------------- behaviour pass


def behaviour_targets() -> list[str]:
    """The Phase 1 structural targets plus the four Phase 2 behaviour types (additive)."""

    return [*PHASE_0A_L1_TYPES, *PHASE_2_BEHAVIOUR_TYPES]


def decision_targets() -> list[str]:
    """Targets for the Feature 03 decision pass.

    The decision pass extracts ``Decision`` (already in ``PHASE_0A_L1_TYPES``) together with the
    endpoint entities its six edges reach: ``Rule`` / ``ReferenceData`` / ``BusinessInvariant``
    (structural) and ``Event`` / ``StateTransition`` / ``OrchestrationStep`` (behaviour, for
    ``triggeredBy`` / ``produces``). That is the same additive union the behaviour pass uses — so
    a single multi-pass run over the same documents can resolve decision↔behaviour cross-references.
    """

    return [*PHASE_0A_L1_TYPES, *PHASE_2_BEHAVIOUR_TYPES]


def vendor_targets() -> list[str]:
    """Targets for the Feature 02 (3.2) vendor/project pass.

    The three L2 types plus the L1 endpoints its committed edges reach: ``BusinessCapability``
    (``fulfils`` target) and ``DomainConcept`` (``specifies`` target), both already in
    ``PHASE_0A_L1_TYPES``. Additive union — the prior passes' types are untouched (OCP).
    """

    return [*PHASE_0A_L1_TYPES, *PHASE_3_L2_TYPES]


@pytest.fixture
def behaviour_config() -> ExtractionConfig:
    """An ``ExtractionConfig`` whose ``targetTypes`` include the behaviour pass types."""

    return ExtractionConfig(targetTypes=behaviour_targets())


@pytest.fixture
def behaviour_document() -> CanonicalDocument:
    """A self-contained process document describing one orchestration flow.

    A single section keeps every endpoint of the behavioural edges co-located in one chunk,
    so the relationship roster resolves them (the pipeline builds edges per chunk).
    """

    return CanonicalDocument(
        id="doc-auth-flow",
        sourceType="filesystem",
        sourcePath="payments/authorisation-flow.md",
        sourceVersion="1",
        fetchedAt="2026-01-01T00:00:00.000Z",
        sourceAuthority="scheme",
        content="(sections carry the content)",
        title="Authorisation Flow Runbook",
        sections=[
            DocumentSection(
                id="s1",
                title="Authorisation Flow",
                content=(
                    "The Authorisation Flow is triggered by the AuthorisationRequested event. "
                    "Step 1 Validate Card. Step 2 Score Risk. Step 3 Publish Result emits the "
                    "AuthorisationCompleted event and moves the authorisation from pending to "
                    "authorised."
                ),
                level=1,
            ),
        ],
    )


@pytest.fixture
def behaviour_script() -> dict[str, dict[str, dict[str, Any]]]:
    """A deterministic behaviour-extraction script for :func:`behaviour_document`."""

    return {
        "doc-auth-flow": {
            "Authorisation Flow": {
                "entities": [
                    {
                        "type": "OrchestrationFlow",
                        "name": "Authorisation Flow",
                        "trigger": "AuthorisationRequested",
                        "owningService": "Authorisation Service",
                        "steps": ["Validate Card", "Score Risk", "Publish Result"],
                        "confidence": 0.92,
                    },
                    {
                        "type": "OrchestrationStep",
                        "name": "Validate Card",
                        "sequence": 0,
                        "actionType": "validate",
                        "confidence": 0.92,
                    },
                    {
                        "type": "OrchestrationStep",
                        "name": "Score Risk",
                        "sequence": 1,
                        "actionType": "evaluate-decision",
                        "confidence": 0.92,
                    },
                    {
                        "type": "OrchestrationStep",
                        "name": "Publish Result",
                        "sequence": 2,
                        "actionType": "publish-event",
                        "confidence": 0.92,
                    },
                    {
                        "type": "Event",
                        "name": "AuthorisationRequested",
                        "eventType": "integration",
                        "confidence": 0.92,
                    },
                    {
                        "type": "Event",
                        "name": "AuthorisationCompleted",
                        "eventType": "domain",
                        "emitter": "Authorisation Service",
                        "confidence": 0.92,
                    },
                    {
                        "type": "StateTransition",
                        "name": "Authorisation completed",
                        "entity": "Authorisation",
                        "fromState": "pending",
                        "toState": "authorised",
                        "trigger": "AuthorisationCompleted",
                        "confidence": 0.92,
                    },
                ],
                "relationships": [
                    {
                        "type": "triggers",
                        "source": "AuthorisationRequested",
                        "target": "Authorisation Flow",
                        "confidence": 0.9,
                    },
                    {
                        "type": "emits",
                        "source": "Publish Result",
                        "target": "AuthorisationCompleted",
                        "confidence": 0.9,
                    },
                    {
                        "type": "transitionsTo",
                        "source": "Publish Result",
                        "target": "Authorisation completed",
                        "confidence": 0.9,
                    },
                ],
            }
        }
    }


@pytest.fixture
def payments_script() -> dict[str, dict[str, dict[str, Any]]]:
    """A deterministic extraction script for :func:`payments_document`."""

    return {
        "doc-authorisation": {
            "Authorisation": {
                "entities": [
                    {
                        "type": "DomainConcept",
                        "name": "Authorisation",
                        "conceptType": "aggregate",
                        "description": "A card payment authorisation.",
                        "confidence": 0.92,
                    },
                    {
                        "type": "BusinessInvariant",
                        "statement": (
                            "An authorisation must not exceed the available balance."
                        ),
                        "severity": "high",
                        "scope": "context-specific",
                        "confidence": 0.88,
                    },
                ],
                "relationships": [
                    {
                        "type": "constrains",
                        "source": (
                            "An authorisation must not exceed the available balance."
                        ),
                        "target": "Authorisation",
                        "confidence": 0.86,
                    }
                ],
            },
            "Risk Scoring": {
                "entities": [
                    {
                        "type": "ReferenceData",
                        "name": "Fraud Reference Dataset",
                        "owner": "Risk Team",
                        "confidence": 0.9,
                    },
                    {
                        "type": "Decision",
                        "name": "Approve Authorisation",
                        "decisionType": "automated",
                        "outcomes": ["approve", "decline"],
                        "confidence": 0.85,
                    },
                ],
                "relationships": [
                    {
                        "type": "consumes",
                        "source": "Approve Authorisation",
                        "target": "Fraud Reference Dataset",
                        "confidence": 0.82,
                    }
                ],
            },
        }
    }
