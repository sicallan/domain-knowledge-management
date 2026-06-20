"""Unit — tiered escalation for decision extraction (feature 03 §8, criterion 6; D-P1.1).

Decisions from nuanced prose are the canonical case for escalating to the most capable model
(spec 005 Decision 4). On a re-run with ``escalate=True`` the decision pass routes every call
through ``claude-opus-4-8`` and the run metadata's ``model`` reflects it. Asserted deterministically
through the ``FakeGateway`` — it records the model on every call, so no network is required.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from dkm_enrichment.gateway.fake import FakeGateway
from dkm_enrichment.models import (
    CanonicalDocument,
    DocumentSection,
    ExtractionConfig,
)
from dkm_enrichment.pipeline import ExtractionPipeline

from .conftest import decision_targets, scripted_router


def _doc() -> CanonicalDocument:
    return CanonicalDocument(
        id="doc-escalation",
        sourceType="filesystem",
        sourcePath="escalation.md",
        sourceVersion="1",
        fetchedAt="2026-01-01T00:00:00.000Z",
        sourceAuthority="scheme",
        content="x",
        title="Escalation",
        sections=[DocumentSection(id="s1", title="Decisions", content="content")],
    )


def _script() -> dict[str, Any]:
    return {
        "doc-escalation": {
            "Decisions": {
                "entities": [
                    {"type": "Decision", "name": "Refer For Manual Review",
                     "decisionType": "hybrid", "outcomes": ["refer", "auto-approve"],
                     "confidence": 0.55},  # nuanced prose → low confidence → escalation candidate
                ],
                "relationships": [],
            }
        }
    }


async def test_default_run_uses_the_base_model(tmp_path: Path) -> None:
    gateway = FakeGateway(router=scripted_router(_script()))
    pipeline = ExtractionPipeline(gateway)
    result = await pipeline.run(
        [_doc()], ExtractionConfig(targetTypes=decision_targets()), tmp_path
    )

    assert result.model == "claude-sonnet-4-6"
    assert result.escalated is False
    assert gateway.models_used == {"claude-sonnet-4-6"}


async def test_escalated_rerun_routes_decisions_to_opus(tmp_path: Path) -> None:
    gateway = FakeGateway(router=scripted_router(_script()))
    pipeline = ExtractionPipeline(gateway)
    config = ExtractionConfig(targetTypes=decision_targets(), escalate=True)
    result = await pipeline.run([_doc()], config, tmp_path)

    # Every call on the escalated re-run went to the most capable model (D-P1.1 / spec 005 Dec 4).
    assert gateway.models_used == {"claude-opus-4-8"}
    assert result.model == "claude-opus-4-8"
    assert result.escalated is True

    # The run metadata reflects the escalation, so provenance records which model produced it.
    metadata = json.loads(Path(result.outputFiles.metadata).read_text(encoding="utf-8"))
    assert metadata["model"] == "claude-opus-4-8"
    assert metadata["escalated"] is True
