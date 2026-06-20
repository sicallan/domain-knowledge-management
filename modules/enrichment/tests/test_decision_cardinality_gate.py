"""Unit — decision cardinality / conditional gate (feature 03 §8, criteria 3-5; D-P2.2 + D-P2.5).

Per committed Decision the emit gate enforces the Feature 01 cardinality rules — ``evaluates ≥ 1``,
``produces ≥ 1``, and ``decisionType=automated ⇒ triggeredBy ≥ 1``. The numbers are owned by the
canonical ``RelationshipTypeRegistry`` (``modules/schema/src/relationships.ts``: ``evaluates`` and
``produces`` ``minTargetsPerSource=1``, plus ``checkAutomatedDecisionTrigger``) — the Python emit
gate is the **second** enforcement point (D-P2.2 "defined once, enforced twice"). A violating
Decision is **flagged → routed to the review queue + counted** (``stats.cardinalityFlagged``),
never auto-merged and never hard-dropped (D-P2.5 + the D-P1.5 two-tier model).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from dkm_enrichment.emission import read_jsonl
from dkm_enrichment.gateway.fake import FakeGateway
from dkm_enrichment.models import (
    CanonicalDocument,
    DocumentSection,
    ExtractionConfig,
)
from dkm_enrichment.pipeline import ExtractionPipeline

from .conftest import decision_targets, scripted_router

_DOC_ID = "doc-cardinality"
_SECTION = "Decisions"


def _doc() -> CanonicalDocument:
    return CanonicalDocument(
        id=_DOC_ID,
        sourceType="filesystem",
        sourcePath="cardinality.md",
        sourceVersion="1",
        fetchedAt="2026-01-01T00:00:00.000Z",
        sourceAuthority="scheme",
        content="x",
        title="Cardinality",
        sections=[DocumentSection(id="s1", title=_SECTION, content="content")],
    )


def _script(
    decision_type: str,
    *,
    evaluates: bool,
    produces: bool,
    triggered: bool,
) -> dict[str, Any]:
    relationships: list[dict[str, Any]] = []
    if evaluates:
        relationships.append(
            {"type": "evaluates", "source": "The Decision",
             "target": "Some rule applies", "confidence": 0.9}
        )
    if produces:
        relationships.append(
            {"type": "produces", "source": "The Decision",
             "target": "OutcomeRaised", "confidence": 0.9}
        )
    if triggered:
        relationships.append(
            {"type": "triggeredBy", "source": "TriggerArrived",
             "target": "The Decision", "confidence": 0.9}
        )
    return {
        _DOC_ID: {
            _SECTION: {
                "entities": [
                    {"type": "Decision", "name": "The Decision",
                     "decisionType": decision_type, "outcomes": ["yes", "no"],
                     "confidence": 0.92},
                    {"type": "Rule", "expression": "Some rule applies",
                     "ruleType": "decision", "confidence": 0.92},
                    {"type": "Event", "name": "OutcomeRaised", "eventType": "domain",
                     "confidence": 0.92},
                    {"type": "Event", "name": "TriggerArrived", "eventType": "integration",
                     "confidence": 0.92},
                ],
                "relationships": relationships,
            }
        }
    }


async def _run(script: dict[str, Any], tmp_path: Path) -> tuple[Any, dict[str, Any]]:
    pipeline = ExtractionPipeline(FakeGateway(router=scripted_router(script)))
    result = await pipeline.run([_doc()], _config(), tmp_path)
    entities = read_jsonl(Path(result.outputFiles.extractions))
    decision = next(e for e in entities if e["type"] == "Decision")
    return result, decision


def _config() -> ExtractionConfig:
    return ExtractionConfig(targetTypes=decision_targets())


async def test_complete_automated_decision_is_not_flagged(tmp_path: Path) -> None:
    script = _script("automated", evaluates=True, produces=True, triggered=True)
    result, decision = await _run(script, tmp_path)

    assert result.stats.cardinalityFlagged == 0
    # The Decision is committed and carries no review marker.
    assert (decision.get("metadata") or {}).get("reviewQueue") is None
    assert result.stats.entitiesExtracted >= 1


async def test_decision_without_evaluates_is_flagged(tmp_path: Path) -> None:
    script = _script("automated", evaluates=False, produces=True, triggered=True)
    result, decision = await _run(script, tmp_path)

    assert result.stats.cardinalityFlagged == 1
    # Flagged, not dropped: the Decision is still emitted, marked for the review queue.
    assert decision["metadata"]["reviewQueue"] == "cardinality"
    assert "evaluates>=1" in decision["metadata"]["cardinalityViolations"]


async def test_decision_without_produces_is_flagged(tmp_path: Path) -> None:
    script = _script("automated", evaluates=True, produces=False, triggered=True)
    result, decision = await _run(script, tmp_path)

    assert result.stats.cardinalityFlagged == 1
    assert "produces>=1" in decision["metadata"]["cardinalityViolations"]


async def test_automated_decision_without_trigger_is_flagged(tmp_path: Path) -> None:
    script = _script("automated", evaluates=True, produces=True, triggered=False)
    result, decision = await _run(script, tmp_path)

    assert result.stats.cardinalityFlagged == 1
    assert "automated=>triggeredBy>=1" in decision["metadata"]["cardinalityViolations"]


async def test_manual_decision_without_trigger_is_not_flagged(tmp_path: Path) -> None:
    # The triggeredBy conditional binds only automated decisions; a manual one needs no trigger.
    script = _script("manual", evaluates=True, produces=True, triggered=False)
    result, decision = await _run(script, tmp_path)

    assert result.stats.cardinalityFlagged == 0
    assert (decision.get("metadata") or {}).get("reviewQueue") is None
