"""Unit — tiered escalation for vendor/coverage extraction (feature 02 §8, criterion 7; D-P1.1).

A wrong coverage claim is the canonical expensive failure (D-P3.1), so a low-confidence
``VendorCapabilityMapping`` is the canonical escalation case: on a re-run with ``escalate=True`` the
vendor pass routes every call through ``claude-opus-4-8`` and the run metadata's ``model`` records
it. Asserted deterministically through the ``FakeGateway`` (it records the model on every call) — no
network required.
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

from .conftest import scripted_router, vendor_targets


def _doc() -> CanonicalDocument:
    return CanonicalDocument(
        id="doc-vendor-escalation",
        sourceType="filesystem",
        sourcePath="vendor-escalation.md",
        sourceVersion="1",
        fetchedAt="2026-01-01T00:00:00.000Z",
        sourceAuthority="vendor",
        content="x",
        title="Escalation",
        sections=[DocumentSection(id="s1", title="Vendor", content="content")],
    )


def _script() -> dict[str, Any]:
    return {
        "doc-vendor-escalation": {
            "Vendor": {
                "entities": [
                    {"type": "BusinessCapability", "name": "Accept Card Payments",
                     "confidence": 0.9},
                    # Inferred (not explicitly stated) coverage → low confidence → escalation case.
                    {"type": "VendorCapabilityMapping",
                     "vendorCapability": "Acme Card Authorisation",
                     "mappedConcept": {"targetType": "BusinessCapability",
                                       "targetId": "Accept Card Payments"},
                     "coverage": "partial", "confidence": 0.55},
                ],
                "relationships": [],
            }
        }
    }


async def test_default_run_uses_the_base_model(tmp_path: Path) -> None:
    gateway = FakeGateway(router=scripted_router(_script()))
    pipeline = ExtractionPipeline(gateway)
    result = await pipeline.run(
        [_doc()], ExtractionConfig(targetTypes=vendor_targets()), tmp_path
    )

    assert result.model == "claude-sonnet-4-6"
    assert result.escalated is False
    assert gateway.models_used == {"claude-sonnet-4-6"}


async def test_escalated_rerun_routes_coverage_to_opus(tmp_path: Path) -> None:
    gateway = FakeGateway(router=scripted_router(_script()))
    pipeline = ExtractionPipeline(gateway)
    config = ExtractionConfig(targetTypes=vendor_targets(), escalate=True)
    result = await pipeline.run([_doc()], config, tmp_path)

    assert gateway.models_used == {"claude-opus-4-8"}
    assert result.model == "claude-opus-4-8"
    assert result.escalated is True

    metadata = json.loads(Path(result.outputFiles.metadata).read_text(encoding="utf-8"))
    assert metadata["model"] == "claude-opus-4-8"
    assert metadata["escalated"] is True
