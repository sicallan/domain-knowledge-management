"""JSONL emission: fixed-core presence, streaming, entity/relationship routing, immutability.

Covers feature 02 acceptance criteria 1, 2 and 9 plus spec 003 §File Lifecycle.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from dkm_enrichment.emission import JsonlWriter, read_jsonl
from dkm_enrichment.gateway.fake import FakeGateway
from dkm_enrichment.models import (
    CanonicalDocument,
    ExtractionConfig,
    JsonlEntry,
    SourceProvenance,
)
from dkm_enrichment.pipeline import ExtractionPipeline

from .conftest import scripted_router

FIXED_CORE = {"id", "type", "version", "source", "confidence", "extractedAt", "data"}


def _entry(entry_id: str = "e1") -> JsonlEntry:
    return JsonlEntry(
        id=entry_id,
        type="DomainConcept",
        version="1.0.0",
        source=SourceProvenance(
            file="x.md",
            location="Section: A",
            fetchedAt="2026-01-01T00:00:00.000Z",
            sourceAuthority="scheme",
        ),
        confidence=0.9,
        extractedAt="2026-01-01T00:00:00.000Z",
        data={"name": "X"},
    )


# --------------------------------------------------------------------------- writer unit


def test_writer_streams_line_by_line(tmp_path: Path) -> None:
    path = tmp_path / "out.jsonl"
    writer = JsonlWriter(path)
    writer.write(_entry("a"))
    # Flushed immediately — the line is visible before the writer closes (streaming).
    assert len(read_jsonl(path)) == 1
    writer.write(_entry("b"))
    assert writer.count == 2
    writer.close()
    assert len(read_jsonl(path)) == 2


def test_writer_is_immutable_after_close(tmp_path: Path) -> None:
    path = tmp_path / "out.jsonl"
    with JsonlWriter(path) as writer:
        writer.write(_entry("a"))
    with pytest.raises(RuntimeError, match="immutable"):
        writer.write(_entry("b"))


async def test_completed_file_is_not_rewritten_by_a_run(
    tmp_path: Path,
    payments_document: CanonicalDocument,
    payments_script: dict[str, dict[str, dict[str, Any]]],
) -> None:
    """Each run writes uniquely-named files; a completed file is never mutated in place."""

    gateway = FakeGateway(router=scripted_router(payments_script))
    pipeline = ExtractionPipeline(gateway)

    result = await pipeline.run([payments_document], ExtractionConfig(), tmp_path)
    extractions = Path(result.outputFiles.extractions)
    before = extractions.read_bytes()
    # The file name is namespaced by runId, so a second run cannot overwrite it.
    result2 = await pipeline.run([payments_document], ExtractionConfig(), tmp_path)
    assert result2.outputFiles.extractions != result.outputFiles.extractions
    assert extractions.read_bytes() == before


# --------------------------------------------------------------------------- pipeline routing


async def _run(
    tmp_path: Path,
    document: CanonicalDocument,
    script: dict[str, dict[str, dict[str, Any]]],
    config: ExtractionConfig | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    gateway = FakeGateway(router=scripted_router(script))
    pipeline = ExtractionPipeline(gateway)
    result = await pipeline.run([document], config or ExtractionConfig(), tmp_path)
    entities = read_jsonl(Path(result.outputFiles.extractions))
    relationships = read_jsonl(Path(result.outputFiles.relationships))
    metadata = json.loads(Path(result.outputFiles.metadata).read_text())
    return entities, relationships, metadata


async def test_every_entity_line_has_the_fixed_core(
    tmp_path: Path,
    payments_document: CanonicalDocument,
    payments_script: dict[str, dict[str, dict[str, Any]]],
) -> None:
    entities, _relationships, _meta = await _run(tmp_path, payments_document, payments_script)
    assert entities
    for line in entities:
        assert set(line) >= FIXED_CORE
        assert line["type"] != "Relationship"
        assert 0.0 <= line["confidence"] <= 1.0
        assert {"file", "location", "fetchedAt", "sourceAuthority"} <= set(line["source"])


async def test_entities_and_relationships_are_routed_to_separate_files(
    tmp_path: Path,
    payments_document: CanonicalDocument,
    payments_script: dict[str, dict[str, dict[str, Any]]],
) -> None:
    entities, relationships, _meta = await _run(tmp_path, payments_document, payments_script)
    assert all(line["type"] != "Relationship" for line in entities)
    assert relationships
    assert all(line["type"] == "Relationship" for line in relationships)


async def test_relationship_endpoints_reference_emitted_entity_ids(
    tmp_path: Path,
    payments_document: CanonicalDocument,
    payments_script: dict[str, dict[str, dict[str, Any]]],
) -> None:
    entities, relationships, _meta = await _run(tmp_path, payments_document, payments_script)
    emitted_ids = {line["id"] for line in entities}
    assert relationships
    for rel in relationships:
        assert rel["data"]["sourceEntityId"] in emitted_ids
        assert rel["data"]["targetEntityId"] in emitted_ids


async def test_provenance_records_the_section(
    tmp_path: Path,
    payments_document: CanonicalDocument,
    payments_script: dict[str, dict[str, dict[str, Any]]],
) -> None:
    entities, _relationships, _meta = await _run(tmp_path, payments_document, payments_script)
    locations = {line["source"]["location"] for line in entities}
    assert "Section: Authorisation" in locations
    assert all(line["source"]["file"] == "payments/authorisation.md" for line in entities)
    assert all(line["source"]["sourceAuthority"] == "scheme" for line in entities)
