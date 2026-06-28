"""Graceful LLM-provider error handling — the ``dkm process`` extraction step must turn a
provider failure (out of credits, bad key, rate limit, network) into a clean, actionable
message, never a raw stack trace, and tell the user their parsed documents are intact.

The translator is a pure function (no ``anthropic`` import) so the deterministic suite covers
every status code with the SDK absent — exactly the CI condition.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from dkm_enrichment import cli
from dkm_enrichment.gateway import LLMGatewayError, friendly_api_message
from dkm_enrichment.gateway.fake import FakeGateway
from dkm_enrichment.models import CanonicalDocument, DocumentSection

# --------------------------------------------------------------------------- translator


def test_low_credit_400_explains_billing() -> None:
    message = friendly_api_message(
        400, "Your credit balance is too low to access the Anthropic API."
    )
    assert "credit balance" in message.lower()
    assert "billing" in message.lower()
    assert "400" not in message or "credit" in message.lower()  # framed as billing, not a code dump


def test_401_points_at_the_api_key() -> None:
    assert "ANTHROPIC_API_KEY" in friendly_api_message(401, "invalid x-api-key")


def test_429_says_rate_limited_and_retry() -> None:
    message = friendly_api_message(429, "rate limit exceeded").lower()
    assert "rate" in message and "re-run" in message


def test_5xx_is_framed_as_transient() -> None:
    assert "transient" in friendly_api_message(529, "overloaded").lower()


def test_no_status_means_connection_problem() -> None:
    assert "reach" in friendly_api_message(None, "Connection error").lower()


# --------------------------------------------------------------------------- exception type


def test_gateway_error_is_a_runtime_error() -> None:
    # Subclassing RuntimeError keeps callers that catch RuntimeError working (backward compatible).
    assert issubclass(LLMGatewayError, RuntimeError)


# --------------------------------------------------------------------------- CLI integration


def _canonical_doc(path: Path) -> Path:
    doc = CanonicalDocument(
        id="doc-1",
        sourceType="pdf",
        sourcePath="a.pdf",
        sourceVersion="1",
        fetchedAt="2026-01-01T00:00:00.000Z",
        sourceAuthority="scheme",
        content="x",
        title="Doc",
        sections=[DocumentSection(id="s1", title="Main", content="The Authorisation aggregate.")],
    )
    path.write_text(doc.model_dump_json(), encoding="utf-8")
    return path


def test_cli_reports_api_failure_cleanly_without_a_traceback(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    canonical = _canonical_doc(tmp_path / "canonical-docs.jsonl")

    def explode(_prompt: str, _schema: object, _opts: object) -> dict[str, object]:
        raise LLMGatewayError(
            friendly_api_message(400, "Your credit balance is too low to access the Anthropic API.")
        )

    monkeypatch.setattr(cli, "build_gateway", lambda *, fake: FakeGateway(router=explode))

    rc = cli.main(["extract", str(canonical), "--out", str(tmp_path / "out")])

    captured = capsys.readouterr()
    assert rc == 1
    assert "Traceback" not in captured.err  # clean message, not a stack trace
    assert "credit balance" in captured.err.lower()  # the actionable cause
    assert str(canonical) in captured.err  # tells the user their parsed docs are intact
    assert "intact" in captured.err.lower()
