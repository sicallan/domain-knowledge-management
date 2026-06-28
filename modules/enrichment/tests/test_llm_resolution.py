"""The LLM resolution tier: deterministic blocking + gateway-adjudicated merging (issue #76).

Blocking is pure and tested directly; the adjudication runs through the FakeGateway so CI needs
no key. The key guarantee: only same-concept names merge — distinct-but-similar names (a concept
vs its policy) the model leaves apart stay apart.
"""

from __future__ import annotations

from typing import Any

from dkm_enrichment.gateway.fake import FakeGateway
from dkm_enrichment.llm_resolution import candidate_blocks, resolve_with_llm
from dkm_enrichment.models import JsonlEntry, LLMOptions, SourceProvenance

_SRC = SourceProvenance(
    file="f.pdf", location="Page 1", fetchedAt="2026-01-01T00:00:00.000Z", sourceAuthority="scheme"
)


def _entity(eid: str, name: str, *, etype: str = "DomainConcept", conf: float = 0.5) -> JsonlEntry:
    return JsonlEntry(
        id=eid, type=etype, version="1.0.0", source=_SRC,
        confidence=conf, extractedAt="2026-01-01T00:00:00.000Z", data={"name": name},
    )


def test_blocking_clusters_similar_names_and_excludes_singletons() -> None:
    entities = [
        _entity("a", "Proxy Voting Guidelines"),
        _entity("b", "Proxy Voting Guideline"),  # singular variant → identical token set
        _entity("c", "WBIM Proxy Voting Guidelines"),  # +1 token, Jaccard 0.75 → still linked
        _entity("d", "Proxy Voting"),  # only 2/3 overlap with the family → below threshold
        _entity("e", "Climate Change"),  # shares nothing → singleton
    ]
    blocks = candidate_blocks(entities)
    assert len(blocks) == 1
    assert {e.id for e in blocks[0]} == {"a", "b", "c"}


def test_blocking_never_links_across_types() -> None:
    entities = [
        _entity("a", "Voting", etype="DomainConcept"),
        _entity("b", "Voting", etype="Rule"),
    ]
    # Same name, different types — must not be a merge candidate together.
    assert candidate_blocks(entities) == []


async def test_resolve_merges_only_what_the_model_confirms() -> None:
    entities = [
        _entity("a", "Proxy Voting", conf=0.6),
        _entity("b", "Proxy Voting (PV)", conf=0.9),
        _entity("c", "Proxy Voting Policy", conf=0.7),  # distinct concept — must NOT merge
    ]

    def router(_prompt: str, _schema: dict[str, Any], _opts: LLMOptions) -> dict[str, Any]:
        # The model groups the two synonyms and leaves the Policy out.
        return {
            "groups": [
                {"canonical": "Proxy Voting", "members": ["Proxy Voting", "Proxy Voting (PV)"]}
            ]
        }

    result = await resolve_with_llm(FakeGateway(router=router), entities)

    assert result.merged_count == 1
    assert result.id_remap == {"b": "a"}
    remaining = {e.id for e in result.entities}
    assert remaining == {"a", "c"}  # Policy survives independently
    survivor = next(e for e in result.entities if e.id == "a")
    assert survivor.data["aliases"] == ["Proxy Voting (PV)"]


async def test_resolve_is_a_noop_when_the_model_finds_no_duplicates() -> None:
    entities = [_entity("a", "Voting Rights"), _entity("b", "Voting Procedures")]
    # FakeGateway default router returns an empty result → no groups → nothing merges.
    result = await resolve_with_llm(FakeGateway(), entities)
    assert result.merged_count == 0
    assert {e.id for e in result.entities} == {"a", "b"}


def test_blocking_splits_oversized_components_without_orphaning() -> None:
    entities = [_entity(str(i), f"Voting Item {i}") for i in range(5)]
    blocks = candidate_blocks(entities, max_block_size=2)
    # Bounded to roughly max_block_size (a trailing singleton folds back, so ≤ size+1)…
    assert all(2 <= len(b) <= 3 for b in blocks)
    # …and no entity is dropped from adjudication.
    assert sum(len(b) for b in blocks) == 5
