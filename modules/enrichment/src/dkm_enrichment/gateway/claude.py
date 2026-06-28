"""The thin real-Claude gateway — the ONLY Claude-aware code in the system (D-P1.1).

The Anthropic SDK is imported **lazily** inside the constructor so that:

* the deterministic CI suite (which never installs the ``llm`` extra) can import this module;
* ``mypy`` typechecks without the SDK present (see the pyproject override).

It implements the same :class:`LLMGateway` port as :class:`FakeGateway`; nothing else in the
pipeline knows a provider exists. Default model ``claude-sonnet-4-6`` (spec 005 / D-P1.1).
"""

from __future__ import annotations

import json
import os
import time
from typing import Any

from dkm_enrichment.gateway.errors import LLMGatewayError, friendly_api_message
from dkm_enrichment.models import LLMOptions, LLMResponse, LLMUsage

_TOOL_NAME = "emit_structured"


class ClaudeGateway:
    """Provider adapter for Anthropic Claude using tool-use for structured output."""

    def __init__(
        self, api_key: str | None = None, default_model: str = "claude-sonnet-4-6"
    ) -> None:
        try:
            import anthropic
        except ImportError as exc:  # pragma: no cover - exercised only with the llm extra
            raise LLMGatewayError(
                "The Anthropic SDK is not installed. Install the optional extra: "
                'pip install -e ".[dev,llm]"'
            ) from exc
        key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not key:
            raise LLMGatewayError("ANTHROPIC_API_KEY is not set; cannot construct ClaudeGateway.")
        self._client = anthropic.Anthropic(api_key=key)
        self._default_model = default_model
        # The base of both APIStatusError (has .status_code) and APIConnectionError (none).
        self._api_error_type = anthropic.APIError

    async def extract_structured(
        self,
        prompt: str,
        schema: dict[str, Any],
        options: LLMOptions | None = None,
    ) -> LLMResponse:
        opts = options or LLMOptions(model=self._default_model)
        started = time.monotonic()
        try:
            message = self._client.messages.create(
                model=opts.model,
                max_tokens=opts.maxTokens,
                temperature=opts.temperature,
                tools=[
                    {
                        "name": _TOOL_NAME,
                        "description": "Emit the extracted structured data for the schema.",
                        "input_schema": schema,
                    }
                ],
                tool_choice={"type": "tool", "name": _TOOL_NAME},
                messages=[{"role": "user", "content": prompt}],
            )
        except self._api_error_type as exc:
            # Translate any provider HTTP/connection failure into a clean, actionable message
            # (out of credits, bad key, rate limit, network) — the CLI prints it without a trace.
            status = getattr(exc, "status_code", None)
            detail = str(getattr(exc, "message", None) or exc)
            raise LLMGatewayError(friendly_api_message(status, detail)) from exc
        latency = time.monotonic() - started
        result = _first_tool_input(message)
        usage = getattr(message, "usage", None)
        return LLMResponse(
            result=result,
            usage=LLMUsage(
                inputTokens=getattr(usage, "input_tokens", 0) or 0,
                outputTokens=getattr(usage, "output_tokens", 0) or 0,
            ),
            latency=latency,
            modelUsed=opts.model,
        )

    async def embed(self, text: str) -> list[float]:  # pragma: no cover - deferred in Phase 1
        raise NotImplementedError(
            "Embeddings are deferred to the embedding entity-resolution tier (Phase 1 OOS)."
        )


def _first_tool_input(message: Any) -> dict[str, Any]:
    for block in getattr(message, "content", []):
        if getattr(block, "type", None) == "tool_use":
            data = getattr(block, "input", {})
            if isinstance(data, dict):
                return data
            if isinstance(data, str):
                parsed = json.loads(data)
                return parsed if isinstance(parsed, dict) else {}
    return {}
