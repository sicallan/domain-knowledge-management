"""LLM gateway port and implementations (D-P1.1)."""

from dkm_enrichment.gateway.base import (
    ENTITY_RESULT_TITLE,
    RELATIONSHIP_RESULT_TITLE,
    LLMGateway,
)
from dkm_enrichment.gateway.errors import LLMGatewayError, friendly_api_message
from dkm_enrichment.gateway.fake import (
    FakeGateway,
    ScriptedDocument,
    section_router,
)

__all__ = [
    "ENTITY_RESULT_TITLE",
    "RELATIONSHIP_RESULT_TITLE",
    "LLMGateway",
    "LLMGatewayError",
    "friendly_api_message",
    "FakeGateway",
    "ScriptedDocument",
    "section_router",
]
