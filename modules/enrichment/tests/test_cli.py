"""The ``dkm_enrichment extract`` CLI — the Python half of ``dkm process``."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from dkm_enrichment import cli
from dkm_enrichment.gateway.fake import FakeGateway
from dkm_enrichment.models import CanonicalDocument, DocumentSection

from .conftest import scripted_router


def _doc(doc_id: str = "doc-1", *, section_title: str = "Main") -> CanonicalDocument:
    return CanonicalDocument(
        id=doc_id,
        sourceType="filesystem",
        sourcePath="a.md",
        sourceVersion="1",
        fetchedAt="2026-01-01T00:00:00.000Z",
        sourceAuthority="scheme",
        content="x",
        title="Doc",
        sections=[
            DocumentSection(id="s1", title=section_title, content="The Authorisation aggregate.")
        ],
    )


def _write_canonical(path: Path, docs: list[CanonicalDocument]) -> None:
    path.write_text("\n".join(d.model_dump_json() for d in docs), encoding="utf-8")


def test_extract_writes_canonical_named_jsonl(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    canonical = tmp_path / "canonical-docs.jsonl"
    _write_canonical(canonical, [_doc()])
    script = {
        "doc-1": {
            "Main": {
                "entities": [
                    {
                        "type": "DomainConcept",
                        "name": "Authorisation",
                        "conceptType": "aggregate",
                        "confidence": 0.9,
                    }
                ]
            }
        }
    }
    monkeypatch.setattr(
        cli, "build_gateway", lambda *, fake: FakeGateway(router=scripted_router(script))
    )

    out = tmp_path / "out"
    rc = cli.main(["extract", str(canonical), "--out", str(out), "--fake"])
    assert rc == 0

    # Stable, canonical filenames the gateway watches — no run-id-prefixed files, staging cleaned.
    assert sorted(p.name for p in out.glob("*.jsonl")) == [
        "extractions.jsonl",
        "relationships.jsonl",
    ]
    assert (out / "metadata.json").exists()
    assert not (out / ".staging").exists()

    entities = [
        json.loads(line)
        for line in (out / "extractions.jsonl").read_text().splitlines()
        if line.strip()
    ]
    assert any(e["data"]["name"] == "Authorisation" for e in entities)


def test_extract_fake_runs_without_a_key(tmp_path: Path) -> None:
    # The real --fake path (default FakeGateway, no anthropic SDK, no key) must succeed end to end.
    canonical = tmp_path / "c.jsonl"
    _write_canonical(canonical, [_doc("d")])
    out = tmp_path / "out"

    rc = cli.main(["extract", str(canonical), "--out", str(out), "--fake"])
    assert rc == 0
    assert (out / "extractions.jsonl").exists()  # present (possibly empty) — plumbing works


def test_extract_rerun_overwrites_rather_than_accumulating(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    canonical = tmp_path / "c.jsonl"
    _write_canonical(canonical, [_doc("d")])
    monkeypatch.setattr(cli, "build_gateway", lambda *, fake: FakeGateway())
    out = tmp_path / "out"

    cli.main(["extract", str(canonical), "--out", str(out), "--fake"])
    cli.main(["extract", str(canonical), "--out", str(out), "--fake"])
    # Two runs, still exactly the two canonical files (no run-id accumulation).
    assert sorted(p.name for p in out.glob("*.jsonl")) == [
        "extractions.jsonl",
        "relationships.jsonl",
    ]


def test_extract_errors_on_empty_input(tmp_path: Path) -> None:
    empty = tmp_path / "empty.jsonl"
    empty.write_text("")
    assert cli.main(["extract", str(empty), "--out", str(tmp_path / "o"), "--fake"]) == 1


def test_extract_errors_on_missing_input(tmp_path: Path) -> None:
    assert (
        cli.main(["extract", str(tmp_path / "nope.jsonl"), "--out", str(tmp_path / "o"), "--fake"])
        == 1
    )
