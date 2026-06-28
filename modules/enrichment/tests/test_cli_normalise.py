"""The `dkm_enrichment normalise` CLI — LLM-adjudicated dedup over a domain's JSONL (issue #76)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from dkm_enrichment import cli
from dkm_enrichment.gateway.fake import FakeGateway
from dkm_enrichment.models import JsonlEntry, LLMOptions, SourceProvenance

_SRC = SourceProvenance(
    file="f.pdf", location="Page 1", fetchedAt="2026-01-01T00:00:00.000Z", sourceAuthority="scheme"
)


def _entity(eid: str, name: str, conf: float = 0.5) -> JsonlEntry:
    return JsonlEntry(
        id=eid, type="DomainConcept", version="1.0.0", source=_SRC,
        confidence=conf, extractedAt="2026-01-01T00:00:00.000Z", data={"name": name},
    )


def _rel(rid: str, src: str, tgt: str) -> JsonlEntry:
    return JsonlEntry(
        id=rid, type="Relationship", version="1.0.0", source=_SRC,
        confidence=0.8, extractedAt="2026-01-01T00:00:00.000Z",
        data={"relationshipType": "governs", "sourceEntityId": src, "targetEntityId": tgt},
    )


def _write(path: Path, entries: list[JsonlEntry]) -> None:
    path.write_text("\n".join(e.to_jsonl() for e in entries) + "\n", encoding="utf-8")


def _read_json_lines(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def _seed(domain: Path) -> None:
    domain.mkdir(parents=True, exist_ok=True)
    _write(
        domain / "extractions.jsonl",
        [
            _entity("a", "Proxy Voting", 0.6),
            _entity("b", "Proxy Voting (PV)", 0.9),
            _entity("c", "Climate"),
        ],
    )
    _write(domain / "relationships.jsonl", [_rel("r1", "b", "c")])  # b will merge into a


def test_normalise_merges_remaps_and_writes_report(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    domain = tmp_path / "stewardship"
    _seed(domain)

    def router(_p: str, _s: dict[str, Any], _o: LLMOptions) -> dict[str, Any]:
        return {
            "groups": [
                {"canonical": "Proxy Voting", "members": ["Proxy Voting", "Proxy Voting (PV)"]}
            ]
        }

    monkeypatch.setattr(cli, "build_gateway", lambda *, fake: FakeGateway(router=router))
    rc = cli.main(["normalise", str(domain)])
    assert rc == 0

    entities = _read_json_lines(domain / "extractions.jsonl")
    assert len(entities) == 2  # a + c (b merged into a)
    survivor = next(e for e in entities if e["id"] == "a")
    assert survivor["data"]["aliases"] == ["Proxy Voting (PV)"]

    # The relationship that pointed at the merged-away 'b' now points at the survivor 'a'.
    rels = _read_json_lines(domain / "relationships.jsonl")
    assert rels[0]["data"]["sourceEntityId"] == "a"

    # Report + reversible backup of the originals.
    report = json.loads((domain / "normalisation-report.json").read_text())
    assert report["entitiesMerged"] == 1
    assert report["merges"][0]["canonical"] == "Proxy Voting"
    assert (domain / "pre-normalisation" / "extractions.jsonl").exists()


def test_normalise_fake_is_a_safe_noop_without_a_key(tmp_path: Path) -> None:
    domain = tmp_path / "d"
    _seed(domain)
    rc = cli.main(["normalise", str(domain), "--fake"])
    assert rc == 0
    # No duplicates confirmed → all three entities remain.
    assert len(_read_json_lines(domain / "extractions.jsonl")) == 3
    assert json.loads((domain / "normalisation-report.json").read_text())["entitiesMerged"] == 0


def test_normalise_errors_when_no_extractions(tmp_path: Path) -> None:
    assert cli.main(["normalise", str(tmp_path)]) == 1
