"""A deterministic, no-network gateway for the CI test suite.

The :class:`FakeGateway` is the seam that lets the whole pipeline run with **zero** network
calls (feature 02 acceptance criterion 3). It can be driven two ways:

* ``router`` — a callable ``(prompt, schema, options) -> dict`` returning the structured
  result. Most flexible; used to script end-to-end and golden-harness tests.
* ``responses`` — a FIFO queue of result dicts popped in order. Used by the gateway contract
  test where the exact call sequence is known.

Either way it records every call (model + prompt) so escalation and isolation can be asserted.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from dkm_enrichment.gateway.base import (
    ENTITY_RESULT_TITLE,
    RELATIONSHIP_RESULT_TITLE,
)
from dkm_enrichment.models import LLMOptions, LLMResponse, LLMUsage

Router = Callable[[str, dict[str, Any], LLMOptions], dict[str, Any]]


@dataclass
class RecordedCall:
    model: str
    title: str
    prompt: str


class FakeGateway:
    """An in-memory ``LLMGateway`` implementation (no provider, no network)."""

    def __init__(
        self,
        *,
        router: Router | None = None,
        responses: list[dict[str, Any]] | None = None,
        embed_dim: int = 8,
    ) -> None:
        if router is None and responses is None:
            router = _empty_router
        self._router = router
        self._responses = list(responses or [])
        self._embed_dim = embed_dim
        self.calls: list[RecordedCall] = []

    async def extract_structured(
        self,
        prompt: str,
        schema: dict[str, Any],
        options: LLMOptions | None = None,
    ) -> LLMResponse:
        opts = options or LLMOptions()
        title = str(schema.get("title", ""))
        self.calls.append(RecordedCall(model=opts.model, title=title, prompt=prompt))
        if self._router is not None:
            result = self._router(prompt, schema, opts)
        else:
            result = self._responses.pop(0) if self._responses else _empty_for(title)
        return LLMResponse(
            result=result,
            usage=LLMUsage(inputTokens=len(prompt) // 4, outputTokens=16),
            latency=0.0,
            modelUsed=opts.model,
        )

    async def embed(self, text: str) -> list[float]:
        # Deterministic pseudo-embedding (no network). Sufficient for any future
        # name+type fallback; the embedding entity-resolution tier is deferred.
        seed = sum(ord(c) for c in text)
        return [((seed * (i + 1)) % 97) / 97.0 for i in range(self._embed_dim)]

    @property
    def models_used(self) -> set[str]:
        return {c.model for c in self.calls}


@dataclass
class ScriptedDocument:
    """A per-document script of entity / relationship payloads, keyed by section title."""

    entities_by_section: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    relationships_by_section: dict[str, list[dict[str, Any]]] = field(default_factory=dict)


def section_router(scripts: dict[str, ScriptedDocument]) -> Router:
    """Build a router that returns scripted payloads based on the chunk's section marker.

    The pipeline embeds ``[[section:<title>]]`` and ``[[doc:<id>]]`` markers in every prompt
    so a fake can deterministically map a chunk back to its script without parsing prose.
    """

    def route(prompt: str, schema: dict[str, Any], _options: LLMOptions) -> dict[str, Any]:
        doc_id = _marker(prompt, "doc")
        section = _marker(prompt, "section")
        script = scripts.get(doc_id, ScriptedDocument())
        title = str(schema.get("title", ""))
        if title == ENTITY_RESULT_TITLE:
            return {"entities": script.entities_by_section.get(section, [])}
        if title == RELATIONSHIP_RESULT_TITLE:
            return {"relationships": script.relationships_by_section.get(section, [])}
        return {}

    return route


def _marker(prompt: str, key: str) -> str:
    token = f"[[{key}:"
    start = prompt.find(token)
    if start == -1:
        return ""
    start += len(token)
    end = prompt.find("]]", start)
    return prompt[start:end] if end != -1 else ""


def _empty_router(_prompt: str, schema: dict[str, Any], _options: LLMOptions) -> dict[str, Any]:
    return _empty_for(str(schema.get("title", "")))


def _empty_for(title: str) -> dict[str, Any]:
    if title == RELATIONSHIP_RESULT_TITLE:
        return {"relationships": []}
    return {"entities": []}
