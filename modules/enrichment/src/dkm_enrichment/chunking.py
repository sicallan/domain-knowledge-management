"""Stage 1 (pre-processing): section-based chunking with size limits (spec 005 Decision 3).

Strategy:

* If the document carries pre-identified ``sections`` (the connector parsed headings), each
  section becomes a chunk. Oversized sections split at **paragraph** boundaries.
* Otherwise (unstructured) fall back to paragraph-based accumulation.
* Consecutive chunks carry a configurable character **overlap** to preserve context at
  boundaries (spec 005 §Pre-processing: "overlap of 200 tokens between chunks").

Sizes are expressed in characters (~4 chars/token) so chunking is deterministic and
dependency-free; the defaults (~12k chars / ~3k tokens, ~800 char / ~200 token overlap) sit in
the spec's 2000–4000 token target band.
"""

from __future__ import annotations

from pydantic import BaseModel

from dkm_enrichment.models import CanonicalDocument


class Chunk(BaseModel):
    """A processable unit of a document with provenance back to its section."""

    id: str
    documentId: str
    index: int
    sectionId: str | None
    sectionTitle: str
    location: str  # human-readable provenance, e.g. "Section: Authorisation"
    content: str


def chunk_document(
    document: CanonicalDocument,
    *,
    max_chars: int = 12_000,
    overlap_chars: int = 800,
) -> list[Chunk]:
    """Split ``document`` into chunks, respecting section boundaries where available."""

    units: list[tuple[str | None, str, str]]
    if document.sections:
        units = [(s.id, s.title, s.content) for s in document.sections]
    else:
        units = [(None, document.title or "Document", document.content)]

    chunks: list[Chunk] = []
    for section_id, title, content in units:
        pieces = _split_to_size(content, max_chars, overlap_chars)
        multi = len(pieces) > 1
        for part_index, piece in enumerate(pieces):
            location = f"Section: {title}"
            if multi:
                location = f"{location} (part {part_index + 1})"
            chunks.append(
                Chunk(
                    id=f"{document.id}::chunk-{len(chunks)}",
                    documentId=document.id,
                    index=len(chunks),
                    sectionId=section_id,
                    sectionTitle=title,
                    location=location,
                    content=piece,
                )
            )
    # An empty document still yields nothing useful; drop blank chunks.
    return [c for c in chunks if c.content.strip()]


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
