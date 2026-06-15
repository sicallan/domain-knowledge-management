"""The provider-agnostic LLM gateway port (D-P1.1).

Every model call in the system goes through this port. It is the **only** seam that knows
about a provider/model — swapping or escalating models touches no pipeline code. The port is
a **closed** contract.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from dkm_enrichment.models import LLMOptions, LLMResponse

# Marker titles the pipeline puts on the wrapper schema so a gateway (or fake) can tell which
# extraction stage is calling. Kept here so every implementation agrees on the contract.
ENTITY_RESULT_TITLE = "EntityExtractionResult"
RELATIONSHIP_RESULT_TITLE = "RelationshipExtractionResult"


@runtime_checkable
class LLMGateway(Protocol):
    """Thin structured-extraction port. Implementations: :class:`FakeGateway`, ClaudeGateway."""

    async def extract_structured(
        self,
        prompt: str,
        schema: dict[str, Any],
        options: LLMOptions | None = None,
    ) -> LLMResponse:
        """Return a structured object conforming to ``schema`` (function-calling style)."""
        ...

    async def embed(self, text: str) -> list[float]:
        """Embed ``text``. May raise :class:`NotImplementedError` in Phase 1."""
        ...
