"""Unit tests for section-based-with-size-limit chunking (spec 005 Decision 3)."""

from __future__ import annotations

import json
from typing import Any

from dkm_enrichment.chunking import chunk_document
from dkm_enrichment.models import CanonicalDocument, DocumentSection


def _doc(content: str = "", sections: list[DocumentSection] | None = None) -> CanonicalDocument:
    return CanonicalDocument(
        id="doc-1",
        sourceType="filesystem",
        sourcePath="x.md",
        sourceVersion="1",
        fetchedAt="2026-01-01T00:00:00.000Z",
        sourceAuthority="scheme",
        content=content,
        title="Doc",
        sections=sections,
    )


def _structured_doc(structured: Any, *, title: str | None = "Doc") -> CanonicalDocument:
    """A document as the JSON connector emits it: ``contentType='structured'`` + parsed value."""
    return CanonicalDocument(
        id="doc-1",
        sourceType="filesystem",
        sourcePath="x.json",
        sourceVersion="1",
        fetchedAt="2026-01-01T00:00:00.000Z",
        sourceAuthority="scheme",
        content=json.dumps(structured),
        contentType="structured",
        structuredContent=structured,
        title=title,
    )


def test_each_section_becomes_a_chunk() -> None:
    doc = _doc(
        sections=[
            DocumentSection(id="a", title="Alpha", content="alpha body"),
            DocumentSection(id="b", title="Beta", content="beta body"),
        ]
    )
    chunks = chunk_document(doc)
    assert len(chunks) == 2
    assert [c.sectionTitle for c in chunks] == ["Alpha", "Beta"]
    assert chunks[0].location == "Section: Alpha"
    assert [c.index for c in chunks] == [0, 1]
    assert chunks[0].sectionId == "a"


def test_unstructured_document_falls_back_to_whole_content() -> None:
    doc = _doc(content="just a flat blob of text with no sections")
    chunks = chunk_document(doc)
    assert len(chunks) == 1
    assert chunks[0].sectionId is None
    assert chunks[0].sectionTitle == "Doc"
    assert "flat blob" in chunks[0].content


def test_oversized_section_splits_at_paragraph_boundaries_with_overlap() -> None:
    para = "word " * 200  # ~1000 chars
    content = "\n\n".join([para.strip()] * 5)  # ~5 paragraphs
    doc = _doc(sections=[DocumentSection(id="big", title="Big", content=content)])

    chunks = chunk_document(doc, max_chars=1500, overlap_chars=200)

    assert len(chunks) > 1
    assert all(len(c.content) <= 1500 for c in chunks)
    # Multi-part sections get a part marker in their location.
    assert all(c.location.startswith("Section: Big") for c in chunks)
    assert any("(part 2)" in c.location for c in chunks)
    # Overlap: the tail of one chunk reappears at the head of the next.
    tail = chunks[0].content[-50:]
    assert tail in chunks[1].content


def test_single_oversized_paragraph_is_hard_split() -> None:
    giant = "x" * 5000  # one paragraph, no boundaries
    doc = _doc(sections=[DocumentSection(id="g", title="Giant", content=giant)])
    chunks = chunk_document(doc, max_chars=1000, overlap_chars=100)
    assert len(chunks) > 1
    assert all(len(c.content) <= 1000 for c in chunks)


def test_blank_sections_are_dropped() -> None:
    doc = _doc(
        sections=[
            DocumentSection(id="a", title="Empty", content="   "),
            DocumentSection(id="b", title="Real", content="content here"),
        ]
    )
    chunks = chunk_document(doc)
    assert len(chunks) == 1
    assert chunks[0].sectionTitle == "Real"


# --- structured (JSON) sources — issue #30 ------------------------------------------------


def test_canonical_document_accepts_top_level_array() -> None:
    # Bug 1: a top-level JSON array source (decision-log.json) must be representable.
    doc = _structured_doc([{"id": "DEC-001"}, {"id": "DEC-002"}])
    assert isinstance(doc.structuredContent, list)
    assert len(doc.structuredContent) == 2


def test_top_level_array_chunks_one_record_per_chunk() -> None:
    # Bug 2: a structured array is chunked per record, not as one prose blob over raw JSON.
    records = [
        {"id": "DEC-001", "title": "Authorise synchronously"},
        {"id": "DEC-002", "title": "Tokenise credentials"},
        {"id": "DEC-003", "title": "Settle in batches"},
    ]
    chunks = chunk_document(_structured_doc(records))

    assert len(chunks) == 3
    assert [c.index for c in chunks] == [0, 1, 2]
    # Each chunk carries exactly one record (its own id, not its neighbours').
    assert "DEC-001" in chunks[0].content
    assert "DEC-002" not in chunks[0].content
    # Provenance points at the specific record (id-aware when present).
    assert chunks[0].location == "Record: DEC-001"
    assert chunks[0].sectionId == "DEC-001"


def test_array_records_without_id_use_ordinal_provenance() -> None:
    chunks = chunk_document(_structured_doc([{"name": "alpha"}, {"name": "beta"}]))
    assert [c.location for c in chunks] == ["Record 1", "Record 2"]
    assert all(c.sectionId is None for c in chunks)


def test_top_level_object_is_a_single_record_chunk() -> None:
    # payment-inventory.json shape: a single coherent record → one chunk over the whole object,
    # NOT fragmented per top-level key (the aggregate needs its full context).
    obj = {
        "boundedContext": "Authorisation",
        "aggregates": ["PaymentAuthorisation", "RiskAssessment"],
        "owner": "payments-platform",
    }
    chunks = chunk_document(_structured_doc(obj))
    assert len(chunks) == 1
    assert "boundedContext" in chunks[0].content
    assert "Authorisation" in chunks[0].content
    assert "RiskAssessment" in chunks[0].content


def test_structured_content_is_preferred_over_the_raw_content_string() -> None:
    # The doc's `content` is the raw JSON text; chunking must use the parsed structure so each
    # record is isolated (otherwise all three ids land in one prose chunk).
    records = [{"id": "DEC-001"}, {"id": "DEC-002"}]
    doc = _structured_doc(records)
    assert doc.content == json.dumps(records)  # raw blob carries both ids
    chunks = chunk_document(doc)
    assert len(chunks) == 2  # …but chunking isolates them


def test_oversized_structured_record_respects_the_size_limit() -> None:
    big_record = {"id": "BIG", "body": "x" * 5000}
    chunks = chunk_document(_structured_doc([big_record]), max_chars=1000, overlap_chars=100)
    assert len(chunks) > 1
    assert all(len(c.content) <= 1000 for c in chunks)
    assert any("(part 2)" in c.location for c in chunks)
