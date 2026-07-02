"""The Business-Architecture classification pass (Feature 08, #86 — ADR-0009).

The pass maps each raw ``BusinessCapability`` into the curated ``ReferenceCapability`` spine
(``placed`` under a reference node at an assigned tree level) or ``rejected`` with a reason, and
emits one first-class ``CapabilityClassification`` per capability. The LLM judgment runs through
the :class:`FakeGateway` so CI needs no key; the projector later reads these entries and projects
the EA tree over (spine + classifications).

The key guarantees under test: one classification per input, the disposition-shaped ``data``
payload the projector reads (``placed`` → ``assignedParent`` + ``assignedLevel``; ``rejected`` →
``rejectionReason``), the classifier's confidence carried on the entry's top-level ``confidence``,
deterministic ids so a re-run is idempotent, and incremental skipping of classified subjects.
"""

from __future__ import annotations

from typing import Any

from dkm_enrichment.architecture_classification import (
    CLASSIFICATION_TYPE,
    build_classification_prompt,
    classify_architecture,
)
from dkm_enrichment.gateway.fake import FakeGateway
from dkm_enrichment.models import JsonlEntry, LLMOptions, SourceProvenance

_SRC = SourceProvenance(
    file="stewardship.pdf", location="Page 1", fetchedAt="2026-01-01T00:00:00.000Z",
    sourceAuthority="scheme",
)
_NOW = "2026-07-01T00:00:00.000Z"


def _cap(eid: str, name: str, conf: float = 0.9) -> JsonlEntry:
    return JsonlEntry(
        id=eid, type="BusinessCapability", version="1.0.0", source=_SRC,
        confidence=conf, extractedAt="2026-01-01T00:00:00.000Z", data={"name": name},
    )


def _ref(eid: str, name: str, level: int, parent: str | None = None) -> JsonlEntry:
    data: dict[str, Any] = {"name": name, "level": level, "framework": "BIZBOK"}
    if parent is not None:
        data["parent"] = parent
    return JsonlEntry(
        id=eid, type="ReferenceCapability", version="1.0.0", source=_SRC,
        confidence=1.0, extractedAt="2026-01-01T00:00:00.000Z", data=data,
    )


_SPINE = [
    _ref("ref-investment-management", "Investment Management", 1),
    _ref("ref-portfolio-management", "Portfolio Management", 2, "Investment Management"),
    _ref("ref-stewardship-domain", "Investment Stewardship & Responsible Investment", 1),
    _ref("ref-stewardship", "Stewardship", 2, "Investment Stewardship & Responsible Investment"),
]

# A scripted "business architect": place two capabilities, reject the implementation-detail mention.
_GOLDEN: dict[str, dict[str, Any]] = {
    "Portfolio Construction": {
        "disposition": "placed", "assignedParent": "Portfolio Management",
        "assignedLevel": 3, "rationale": "An L3 function of Portfolio Mgmt.", "confidence": 0.91,
    },
    "Proxy Voting": {
        "disposition": "placed", "assignedParent": "Stewardship",
        "assignedLevel": 3, "rationale": "A stewardship function.", "confidence": 0.88,
    },
    "Vanguard Investor Choice": {
        "disposition": "rejected", "rejectionReason": "generic-mention",
        "rationale": "A vendor product mention, not a capability.", "confidence": 0.8,
    },
}


def _golden_router(_prompt: str, _schema: dict[str, Any], _opts: LLMOptions) -> dict[str, Any]:
    # Classify every name the batch prompt lists (the prompt lists the raw capability names).
    return {
        "classifications": [
            {"subject": name, **fields} for name, fields in _GOLDEN.items()
        ]
    }


async def test_classifies_every_capability_placed_or_rejected() -> None:
    caps = [
        _cap("c-portfolio-construction", "Portfolio Construction"),
        _cap("c-proxy-voting", "Proxy Voting"),
        _cap("c-vanguard", "Vanguard Investor Choice"),
    ]
    result = await classify_architecture(FakeGateway(router=_golden_router), caps, _SPINE, now=_NOW)

    assert len(result) == len(caps)
    assert all(e.type == CLASSIFICATION_TYPE for e in result)
    by_subject = {e.data["subject"]: e for e in result}
    assert set(by_subject) == {"c-portfolio-construction", "c-proxy-voting", "c-vanguard"}


