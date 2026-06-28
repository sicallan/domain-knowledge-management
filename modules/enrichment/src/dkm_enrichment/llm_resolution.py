"""The LLM-adjudicated tier of the entity-resolution cascade (issue #76).

The deterministic tier (:func:`entity_resolution.resolve_entities`) only merges exact
normalised-name matches, which finds nothing on real extractions where duplicates are *semantic*
("Proxy Voting" ≈ "Proxy Voting" across docs, but ≠ "Proxy Voting Policy"). This tier closes that
gap without the false merges of blind string similarity:

1. **Blocking** (deterministic, cheap): within each entity type, link names that share a salient
   token into candidate clusters — so only plausibly-related names are ever compared, and most
   entities never reach the LLM.
2. **Adjudication** (one gateway call per cluster): Claude returns the subsets that are genuinely
   the same concept, each with a canonical name. Distinct-but-similar names stay separate.
3. **Merge**: confirmed groups feed :func:`entity_resolution.merge_groups` (shared merge/remap
   machinery), so relationships are remapped onto survivors downstream.

Everything runs through the :class:`LLMGateway` port, so the deterministic ``FakeGateway`` exercises
it in CI with no key/network.
"""

from __future__ import annotations

from collections import Counter, defaultdict

from dkm_enrichment.entity_resolution import (
    MergeGroup,
    ResolutionResult,
    entity_name,
    merge_groups,
    normalise_name,
)
from dkm_enrichment.gateway.base import LLMGateway
from dkm_enrichment.models import JsonlEntry, LLMOptions
from dkm_enrichment.resolution_schemas import build_resolution_result_schema

# Generic words that shouldn't, on their own, link two names into a candidate cluster.
_STOPWORDS = frozenset(
    {
        "the", "and", "or", "of", "for", "to", "in", "on", "by", "with",
        "at", "as", "our", "its", "a", "an",
    }
)
_MIN_TOKEN_LEN = 3
_DEFAULT_MAX_BLOCK = 40
# Two names are merge candidates only when they share most of their salient tokens. A single
# shared common word ("Fund", "Policy", "Framework") must NOT bridge unrelated concepts into one
# giant cluster — so we link on token-set *similarity*, not single-token connectivity.
_DEFAULT_MIN_SIMILARITY = 0.67


class _UnionFind:
    """Minimal union-find for grouping entities that share a salient token."""

    def __init__(self, size: int) -> None:
        self._parent = list(range(size))

    def find(self, x: int) -> int:
        parent = self._parent
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(self, a: int, b: int) -> None:
        self._parent[self.find(a)] = self.find(b)


def _salient_tokens(name: str) -> set[str]:
    tokens: set[str] = set()
    for token in normalise_name(name).split():
        if len(token) < _MIN_TOKEN_LEN or token in _STOPWORDS:
            continue
        if len(token) > 3 and token.endswith("s"):  # light singularisation: theme(s), policy stays
            token = token[:-1]
        tokens.add(token)
    return tokens


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    union = len(a | b)
    return len(a & b) / union if union else 0.0


