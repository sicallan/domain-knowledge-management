"""The LLM-tier merge machinery: merge_groups + dedupe_relationships (issue #76).

These are pure (no gateway): given confirmed synonym groups, entities collapse to one survivor
and relationships are remapped/deduped onto survivors.
"""

from __future__ import annotations

from dkm_enrichment.entity_resolution import (
    MergeGroup,
    dedupe_relationships,
    merge_groups,
)
from dkm_enrichment.models import JsonlEntry, SourceProvenance

_SRC = SourceProvenance(
    file="f.pdf", location="Page 1", fetchedAt="2026-01-01T00:00:00.000Z", sourceAuthority="scheme"
)


def _entity(
    eid: str, name: str, *, conf: float = 0.5, evidence: list[str] | None = None
) -> JsonlEntry:
    data: dict[str, object] = {"name": name}
    if evidence is not None:
        data["evidencedBy"] = evidence
    return JsonlEntry(
        id=eid, type="DomainConcept", version="1.0.0", source=_SRC,
        confidence=conf, extractedAt="2026-01-01T00:00:00.000Z", data=data,
    )


def _rel(rid: str, rtype: str, src: str, tgt: str) -> JsonlEntry:
    return JsonlEntry(
        id=rid, type="Relationship", version="1.0.0", source=_SRC,
        confidence=0.8, extractedAt="2026-01-01T00:00:00.000Z",
        data={"relationshipType": rtype, "sourceEntityId": src, "targetEntityId": tgt},
    )


def test_merge_groups_collapses_to_one_survivor_keeping_aliases_and_evidence() -> None:
    entities = [
        _entity("a", "Proxy Voting", conf=0.6, evidence=["doc-1"]),
        _entity("b", "Proxy Voting (PV)", conf=0.9, evidence=["doc-2"]),
    ]
    result = merge_groups(entities, [MergeGroup(ids=["a", "b"], canonical_name="Proxy Voting")])

    assert result.merged_count == 1
    assert [e.id for e in result.entities] == ["a"]  # canonical-named member survives
    survivor = result.entities[0]
    assert survivor.data["name"] == "Proxy Voting"
    assert survivor.data["aliases"] == ["Proxy Voting (PV)"]
    assert sorted(survivor.data["evidencedBy"]) == ["doc-1", "doc-2"]  # evidence unioned
    assert survivor.confidence == 0.9  # highest confidence kept
    assert result.id_remap == {"b": "a"}


def test_merge_groups_ignores_singletons() -> None:
    entities = [_entity("a", "Voting"), _entity("b", "Climate")]
    result = merge_groups(entities, [MergeGroup(ids=["a"], canonical_name="Voting")])
    assert result.merged_count == 0
    assert [e.id for e in result.entities] == ["a", "b"]


def test_dedupe_relationships_remaps_drops_self_loops_and_collapses_duplicates() -> None:
    id_remap = {"b": "a"}  # b merged into a
    relationships = [
        _rel("r1", "governs", "a", "c"),
        _rel("r2", "governs", "b", "c"),  # → (governs, a, c): duplicate of r1
        _rel("r3", "relatesTo", "b", "a"),  # → a→a self-loop, dropped
        _rel("r4", "governs", "c", "b"),  # → (governs, c, a): distinct, kept
    ]
    out = dedupe_relationships(relationships, id_remap)

    keys = {
        (r.data["relationshipType"], r.data["sourceEntityId"], r.data["targetEntityId"])
        for r in out
    }
    assert keys == {("governs", "a", "c"), ("governs", "c", "a")}
    assert len(out) == 2  # r2 collapsed into r1, r3 self-loop dropped
