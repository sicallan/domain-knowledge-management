"""LLM gateway contract + isolation (feature 02 acceptance criteria 3 and 8).

Any ``LLMGateway`` implementation honours the structured-output contract; the deterministic
``FakeGateway`` proves the gateway is the only seam — the pipeline runs with **no** network
call — and that model selection/escalation flows through ``LLMOptions`` without touching
pipeline stages.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from dkm_enrichment.emission import read_jsonl
from dkm_enrichment.extraction_schemas import (
    build_entity_result_schema,
    build_relationship_result_schema,
)
from dkm_enrichment.gateway.base import (
    ENTITY_RESULT_TITLE,
    RELATIONSHIP_RESULT_TITLE,
    LLMGateway,
)
from dkm_enrichment.gateway.fake import FakeGateway
from dkm_enrichment.models import (
    CanonicalDocument,
    ExtractionConfig,
    LLMOptions,
)
from dkm_enrichment.pipeline import ExtractionPipeline

from .conftest import scripted_router

# --------------------------------------------------------------------------- contract


def test_fake_gateway_satisfies_the_port() -> None:
    assert isinstance(FakeGateway(), LLMGateway)


async def test_extract_structured_returns_an_llm_response_and_records_the_call() -> None:
    gateway = FakeGateway(responses=[{"entities": [{"type": "DomainConcept"}]}])
    schema = build_entity_result_schema(["DomainConcept"])
    response = await gateway.extract_structured("prompt", schema, LLMOptions(model="m"))
    assert response.result == {"entities": [{"type": "DomainConcept"}]}
    assert response.modelUsed == "m"
    assert gateway.calls[-1].model == "m"
    assert gateway.calls[-1].title == ENTITY_RESULT_TITLE


async def test_router_dispatches_on_schema_title() -> None:
    def router(_prompt: str, schema: dict[str, Any], _opts: LLMOptions) -> dict[str, Any]:
        if schema.get("title") == RELATIONSHIP_RESULT_TITLE:
            return {"relationships": [{"relationshipType": "x"}]}
        return {"entities": [{"type": "Rule"}]}

    gateway = FakeGateway(router=router)
    entity = await gateway.extract_structured("p", build_entity_result_schema(["Rule"]))
    rel = await gateway.extract_structured("p", build_relationship_result_schema())
    assert "entities" in entity.result
    assert "relationships" in rel.result


async def test_embed_is_deterministic_and_offline() -> None:
    gateway = FakeGateway(embed_dim=8)
    a = await gateway.embed("payments")
    b = await gateway.embed("payments")
    assert a == b
    assert len(a) == 8


# --------------------------------------------------------------------------- isolation


async def test_pipeline_runs_with_no_network_and_is_deterministic(
    tmp_path: Path,
    payments_document: CanonicalDocument,
    payments_script: dict[str, dict[str, dict[str, Any]]],
) -> None:
    def fingerprint(lines: list[dict[str, Any]]) -> set[tuple[str, str]]:
        return {(line["type"], line["data"].get("name", "")) for line in lines}

    first = await _entities_for(tmp_path / "a", payments_document, payments_script)
    second = await _entities_for(tmp_path / "b", payments_document, payments_script)
    assert fingerprint(first) == fingerprint(second)
    assert first  # the script produced entities


async def _entities_for(
    out: Path,
    document: CanonicalDocument,
    script: dict[str, dict[str, dict[str, Any]]],
) -> list[dict[str, Any]]:
    gateway = FakeGateway(router=scripted_router(script))
    pipeline = ExtractionPipeline(gateway)
    result = await pipeline.run([document], ExtractionConfig(), out)
    return read_jsonl(Path(result.outputFiles.extractions))


# --------------------------------------------------------------------------- escalation


async def test_default_run_uses_sonnet(
    tmp_path: Path,
    payments_document: CanonicalDocument,
    payments_script: dict[str, dict[str, dict[str, Any]]],
) -> None:
    gateway = FakeGateway(router=scripted_router(payments_script))
    pipeline = ExtractionPipeline(gateway)
    result = await pipeline.run([payments_document], ExtractionConfig(), tmp_path)
    assert result.model == "claude-sonnet-4-6"
    assert gateway.models_used == {"claude-sonnet-4-6"}
    assert result.escalated is False


async def test_escalation_switches_the_model(
    tmp_path: Path,
    payments_document: CanonicalDocument,
    payments_script: dict[str, dict[str, dict[str, Any]]],
) -> None:
    gateway = FakeGateway(router=scripted_router(payments_script))
    pipeline = ExtractionPipeline(gateway)
    result = await pipeline.run(
        [payments_document], ExtractionConfig(escalate=True), tmp_path
    )
    assert result.model == "claude-opus-4-8"
    assert result.escalated is True
    assert gateway.models_used == {"claude-opus-4-8"}