def candidate_blocks(
    entities: list[JsonlEntry],
    *,
    max_block_size: int = _DEFAULT_MAX_BLOCK,
    min_similarity: float = _DEFAULT_MIN_SIMILARITY,
) -> list[list[JsonlEntry]]:
    """Group same-type entities into tight candidate clusters by salient-token-set similarity.

    Names are linked only when their salient tokens overlap by Jaccard ≥ ``min_similarity`` — so a
    single shared common word never bridges unrelated concepts. Connected components of 2+ are the
    candidate clusters (singletons skip the LLM). Oversized components are split deterministically
    to bound the prompt. Entities of different types are never linked.
    """

    blocks: list[list[JsonlEntry]] = []
    by_type: dict[str, list[JsonlEntry]] = defaultdict(list)
    for entry in entities:
        by_type[entry.type].append(entry)

    for group in by_type.values():
        token_sets = [_salient_tokens(entity_name(entry)) for entry in group]
        # Only entities sharing ≥1 token can clear the threshold, so build candidate pairs from a
        # token→members index and confirm each with Jaccard (avoids an all-pairs scan).
        token_index: dict[str, list[int]] = defaultdict(list)
        for index, tokens in enumerate(token_sets):
            for token in tokens:
                token_index[token].append(index)

        union_find = _UnionFind(len(group))
        checked: set[tuple[int, int]] = set()
        for members in token_index.values():
            for a_pos in range(len(members)):
                for b_pos in range(a_pos + 1, len(members)):
                    i, j = members[a_pos], members[b_pos]
                    pair = (i, j) if i < j else (j, i)
                    if pair in checked:
                        continue
                    checked.add(pair)
                    if _jaccard(token_sets[i], token_sets[j]) >= min_similarity:
                        union_find.union(i, j)

        components: dict[int, list[JsonlEntry]] = defaultdict(list)
        for index, entry in enumerate(group):
            components[union_find.find(index)].append(entry)

        for component in components.values():
            if len(component) < 2:
                continue
            ordered = sorted(component, key=entity_name)
            chunks = [
                ordered[i : i + max_block_size] for i in range(0, len(ordered), max_block_size)
            ]
            # Never orphan a trailing singleton (it would escape adjudication) — fold it back.
            if len(chunks) >= 2 and len(chunks[-1]) == 1:
                chunks[-2].extend(chunks.pop())
            blocks.extend(chunk for chunk in chunks if len(chunk) >= 2)
    return blocks


def build_adjudication_prompt(type_name: str, names: list[str]) -> str:
    """Ask the model to group only names that denote the SAME concept (precision-first)."""

    listing = "\n".join(f"- {name}" for name in names)
    return (
        f"These are extracted '{type_name}' names from one knowledge domain. Some are duplicates "
        "of the same underlying concept (e.g. the same thing named in different documents), but "
        "many are genuinely distinct.\n\n"
        "Group ONLY the names that refer to the SAME concept. Keep distinct concepts apart — for "
        "example 'Scope 1 Emissions' and 'Scope 2 Emissions' are different; a 'Policy' and its "
        "'Guidelines' are different; a concept and a system that implements it are different. When "
        "unsure, do NOT merge. For each group of two or more synonyms, give the clearest canonical "
        "name and list its members exactly as written. Omit names that have no duplicate.\n\n"
        f"Names:\n{listing}"
    )


def _parse_groups(
    result: dict[str, object], names_to_ids: dict[str, list[str]]
) -> list[MergeGroup]:
    groups: list[MergeGroup] = []
    raw_groups = result.get("groups")
    if not isinstance(raw_groups, list):
        return groups
    for raw in raw_groups:
        if not isinstance(raw, dict):
            continue
        members = raw.get("members")
        if not isinstance(members, list):
            continue
        ids: list[str] = []
        for member in members:
            if isinstance(member, str):
                ids.extend(names_to_ids.get(member, []))
        ids = list(dict.fromkeys(ids))  # de-dupe, order-stable
        if len(ids) < 2:
            continue
        canonical = raw.get("canonical")
        groups.append(
            MergeGroup(ids=ids, canonical_name=canonical if isinstance(canonical, str) else None)
        )
    return groups


async def resolve_with_llm(
    gateway: LLMGateway,
    entities: list[JsonlEntry],
    *,
    options: LLMOptions | None = None,
    max_block_size: int = _DEFAULT_MAX_BLOCK,
    min_similarity: float = _DEFAULT_MIN_SIMILARITY,
) -> ResolutionResult:
    """Block → adjudicate → merge: the LLM resolution tier over a list of entities."""

    schema = build_resolution_result_schema()
    merge: list[MergeGroup] = []

    for block in candidate_blocks(
        entities, max_block_size=max_block_size, min_similarity=min_similarity
    ):
        names_to_ids: dict[str, list[str]] = defaultdict(list)
        for entry in block:
            names_to_ids[entity_name(entry)].append(entry.id)
        prompt = build_adjudication_prompt(block[0].type, sorted(names_to_ids))
        response = await gateway.extract_structured(prompt, schema, options)
        merge.extend(_parse_groups(response.result, names_to_ids))

    return merge_groups(entities, merge)


def block_summary(entities: list[JsonlEntry]) -> Counter[str]:
    """Diagnostic: candidate cluster sizes (used by the CLI to report adjudication scope)."""

    return Counter(str(len(block)) for block in candidate_blocks(entities))