async def test_placed_carries_parent_level_and_classifier_confidence() -> None:
    caps = [_cap("c-portfolio-construction", "Portfolio Construction")]
    gateway = FakeGateway(router=_golden_router)
    [entry] = await classify_architecture(gateway, caps, _SPINE, now=_NOW)

    assert entry.data["disposition"] == "placed"
    assert entry.data["assignedParent"] == "Portfolio Management"
    assert entry.data["assignedLevel"] == 3
    assert entry.data["rationale"]
    assert "rejectionReason" not in entry.data
    # The classifier's certainty rides the entry's top-level confidence (base-entry reuse).
    assert entry.confidence == 0.91


async def test_rejection_is_explicit_with_reason_and_no_placement() -> None:
    caps = [_cap("c-vanguard", "Vanguard Investor Choice")]
    gateway = FakeGateway(router=_golden_router)
    [entry] = await classify_architecture(gateway, caps, _SPINE, now=_NOW)

    assert entry.data["disposition"] == "rejected"
    assert entry.data["rejectionReason"] == "generic-mention"
    assert entry.data["rationale"]
    # A rejection is never also a placement — the projector must not tree it.
    assert "assignedParent" not in entry.data
    assert "assignedLevel" not in entry.data


async def test_subject_points_at_the_raw_capability_id() -> None:
    caps = [_cap("c-proxy-voting", "Proxy Voting")]
    gateway = FakeGateway(router=_golden_router)
    [entry] = await classify_architecture(gateway, caps, _SPINE, now=_NOW)
    # The subject is the raw capability *id* (its evidence), not its name.
    assert entry.data["subject"] == "c-proxy-voting"


async def test_ids_are_deterministic_so_a_rerun_is_idempotent() -> None:
    caps = [_cap("c-proxy-voting", "Proxy Voting")]
    gateway = FakeGateway(router=_golden_router)
    first = await classify_architecture(gateway, caps, _SPINE, now=_NOW)
    second = await classify_architecture(gateway, caps, _SPINE, now=_NOW)
    assert [e.id for e in first] == [e.id for e in second]
    # A stable id per subject means a loader upsert overwrites rather than duplicates.
    assert first[0].id == second[0].id


async def test_already_classified_subjects_are_skipped_incrementally() -> None:
    caps = [
        _cap("c-portfolio-construction", "Portfolio Construction"),
        _cap("c-proxy-voting", "Proxy Voting"),
    ]
    gateway = FakeGateway(router=_golden_router)
    result = await classify_architecture(
        gateway, caps, _SPINE, already_classified={"c-portfolio-construction"}, now=_NOW
    )
    # Only the unclassified remainder is sent to the model and emitted.
    subjects = {e.data["subject"] for e in result}
    assert subjects == {"c-proxy-voting"}


async def test_no_gateway_call_when_everything_already_classified() -> None:
    caps = [_cap("c-proxy-voting", "Proxy Voting")]
    gateway = FakeGateway(router=_golden_router)
    result = await classify_architecture(
        gateway, caps, _SPINE, already_classified={"c-proxy-voting"}, now=_NOW
    )
    assert result == []
    assert gateway.calls == []  # nothing pending → no LLM call at all


async def test_names_the_model_omits_stay_unclassified() -> None:
    def sparse_router(_p: str, _s: dict[str, Any], _o: LLMOptions) -> dict[str, Any]:
        # The model returns a verdict for only one of the two inputs.
        return {"classifications": [{"subject": "Proxy Voting", "disposition": "placed",
                                     "assignedParent": "Stewardship", "assignedLevel": 3,
                                     "rationale": "x"}]}

    caps = [_cap("c-a", "Proxy Voting"), _cap("c-b", "Some Unseen Capability")]
    result = await classify_architecture(FakeGateway(router=sparse_router), caps, _SPINE, now=_NOW)
    # No fabricated verdict for the omitted capability — it simply has no classification yet.
    assert {e.data["subject"] for e in result} == {"c-a"}


def test_prompt_lists_the_spine_taxonomy_and_the_raw_names() -> None:
    prompt = build_classification_prompt(_SPINE, ["Portfolio Construction", "Proxy Voting"])
    # The L1 → L2 spine is in the prompt so the model classifies *into* it…
    assert "Investment Management" in prompt
    assert "Portfolio Management" in prompt
    # …and the raw names to classify are listed.
    assert "Portfolio Construction" in prompt
    assert "Proxy Voting" in prompt
