"""End-to-end integration: CanonicalDocument fixtures → both JSONL files → schema-valid.

Every emitted line is validated against the canonical ``/schemas`` (feature 02 §8 integration
test; acceptance criteria 1, 2, 7). Entity resolution dedups entities seen across documents.
"""

from __future__ import annotations

import json
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


async def test_end_to_end_emits_only_schema_valid_lines(
    tmp_path: Path,
    payments_document: CanonicalDocument,
    payments_script: dict[str, dict[str, dict[str, Any]]],
) -> None:
    gateway = FakeGateway(router=scripted_router(payments_script))
    pipeline = ExtractionPipeline(gateway)
    result = await pipeline.run([payments_document], ExtractionConfig(), tmp_path)

    validator = SchemaValidator()
    entities = read_jsonl(Path(result.outputFiles.extractions))
    relationships = read_jsonl(Path(result.outputFiles.relationships))

    assert entities and relationships
    # Every entity line validates against its canonical inventory type schema.
    for line in entities:
        outcome = validator.validate_data(line["type"], line["data"])
        assert outcome.valid, f"{line['type']} invalid: {outcome.error}"

    # Every relationship line is a Relationship referencing emitted entity ids.
    emitted_ids = {line["id"] for line in entities}
    for line in relationships:
        assert line["type"] == "Relationship"
        outcome = validator.validate_entry("Relationship", line["data"])
        assert outcome.valid, outcome.error
        assert line["data"]["sourceEntityId"] in emitted_ids
        assert line["data"]["targetEntityId"] in emitted_ids


async def test_metadata_records_run_provenance(
    tmp_path: Path,
    payments_document: CanonicalDocument,
    payments_script: dict[str, dict[str, dict[str, Any]]],
) -> None:
    gateway = FakeGateway(router=scripted_router(payments_script))
    pipeline = ExtractionPipeline(gateway)
    result = await pipeline.run([payments_document], ExtractionConfig(), tmp_path)

    metadata = json.loads(Path(result.outputFiles.metadata).read_text())
    assert metadata["runId"] == result.runId
    assert metadata["model"] == "claude-sonnet-4-6"
    assert metadata["stats"]["documentsProcessed"] == 1
    assert metadata["promptVersions"]  # versioned prompt templates were recorded
    assert metadata["usage"]["inputTokens"] >= 0


async def test_entity_resolution_dedups_across_documents(tmp_path: Path) -> None:
    """The same concept extracted from two documents merges into one entity."""

    def _doc(doc_id: str, path: str) -> CanonicalDocument:
        return CanonicalDocument(
            id=doc_id,
            sourceType="filesystem",
            sourcePath=path,
            sourceVersion="1",
            fetchedAt="2026-01-01T00:00:00.000Z",
            sourceAuthority="scheme",
            content="x",
            title=doc_id,
            sections=[DocumentSection(id="s1", title="Main", content="content")],
        )

    entity = {
        "type": "DomainConcept",
        "name": "Authorisation",
        "conceptType": "aggregate",
        "confidence": 0.9,
    }
    script: dict[str, dict[str, dict[str, Any]]] = {
        "doc-a": {"Main": {"entities": [entity]}},
        "doc-b": {"Main": {"entities": [entity]}},
    }
    gateway = FakeGateway(router=scripted_router(script))
    pipeline = ExtractionPipeline(gateway)
    result = await pipeline.run(
        [_doc("doc-a", "a.md"), _doc("doc-b", "b.md")], ExtractionConfig(), tmp_path
    )

    entities = read_jsonl(Path(result.outputFiles.extractions))
    authorisations = [e for e in entities if e["data"]["name"] == "Authorisation"]
    assert len(authorisations) == 1
    # The surviving entity carries evidence from both source documents.
    assert len(authorisations[0]["data"]["evidencedBy"]) == 2
    assert result.stats.entitiesResolved == 1


async def test_structured_array_source_extracts_per_record(tmp_path: Path) -> None:
    """Issue #30 end-to-end: a top-level JSON array (decision-log shape) flows through the
    pipeline as one chunk per record, so extraction + provenance are per-record."""

    records = [
        {"id": "DEC-001", "title": "Authorise synchronously"},
        {"id": "DEC-002", "title": "Tokenise credentials"},
    ]
    document = CanonicalDocument(
        id="doc-decisions",
        sourceType="filesystem",
        sourcePath="decision-log.json",
        sourceVersion="1",
        fetchedAt="2026-01-01T00:00:00.000Z",
        sourceAuthority="scheme",
        content=json.dumps(records),
        contentType="structured",
        structuredContent=records,
        title="Decision Log",
    )
    # Scripts are keyed by the chunk's section title — for an array record that is its id.
    script: dict[str, dict[str, dict[str, Any]]] = {
        "doc-decisions": {
            "DEC-001": {
                "entities": [
                    {
                        "type": "DomainConcept",
                        "name": "Synchronous Authorisation",
                        "conceptType": "policy",
                        "confidence": 0.9,
                    }
                ]
            },
            "DEC-002": {
                "entities": [
                    {
                        "type": "DomainConcept",
                        "name": "Credential Tokenisation",
                        "conceptType": "policy",
                        "confidence": 0.9,
                    }
                ]
            },
        }
    }
    gateway = FakeGateway(router=scripted_router(script))
    pipeline = ExtractionPipeline(gateway)
    result = await pipeline.run([document], ExtractionConfig(), tmp_path)

    entities = read_jsonl(Path(result.outputFiles.extractions))
    # One entity per record, each evidenced at its own record's location (per-record provenance).
    by_location = {e["data"]["name"]: e["data"]["evidencedBy"][0]["location"] for e in entities}
    assert by_location == {
        "Synchronous Authorisation": "Record: DEC-001",
        "Credential Tokenisation": "Record: DEC-002",
    }
