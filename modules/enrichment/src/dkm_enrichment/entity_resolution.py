"""Stage 4: entity resolution — conservative name+type matching only (Phase 1).

Only the cheapest, most predictable tier of spec 005 Decision 2's cascade ships in Phase 1:
two extracted entities merge **iff** they share a type and a normalised name. Embedding and
LLM tiers are deferred (added later as further cascade stages — OCP). Merging combines
provenance and keeps the highest confidence; merged ids are remapped so relationships that
referenced a duplicate point at the survivor.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from dkm_enrichment.models import JsonlEntry

_WS = re.compile(r"\s+")
_PUNCT = re.compile(r"[^\w\s]")


@dataclass
class ResolutionResult:
    entities: list[JsonlEntry]
    id_remap: dict[str, str] = field(default_factory=dict)
    merged_count: int = 0


def normalise_name(name: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace — the conservative match key."""

    lowered = _PUNCT.sub(" ", name.lower())
    return _WS.sub(" ", lowered).strip()


def resolve_entities(entities: list[JsonlEntry]) -> ResolutionResult:
    """Deduplicate entities by (type, normalised name). Order-stable on first occurrence."""

    survivors: dict[tuple[str, str], JsonlEntry] = {}
    order: list[tuple[str, str]] = []
    id_remap: dict[str, str] = {}
    merged = 0

    for entry in entities:
        key = (entry.type, normalise_name(_entity_name(entry)))
        existing = survivors.get(key)
        if existing is None:
            survivors[key] = entry
            order.append(key)
            continue
        # Merge into the survivor: combine evidence, keep the higher confidence.
        _merge_evidence(existing, entry)
        if entry.confidence > existing.confidence:
            existing.confidence = entry.confidence
        id_remap[entry.id] = existing.id
        merged += 1

    return ResolutionResult(
        entities=[survivors[k] for k in order],
        id_remap=id_remap,
        merged_count=merged,
    )


def remap_relationship(relationship: JsonlEntry, id_remap: dict[str, str]) -> JsonlEntry:
    """Point a relationship's endpoints at surviving entity ids after a merge."""

    data = relationship.data
    for endpoint in ("sourceEntityId", "targetEntityId"):
        current = data.get(endpoint)
        if isinstance(current, str) and current in id_remap:
            data[endpoint] = id_remap[current]
    return relationship


def _entity_name(entry: JsonlEntry) -> str:
    data = entry.data
    for key in ("name", "statement", "expression"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return entry.id


def _merge_evidence(survivor: JsonlEntry, other: JsonlEntry) -> None:
    survivor_ev = survivor.data.setdefault("evidencedBy", [])
    if not isinstance(survivor_ev, list):
        return
    for ev in other.data.get("evidencedBy", []):
        if ev not in survivor_ev:
            survivor_ev.append(ev)
