"""Opt-in real-Claude smoke for the Business-Architecture classification pass (Feature 08, #86).

The deterministic behaviour of the pass is covered hermetically in
``test_architecture_classification.py`` (FakeGateway). This file is the **real-Claude** leg
(``@pytest.mark.llm``, auto-skipped without ``ANTHROPIC_API_KEY`` — CI contract, criterion 9): it
loads the *actual* curated spine and asserts that a live classifier honours the invariants the EA
lens depends on — an obvious vendor mention is rejected, and every placement lands under a real
spine node at a valid tree level.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from dkm_enrichment.architecture_classification import classify_architecture
from dkm_enrichment.models import JsonlEntry, SourceProvenance

_SRC = SourceProvenance(
    file="eval", location="eval", fetchedAt="2026-01-01T00:00:00.000Z", sourceAuthority="scheme"
)


def _spine_path() -> Path:
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "demo" / "business-architecture-spine.jsonl"
        if candidate.exists():
            return candidate
    raise FileNotFoundError("Could not locate demo/business-architecture-spine.jsonl")


def _load_spine() -> list[JsonlEntry]:
    return [
        JsonlEntry.model_validate_json(line)
        for line in _spine_path().read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def _cap(eid: str, name: str) -> JsonlEntry:
    return JsonlEntry(
        id=eid, type="BusinessCapability", version="1.0.0", source=_SRC,
        confidence=0.9, extractedAt="2026-01-01T00:00:00.000Z", data={"name": name},
    )


# A small, representative labelled set: two genuine capabilities and one implementation-detail
# vendor mention that a business architect rejects.
_CAPS = [
    _cap("c-portfolio-construction", "Portfolio Construction"),
    _cap("c-proxy-voting", "Proxy Voting"),
    _cap("c-vanguard", "Vanguard Investor Choice"),
]


@pytest.mark.llm
@pytest.mark.skipif(
    not os.environ.get("ANTHROPIC_API_KEY"),
    reason="ANTHROPIC_API_KEY not set — real-Claude classification eval is opt-in",
)
async def test_real_classifier_rejects_a_vendor_mention_and_places_capabilities() -> None:
    pytest.importorskip("anthropic", reason="install the [llm] extra to run the golden eval")
    from dkm_enrichment.gateway.claude import ClaudeGateway

    spine = _load_spine()
    spine_names = {str(r.data.get("name", "")).strip().lower() for r in spine}

    result = await classify_architecture(ClaudeGateway(), _CAPS, spine)

    by_subject = {e.data["subject"]: e for e in result}
    assert set(by_subject) == {c.id for c in _CAPS}  # one verdict per input

    # The obvious vendor product mention is rejected, with a reason.
    vanguard = by_subject["c-vanguard"]
    assert vanguard.data["disposition"] == "rejected"
    assert vanguard.data.get("rejectionReason")

    # Every placement names a real spine node at a valid EA tree level, with a rationale.
    for subject in ("c-portfolio-construction", "c-proxy-voting"):
        entry = by_subject[subject]
        if entry.data["disposition"] != "placed":
            continue  # a defensible rejection is allowed; only assert placements are well-formed
        assert entry.data["assignedParent"].strip().lower() in spine_names
        assert 2 <= entry.data["assignedLevel"] <= 4
        assert entry.data["rationale"].strip()
