"""Cross-validator parity — Python ``jsonschema`` leg (feature 2.1 acceptance criterion 4).

Reads the *same* unified fixture file as the TypeScript Ajv leg
(``modules/schema/test/cross-validator-parity.test.ts``) and asserts every fixture yields
its declared ``expectValid`` verdict under ``jsonschema``. Because both ecosystems assert
against the same embedded expectation, a semantic divergence between Ajv and ``jsonschema``
fails CI in one leg or the other (spec 001 Decision 3).

The default ``jsonschema`` validator does not assert ``format`` keywords (Ajv, via
ajv-formats, does); the fixtures therefore keep well-formed uuid/date-time values and every
invalid case fails only on format-agnostic keywords, so the two legs stay in lock-step.
"""

from __future__ import annotations

import json
from typing import Any

import pytest

from dkm_enrichment.schema_validation import SchemaValidator, find_schemas_dir


def _load_cases() -> dict[str, list[dict[str, Any]]]:
    repo_root = find_schemas_dir().parent
    path = repo_root / "fixtures" / "parity" / "behaviour" / "cases.json"
    return json.loads(path.read_text(encoding="utf-8"))


_CASES = _load_cases()
_VALIDATOR = SchemaValidator()


@pytest.mark.parametrize("case", _CASES["entries"], ids=lambda c: c["name"])
def test_entry_fixture_parity(case: dict[str, Any]) -> None:
    outcome = _VALIDATOR.validate_data(case["type"], case["payload"])
    assert outcome.valid is case["expectValid"], (case["name"], outcome.error)


@pytest.mark.parametrize("case", _CASES["relationships"], ids=lambda c: c["name"])
def test_relationship_fixture_parity(case: dict[str, Any]) -> None:
    outcome = _VALIDATOR.validate_against_schema_id(case["schemaId"], case["payload"])
    assert outcome.valid is case["expectValid"], (case["name"], outcome.error)


def test_fixture_set_covers_each_new_l3_type() -> None:
    """Guard: valid + ≥2 invalid per new L3 type, so the parity gate has real coverage."""

    for type_name in ("OrchestrationFlow", "OrchestrationStep", "Event", "StateTransition"):
        cases = [c for c in _CASES["entries"] if c["type"] == type_name]
        assert any(c["expectValid"] for c in cases), type_name
        assert len([c for c in cases if not c["expectValid"]]) >= 2, type_name
