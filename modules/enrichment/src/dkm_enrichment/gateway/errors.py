"""Provider-agnostic gateway failures + a pure translator for HTTP API errors.

A gateway adapter (e.g. :class:`ClaudeGateway`) raises :class:`LLMGatewayError` when the
provider rejects or cannot serve a request; the CLI catches it and prints ``message`` cleanly
— so a user out of credits sees an actionable one-liner, not a stack trace.

The translator lives here with **no** ``anthropic`` import so the deterministic suite can cover
every status code with the SDK absent (the CI condition). ``LLMGatewayError`` subclasses
``RuntimeError`` to stay backward compatible with callers that already catch ``RuntimeError``.
"""

from __future__ import annotations


class LLMGatewayError(RuntimeError):
    """A user-facing LLM-provider failure carrying an actionable, traceback-free message."""


def friendly_api_message(status_code: int | None, detail: str) -> str:
    """Translate a provider HTTP status + its own message into an actionable one-liner.

    ``detail`` is the provider's message (already specific, e.g. "Your credit balance is too
    low…"); ``status_code`` is ``None`` for a connection/network failure with no HTTP response.
    """
    detail = " ".join(detail.split())  # collapse the provider's (often multi-line) message

    if status_code == 400 and "credit balance" in detail.lower():
        return (
            "Claude API rejected the request — your Anthropic credit balance is too low. "
            "Top up at https://console.anthropic.com (Plans & Billing), then re-run."
        )
    if status_code == 401:
        return (
            "Claude API authentication failed (HTTP 401) — ANTHROPIC_API_KEY is missing or "
            f"invalid. Check the key and re-run. Provider said: {detail}"
        )
    if status_code == 403:
        return (
            "Claude API access denied (HTTP 403) — your key lacks permission for this model or "
            f"endpoint. Provider said: {detail}"
        )
    if status_code == 429:
        return (
            "Claude API rate-limited the request (HTTP 429) — wait a moment and re-run, or "
            f"lower concurrency. Provider said: {detail}"
        )
    if status_code is not None and status_code >= 500:
        return (
            f"Claude API server error (HTTP {status_code}) — transient on Anthropic's side; "
            f"re-run shortly. Provider said: {detail}"
        )
    if status_code is None:
        return (
            "Could not reach the Claude API — check your network/proxy and re-run. "
            f"Details: {detail}"
        )
    return f"Claude API request failed (HTTP {status_code}): {detail}"
