"""Stage 1 (pre-processing): section-based chunking with size limits (spec 005 Decision 3).

Strategy:

* If the document is **structured** (``contentType == "structured"``, the JSON connector's output),
  chunk from the **parsed** ``structuredContent`` rather than the raw JSON text: a top-level array
  becomes **one chunk per record**; a top-level object becomes a single record chunk. This is the
  fix for issue #30 finding 2 — without it a JSON source is chunked as prose over its raw text.
* Else if the document carries pre-identified ``sections`` (the connector parsed headings), each
  section becomes a chunk. Oversized sections split at **paragraph** boundaries.
* Otherwise (unstructured) fall back to paragraph-based accumulation.
* Consecutive chunks carry a configurable character **overlap** to preserve context at
  boundaries (spec 005 §Pre-processing: "overlap of 200 tokens between chunks").

Sizes are expressed in characters (~4 chars/token) so chunking is deterministic and
dependency-free; the defaults (~12k chars / ~3k tokens, ~800 char / ~200 token overlap) sit in
the spec's 2000–4000 token target band.
"""

from __future__ import annotations

import json
from typing import Any, NamedTuple

from pydantic import BaseModel

from dkm_enrichment.models import CanonicalDocument


class Chunk(BaseModel):
    """A processable unit of a document with provenance back to its section."""

    id: str
    documentId: str
    index: int
    sectionId: str | None
    sectionTitle: str
    location: str  # human-readable provenance, e.g. "Section: Authorisation" / "Record: DEC-001"
    content: str


class _Unit(NamedTuple):
    """A pre-chunk unit of a document: an id/title for provenance + the text to size-split."""

    section_id: str | None
    title: str
    location: str
    content: str


def chunk_document(
    document: CanonicalDocument,
    *,
    max_chars: int = 12_000,
    overlap_chars: int = 800,
) -> list[Chunk]:
    """Split ``document`` into chunks, respecting structure/section boundaries where available."""

    units = _document_units(document)

    chunks: list[Chunk] = []
    for unit in units:
        pieces = _split_to_size(unit.content, max_chars, overlap_chars)
        multi = len(pieces) > 1
        for part_index, piece in enumerate(pieces):
            location = unit.location
            if multi:
                location = f"{location} (part {part_index + 1})"
            chunks.append(
                Chunk(
                    id=f"{document.id}::chunk-{len(chunks)}",
                    documentId=document.id,
                    index=len(chunks),
                    sectionId=unit.section_id,
                    sectionTitle=unit.title,
                    location=location,
                    content=piece,
                )
            )
    # An empty document still yields nothing useful; drop blank chunks.
    return [c for c in chunks if c.content.strip()]


def _document_units(document: CanonicalDocument) -> list[_Unit]:
    """Resolve the document to its pre-chunk units by structure, then sections, then prose."""

    if document.contentType == "structured" and document.structuredContent is not None:
        return _structured_units(document.structuredContent)
    if document.sections:
        return [_Unit(s.id, s.title, f"Section: {s.title}", s.content) for s in document.sections]
    title = document.title or "Document"
    return [_Unit(None, title, f"Section: {title}", document.content)]


def _structured_units(structured: dict[str, Any] | list[Any]) -> list[_Unit]:
    """Map a parsed JSON value to record-level units (issue #30 finding 2).

    A top-level **array** yields one unit per element (id-aware provenance when the element is an
    object with a string ``id``); a top-level **object** is a single coherent record.
    """

    if isinstance(structured, list):
        return [_record_unit(record, index) for index, record in enumerate(structured)]
    return [_Unit(None, "Document", "Section: Document", _serialise(structured))]


def _record_unit(record: Any, index: int) -> _Unit:
    record_id = record.get("id") if isinstance(record, dict) else None
    if isinstance(record_id, str) and record_id:
        return _Unit(record_id, record_id, f"Record: {record_id}", _serialise(record))
    ordinal = f"Record {index + 1}"
    return _Unit(None, ordinal, ordinal, _serialise(record))


def _serialise(value: Any) -> str:
    """Render a JSON value as readable, deterministic text for the extraction prompt."""

    return json.dumps(value, indent=2, ensure_ascii=False)


def _split_to_size(text: str, max_chars: int, overlap_chars: int) -> list[str]:
    """Split ``text`` into <= ``max_chars`` pieces at paragraph boundaries, with overlap."""

    text = text.strip()
    if len(text) <= max_chars:
        return [text] if text else []

    paragraphs = [p for p in text.split("\n\n") if p.strip()]
    pieces: list[str] = []
    current = ""
    for para in paragraphs:
        candidate = f"{current}\n\n{para}" if current else para
        if len(candidate) <= max_chars:
            current = candidate
            continue
        if current:
            pieces.append(current)
            current = _with_overlap(current, para, overlap_chars)
        else:
            # A single paragraph exceeds the limit — hard-split it.
            pieces.extend(_hard_split(para, max_chars, overlap_chars))
            current = ""
    if current.strip():
        pieces.append(current)
    return pieces


def _with_overlap(previous: str, para: str, overlap_chars: int) -> str:
    tail = previous[-overlap_chars:] if overlap_chars > 0 else ""
    return f"{tail}\n\n{para}" if tail else para


def _hard_split(para: str, max_chars: int, overlap_chars: int) -> list[str]:
    step = max(1, max_chars - overlap_chars)
    return [para[start : start + max_chars] for start in range(0, len(para), step)]
