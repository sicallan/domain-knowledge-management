"""Integration — process docs → both JSONL files → schema-valid (feature 02 §8, criteria 1-3).

Drives the behaviour fixture document through the full ``run`` and validates every emitted line
against the canonical ``/schemas``: entities against their L3 type schema, behavioural edges
against the intermediate relationship shape with endpoint types that satisfy
``schemas/relationships/behavioural.schema.json``.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from dkm_enrichment.emission import read_jsonl
from dkm_enrichment.gateway.fake import FakeGateway
from dkm_enrichment.models import CanonicalDocument, ExtractionConfig
from dkm_enrichment.pipeline import ExtractionPipeline
from dkm_enrichment.schema_validation import SchemaValidator

from .conftest import scripted_router


async def test_behaviour_pass_emits_only_schema_valid_lines(
    tmp_path: Path,
    behaviour_document: CanonicalDocument,
    behaviour_script: dict[str, dict[str, dict[str, Any]]],
    behaviour_config: ExtractionConfig,
) -> None:
    pipeline = ExtractionPipeline(FakeGateway(router=scripted_router(behaviour_script)))
    result = await pipeline.run([behaviour_document], behaviour_config, tmp_path)

    validator = SchemaValidator()
    entities = read_jsonl(Path(result.outputFiles.extractions))
    relationships = read_jsonl(Path(result.outputFiles.relationships))

    assert entities and relationships
    types = {e["type"] for e in entities}
    assert {"OrchestrationFlow", "OrchestrationStep", "Event", "StateTransition"} <= types

    # Every entity line validates against its canonical L3 inventory schema.
    by_id_type: dict[str, str] = {}
    for line in entities:
        outcome = validator.validate_data(line["type"], line["data"])
        assert outcome.valid, f"{line['type']} invalid: {outcome.error}"
        by_id_type[line["id"]] = line["type"]

    # Every relationship references emitted entities and has behaviourally-valid endpoint types.
    emitted_ids = set(by_id_type)
    for line in relationships:
        assert line["type"] == "Relationship"
        data = line["data"]
        assert validator.validate_entry("Relationship", data).valid
        assert data["sourceEntityId"] in emitted_ids
        assert data["targetEntityId"] in emitted_ids
        endpoint = validator.validate_behavioural_relationship(
            data["relationshipType"],
            by_id_type[data["sourceEntityId"]],
            by_id_type[data["targetEntityId"]],
        )
        assert endpoint.valid, (data["relationshipType"], endpoint.error)


async def test_step_sequence_and_flow_membership_survive_to_jsonl(
    tmp_path: Path,
    behaviour_document: CanonicalDocument,
    behaviour_script: dict[str, dict[str, dict[str, Any]]],
    behaviour_config: ExtractionConfig,
) -> None:
    pipeline = ExtractionPipeline(FakeGateway(router=scripted_router(behaviour_script)))
    result = await pipeline.run([behaviour_document], behaviour_config, tmp_path)
    entities = read_jsonl(Path(result.outputFiles.extractions))

    steps = {e["data"]["name"]: e["data"]["sequence"]
             for e in entities if e["type"] == "OrchestrationStep"}
    assert steps == {"Validate Card": 0, "Score Risk": 1, "Publish Result": 2}

    flow = next(e for e in entities if e["type"] == "OrchestrationFlow")
    assert flow["data"]["steps"] == ["Validate Card", "Score Risk", "Publish Result"]
