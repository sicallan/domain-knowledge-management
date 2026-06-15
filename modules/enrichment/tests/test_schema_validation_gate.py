"""Schema-validation gate (feature 02 acceptance criterion 5).

Malformed payloads are excluded, logged, and counted in ``stats.validationFailures``.
Validation runs against the canonical ``/schemas`` — not copies.
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

from .conftest import scripted_router

# --------------------------------------------------------------------------- validator unit


def _valid_domain_concept() -> dict[str, Any]:
    return {
        "id": "11111111-1111-1111-1111-111111111111",
        "type": "DomainConcept",
        "version": "1.0.0",
        "lifecycle_status": "draft",
        "evidencedBy": [
            {"source": "x.md", "fetchedAt": "2026-01-01T00:00:00.000Z"}
        ],
        "validFrom": "2026-01-01T00:00:00.000Z",
        "name": "Authorisation",
        "conceptType": "aggregate",
    }


def test_validator_accepts_a_well_formed_payload() -> None:
    outcome = SchemaValidator().validate_data("DomainConcept", _valid_domain_concept())
    assert outcome.valid, outcome.error


def test_validator_rejects_missing_required_field() -> None:
    bad = _valid_domain_concept()
    del bad["conceptType"]
    outcome = SchemaValidator().validate_data("DomainConcept", bad)
    assert not outcome.valid
    assert outcome.error is not None


def test_validator_rejects_unknown_type() -> None:
    outcome = SchemaValidator().validate_data("NotAThing", {})
    assert not outcome.valid
    assert "Unknown" in (outcome.error or "")


def test_relationship_payload_validation() -> None:
    validator = SchemaValidator()
    good = {
        "relationshipType": "consumes",
        "sourceEntityId": "a",
        "targetEntityId": "b",
    }
    assert validator.validate_entry("Relationship", good).valid
    bad = {"relationshipType": "", "sourceEntityId": "a", "targetEntityId": "b"}
    assert not validator.validate_entry("Relationship", bad).valid


def test_optional_fields_excludes_required_and_discriminator() -> None:
    optional = set(SchemaValidator().optional_fields("DomainConcept"))
    assert "type" not in optional
    assert "name" not in optional  # required
    assert "description" in optional  # optional


# --------------------------------------------------------------------------- pipeline gate


def _doc() -> CanonicalDocument:
    return CanonicalDocument(
        id="doc-validate",
        sourceType="filesystem",
        sourcePath="v.md",
        sourceVersion="1",
        fetchedAt="2026-01-01T00:00:00.000Z",
        sourceAuthority="scheme",
        content="x",
        title="Validate",
        sections=[DocumentSection(id="s1", title="Only", content="content")],
    )


async def test_schema_invalid_entity_is_excluded_and_counted(tmp_path: Path) -> None:
    script: dict[str, dict[str, dict[str, Any]]] = {
        "doc-validate": {
            "Only": {
                "entities": [
                    {
                        "type": "DomainConcept",
                        "name": "Good",
                        "conceptType": "aggregate",
                        "confidence": 0.9,
                    },
                    # Missing the required ``conceptType`` — must fail schema validation.
                    {
                        "type": "DomainConcept",
                        "name": "Malformed",
                        "confidence": 0.9,
                    },
                ],
            }
        }
    }
    gateway = FakeGateway(router=scripted_router(script))
    pipeline = ExtractionPipeline(gateway)
    result = await pipeline.run([_doc()], ExtractionConfig(), tmp_path)

    entities = read_jsonl(Path(result.outputFiles.extractions))
    names = {line["data"]["name"] for line in entities}
    assert names == {"Good"}
    assert result.stats.validationFailures == 1
    assert result.stats.entitiesExtracted == 1
