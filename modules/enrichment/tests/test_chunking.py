"""Unit tests for section-based-with-size-limit chunking (spec 005 Decision 3)."""

from __future__ import annotations

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
