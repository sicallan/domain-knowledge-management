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


def entity_name(entry: JsonlEntry) -> str:
    """The display name used for matching/merging — falls back across name-like fields, then id."""

    data = entry.data
    for key in ("name", "statement", "expression"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return entry.id


# Backwards-compatible private alias (used by resolve_entities above).
_entity_name = entity_name


def _merge_evidence(survivor: JsonlEntry, other: JsonlEntry) -> None:
    survivor_ev = survivor.data.setdefault("evidencedBy", [])
    if not isinstance(survivor_ev, list):
        return
    for ev in other.data.get("evidencedBy", []):
        if ev not in survivor_ev:
            survivor_ev.append(ev)


@dataclass
class MergeGroup:
    """A confirmed set of entity ids that are the same concept, with the name to keep."""

    ids: list[str]
    canonical_name: str | None = None


def merge_groups(entities: list[JsonlEntry], groups: list[MergeGroup]) -> ResolutionResult:
    """Merge each group of ids into one survivor — the second tier of the resolution cascade.

    Reuses the same merge semantics as :func:`resolve_entities` (union evidence, keep highest
    confidence, remap ids), but the *grouping* is supplied (e.g. by the LLM tier) rather than
    derived from an exact name match. The survivor is the member whose name is the canonical one
    (else the highest-confidence member); the other members' names are kept as ``aliases`` so
    nothing is lost.
    """

    by_id = {entry.id: entry for entry in entities}
    id_remap: dict[str, str] = {}
    removed: set[str] = set()
    merged = 0

    for group in groups:
        members = [by_id[i] for i in group.ids if i in by_id and i not in removed]
        if len(members) < 2:
            continue
        survivor = _pick_survivor(members, group.canonical_name)
        aliases = _existing_aliases(survivor)
        if group.canonical_name:
            survivor.data["name"] = group.canonical_name
        survivor_name = entity_name(survivor)
        for other in members:
            if other is survivor:
                continue
            _merge_evidence(survivor, other)
            if other.confidence > survivor.confidence:
                survivor.confidence = other.confidence
            name = entity_name(other)
            if name and name != survivor_name and name not in aliases:
                aliases.append(name)
            id_remap[other.id] = survivor.id
            removed.add(other.id)
            merged += 1
        if aliases:
            survivor.data["aliases"] = aliases

    surviving = [entry for entry in entities if entry.id not in removed]
    return ResolutionResult(entities=surviving, id_remap=id_remap, merged_count=merged)


def dedupe_relationships(
    relationships: list[JsonlEntry], id_remap: dict[str, str]
) -> list[JsonlEntry]:
    """Remap endpoints, drop self-loops created by a merge, and collapse duplicate edges.

    After merging entities two edges can become identical (same type + endpoints) or point a node
    at itself; keep the first of each distinct ``(type, source, target)`` and union evidence
    into it.
    """

    survivors: dict[tuple[str, str, str], JsonlEntry] = {}
    order: list[tuple[str, str, str]] = []
    for relationship in relationships:
        remap_relationship(relationship, id_remap)
        data = relationship.data
        source = data.get("sourceEntityId")
        target = data.get("targetEntityId")
        rtype = data.get("relationshipType")
        if not isinstance(source, str) or not isinstance(target, str) or not isinstance(rtype, str):
            continue
        if source == target:  # self-loop introduced by the merge — meaningless
            continue
        key = (rtype, source, target)
        existing = survivors.get(key)
        if existing is None:
            survivors[key] = relationship
            order.append(key)
        else:
            _merge_evidence(existing, relationship)
    return [survivors[key] for key in order]


def _pick_survivor(members: list[JsonlEntry], canonical_name: str | None) -> JsonlEntry:
    if canonical_name:
        for member in members:
            if entity_name(member) == canonical_name:
                return member
    return max(members, key=lambda entry: entry.confidence)


def _existing_aliases(entry: JsonlEntry) -> list[str]:
    aliases = entry.data.get("aliases")
    return list(aliases) if isinstance(aliases, list) else []
