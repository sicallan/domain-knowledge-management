"""The ``dkm_enrichment classify-architecture`` CLI — the Business-Architecture pass (Feature 08).

Classifies the raw ``BusinessCapability`` entries in a domain's ``extractions.jsonl`` against a
curated ``ReferenceCapability`` spine and writes ``classifications.jsonl`` (the projector's second
input). Re-running is idempotent: already-classified subjects are skipped, so the file is stable.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from dkm_enrichment import cli
from dkm_enrichment.gateway.fake import FakeGateway
from dkm_enrichment.models import JsonlEntry, LLMOptions, SourceProvenance

_SRC = SourceProvenance(
    file="stewardship.pdf", location="Page 1", fetchedAt="2026-01-01T00:00:00.000Z",
    sourceAuthority="scheme",
)


def _cap(eid: str, name: str) -> JsonlEntry:
    return JsonlEntry(
        id=eid, type="BusinessCapability", version="1.0.0", source=_SRC,
        confidence=0.9, extractedAt="2026-01-01T00:00:00.000Z", data={"name": name},
    )


def _concept(eid: str, name: str) -> JsonlEntry:
    return JsonlEntry(
        id=eid, type="DomainConcept", version="1.0.0", source=_SRC,
        confidence=0.9, extractedAt="2026-01-01T00:00:00.000Z", data={"name": name},
    )


def _ref(eid: str, name: str, level: int, parent: str | None = None) -> JsonlEntry:
    data: dict[str, Any] = {"name": name, "level": level, "framework": "BIZBOK"}
    if parent is not None:
        data["parent"] = parent
    return JsonlEntry(
        id=eid, type="ReferenceCapability", version="1.0.0", source=_SRC,
        confidence=1.0, extractedAt="2026-01-01T00:00:00.000Z", data=data,
    )


def _write(path: Path, entries: list[JsonlEntry]) -> None:
    path.write_text("\n".join(e.to_jsonl() for e in entries) + "\n", encoding="utf-8")


def _read(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def _seed(tmp_path: Path) -> tuple[Path, Path]:
    domain = tmp_path / "stewardship"
    domain.mkdir(parents=True, exist_ok=True)
    _write(
        domain / "extractions.jsonl",
        [
            _cap("c-portfolio-construction", "Portfolio Construction"),
            _cap("c-vanguard", "Vanguard Investor Choice"),
            _concept("e-cardholder", "Cardholder"),  # not a capability — never classified
        ],
    )
    spine = tmp_path / "spine.jsonl"
    _write(
        spine,
        [
            _ref("ref-im", "Investment Management", 1),
            _ref("ref-pm", "Portfolio Management", 2, "Investment Management"),
        ],
    )
    return domain, spine


def _router(_p: str, _s: dict[str, Any], _o: LLMOptions) -> dict[str, Any]:
    return {
        "classifications": [
            {"subject": "Portfolio Construction", "disposition": "placed",
             "assignedParent": "Portfolio Management", "assignedLevel": 3,
             "rationale": "L3 function.", "confidence": 0.9},
            {"subject": "Vanguard Investor Choice", "disposition": "rejected",
             "rejectionReason": "generic-mention", "rationale": "Vendor.", "confidence": 0.8},
        ]
    }


def test_classify_writes_one_classification_per_capability(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    domain, spine = _seed(tmp_path)
    monkeypatch.setattr(cli, "build_gateway", lambda *, fake: FakeGateway(router=_router))
    rc = cli.main(["classify-architecture", str(domain), "--spine", str(spine)])
    assert rc == 0

    classifications = _read(domain / "classifications.jsonl")
    # Only the two BusinessCapability entries are classified — the DomainConcept is left alone.
    assert len(classifications) == 2
    assert all(c["type"] == "CapabilityClassification" for c in classifications)
    by_subject = {c["data"]["subject"]: c for c in classifications}
    assert by_subject["c-portfolio-construction"]["data"]["disposition"] == "placed"
    assert by_subject["c-vanguard"]["data"]["disposition"] == "rejected"


def test_classify_is_idempotent_on_a_second_run(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    domain, spine = _seed(tmp_path)
    monkeypatch.setattr(cli, "build_gateway", lambda *, fake: FakeGateway(router=_router))

    assert cli.main(["classify-architecture", str(domain), "--spine", str(spine)]) == 0
    first = (domain / "classifications.jsonl").read_text()
    assert cli.main(["classify-architecture", str(domain), "--spine", str(spine)]) == 0
    second = (domain / "classifications.jsonl").read_text()
    # Nothing new to classify → byte-identical file (stable ids, no duplicates).
    assert first == second


def test_classify_incrementally_appends_new_capabilities(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    domain, spine = _seed(tmp_path)
    monkeypatch.setattr(cli, "build_gateway", lambda *, fake: FakeGateway(router=_router))
    assert cli.main(["classify-architecture", str(domain), "--spine", str(spine)]) == 0

    # A later ingest adds a new capability; only it should reach the model on the next run.
    _write(
        domain / "extractions.jsonl",
        [
            _cap("c-portfolio-construction", "Portfolio Construction"),
            _cap("c-vanguard", "Vanguard Investor Choice"),
            _cap("c-proxy-voting", "Proxy Voting"),
        ],
    )

    calls: list[str] = []

    def counting_router(prompt: str, s: dict[str, Any], o: LLMOptions) -> dict[str, Any]:
        calls.append(prompt)
        return {"classifications": [
            {"subject": "Proxy Voting", "disposition": "placed",
             "assignedParent": "Portfolio Management", "assignedLevel": 3, "rationale": "x"},
        ]}

    monkeypatch.setattr(cli, "build_gateway", lambda *, fake: FakeGateway(router=counting_router))
    assert cli.main(["classify-architecture", str(domain), "--spine", str(spine)]) == 0

    classifications = _read(domain / "classifications.jsonl")
    assert {c["data"]["subject"] for c in classifications} == {
        "c-portfolio-construction", "c-vanguard", "c-proxy-voting"
    }
    # The prompt on the incremental run carried only the new name.
    assert len(calls) == 1
    assert "Proxy Voting" in calls[0]
    assert "Portfolio Construction" not in calls[0]


def test_classify_fake_is_a_safe_noop_without_a_key(tmp_path: Path) -> None:
    domain, spine = _seed(tmp_path)
    rc = cli.main(["classify-architecture", str(domain), "--spine", str(spine), "--fake"])
    assert rc == 0
    # The default fake gateway returns no classifications → an empty (but present) artifact.
    assert _read(domain / "classifications.jsonl") == []


def test_classify_reads_hand_authored_spine_without_source_authority(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The curated spine (like demo/business-architecture-spine.jsonl) omits `sourceAuthority` on
    its hand-authored `source` — the pass must still read it (regression guard)."""
    domain, _ = _seed(tmp_path)
    spine = tmp_path / "curated-spine.jsonl"
    spine.write_text(
        '{"id":"ref-im","type":"ReferenceCapability","version":"1.0.0",'
        '"source":{"file":"feedback/ba-review.md","location":"L1 §Investment Management",'
        '"fetchedAt":"2026-07-01T00:00:00Z"},"confidence":1.0,'
        '"extractedAt":"2026-07-01T00:00:00Z",'
        '"data":{"name":"Investment Management","level":1,"framework":"BIZBOK"}}\n'
        '{"id":"ref-pm","type":"ReferenceCapability","version":"1.0.0",'
        '"source":{"file":"feedback/ba-review.md","location":"L2 §Portfolio Management",'
        '"fetchedAt":"2026-07-01T00:00:00Z"},"confidence":1.0,'
        '"extractedAt":"2026-07-01T00:00:00Z",'
        '"data":{"name":"Portfolio Management","level":2,"parent":"Investment Management",'
        '"framework":"BIZBOK"}}\n',
        encoding="utf-8",
    )
    monkeypatch.setattr(cli, "build_gateway", lambda *, fake: FakeGateway(router=_router))
    assert cli.main(["classify-architecture", str(domain), "--spine", str(spine)]) == 0
    assert len(_read(domain / "classifications.jsonl")) == 2


def test_classify_errors_when_no_extractions(tmp_path: Path) -> None:
    spine = tmp_path / "spine.jsonl"
    _write(spine, [_ref("ref-im", "Investment Management", 1)])
    assert cli.main(["classify-architecture", str(tmp_path), "--spine", str(spine)]) == 1


def test_classify_errors_when_spine_missing(tmp_path: Path) -> None:
    domain, _ = _seed(tmp_path)
    assert cli.main(
        ["classify-architecture", str(domain), "--spine", str(tmp_path / "nope.jsonl")]
    ) == 1
