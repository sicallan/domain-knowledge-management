"""Unit — L2 edge extraction & emit-gate quarantine (feature 02 §8, criteria 4-5; D-P2.2 + D-P2.5).

The L2 structural edges (``fulfils`` / ``specifies`` / ``realizesVendorCap``) are emitted with
endpoints that reference committed ids and validate against
``schemas/relationships/l2-structural.schema.json``. Edges with the wrong endpoint *types*, or whose
endpoint is not (yet) committed — e.g. ``realizesVendorCap → a Service`` (an L3 endpoint that is not
extractable here) — are **quarantined to the review queue and counted**, never written dangling
(D-P2.5). A malformed entity (bad ``coverage``, a disallowed ``mappedConcept.targetType``) is
excluded by the schema gate and counted, never emitted (criterion 4 — precision-first on coverage).
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
from dkm_enrichment.schema_validation import SchemaValidator

from .conftest import scripted_router, vendor_targets

_DOC_ID = "doc-vendor-edges"
_SECTION = "Vendor"


def _doc() -> CanonicalDocument:
    return CanonicalDocument(
        id=_DOC_ID,
        sourceType="filesystem",
        sourcePath="vendor-edges.md",
        sourceVersion="1",
        fetchedAt="2026-01-01T00:00:00.000Z",
        sourceAuthority="vendor",
        content="x",
        title="Vendor Edges",
        sections=[DocumentSection(id="s1", title=_SECTION, content="content")],
    )


def _product(name: str = "Acme Pay Gateway") -> dict[str, Any]:
    return {"type": "VendorProduct", "name": name, "vendor": "Acme",
            "capabilityClaims": ["Acme Card Authorisation"], "confidence": 0.9}


def _capability(name: str = "Accept Card Payments") -> dict[str, Any]:
    return {"type": "BusinessCapability", "name": name, "confidence": 0.9}


def _concept(name: str = "Authorisation") -> dict[str, Any]:
    return {"type": "DomainConcept", "name": name, "conceptType": "aggregate", "confidence": 0.9}


def _spec(name: str = "Authorisation Hardening") -> dict[str, Any]:
    return {"type": "ProjectSpec", "name": name, "specType": "design", "status": "approved",
            "confidence": 0.9}


def _mapping(coverage: str = "full", concept: str = "Accept Card Payments",
             target_type: str = "BusinessCapability") -> dict[str, Any]:
    return {"type": "VendorCapabilityMapping", "vendorCapability": "Acme Card Authorisation",
            "mappedConcept": {"targetType": target_type, "targetId": concept},
            "coverage": coverage, "confidence": 0.88}


async def _run(script: dict[str, Any], tmp_path: Path) -> tuple[Any, list[dict[str, Any]]]:
    pipeline = ExtractionPipeline(FakeGateway(router=scripted_router(script)))
    result = await pipeline.run([_doc()], ExtractionConfig(targetTypes=vendor_targets()), tmp_path)
    rels = read_jsonl(Path(result.outputFiles.relationships))
    return result, rels


async def test_valid_l2_edges_are_emitted(tmp_path: Path) -> None:
    script = {_DOC_ID: {_SECTION: {
        "entities": [_product(), _capability(), _spec(), _concept(), _mapping()],
        "relationships": [
            {"type": "fulfils", "source": "Acme Pay Gateway",
             "target": "Accept Card Payments", "confidence": 0.85},
            {"type": "specifies", "source": "Authorisation Hardening",
             "target": "Authorisation", "confidence": 0.82},
        ],
    }}}
    result, rels = await _run(script, tmp_path)

    assert sorted(r["data"]["relationshipType"] for r in rels) == ["fulfils", "specifies"]
    assert result.stats.quarantined == 0


async def test_wrong_endpoint_type_fulfils_is_quarantined(tmp_path: Path) -> None:
    # fulfils requires VendorProduct → BusinessCapability; a ProjectSpec source is the wrong type.
    script = {_DOC_ID: {_SECTION: {
        "entities": [_spec(), _capability()],
        "relationships": [
            {"type": "fulfils", "source": "Authorisation Hardening",
             "target": "Accept Card Payments", "confidence": 0.85},
        ],
    }}}
    result, rels = await _run(script, tmp_path)

    assert [r["data"]["relationshipType"] for r in rels] == []
    assert result.stats.quarantined == 1


async def test_realizes_vendor_cap_wrong_endpoint_is_quarantined(tmp_path: Path) -> None:
    # realizesVendorCap requires Service → VendorCapabilityMapping; a VendorProduct source is the
    # wrong type and must be quarantined. (A genuine realizesVendorCap → from a Service is a
    # cross-pass recall gap — Service is an L3 endpoint not extractable here; it is a golden label.)
    script = {_DOC_ID: {_SECTION: {
        "entities": [_product(), _mapping()],
        "relationships": [
            {"type": "realizesVendorCap", "source": "Acme Pay Gateway",
             "target": "Acme Card Authorisation", "confidence": 0.8},
        ],
    }}}
    result, rels = await _run(script, tmp_path)

    assert [r["data"]["relationshipType"] for r in rels] == []
    assert result.stats.quarantined == 1


async def test_specifies_to_uncommitted_concept_is_quarantined(tmp_path: Path) -> None:
    # The DomainConcept is referenced but excluded below the 0.5 emit gate (a cross-pass
    # placeholder); the specifies edge must be quarantined, never written dangling (D-P2.5).
    script = {_DOC_ID: {_SECTION: {
        "entities": [
            _spec(),
            {"type": "DomainConcept", "name": "Authorisation", "conceptType": "aggregate",
             "confidence": 0.2},  # below the 0.5 emit gate → placeholder
        ],
        "relationships": [
            {"type": "specifies", "source": "Authorisation Hardening",
             "target": "Authorisation", "confidence": 0.82},
        ],
    }}}
    result, rels = await _run(script, tmp_path)

    assert [r["data"]["relationshipType"] for r in rels] == []
    assert result.stats.quarantined == 1


async def test_unrecognised_coverage_mapping_is_excluded_and_counted(tmp_path: Path) -> None:
    # Criterion 4: an unrecognised coverage ("mostly") does not normalise to the enum, so the schema
    # gate rejects the mapping — excluded + counted, never emitted as a false green.
    script = {_DOC_ID: {_SECTION: {
        "entities": [_product(), _capability(), _mapping(coverage="mostly")],
        "relationships": [],
    }}}
    pipeline = ExtractionPipeline(FakeGateway(router=scripted_router(script)))
    result = await pipeline.run([_doc()], ExtractionConfig(targetTypes=vendor_targets()), tmp_path)
    entities = read_jsonl(Path(result.outputFiles.extractions))

    assert not any(e["type"] == "VendorCapabilityMapping" for e in entities)
    assert result.stats.validationFailures >= 1


async def test_disallowed_mapped_concept_target_type_is_excluded(tmp_path: Path) -> None:
    # mappedConcept.targetType is a closed enum {DomainConcept, BusinessCapability}; "Decision" is
    # disallowed → the schema gate rejects the mapping (criterion 4).
    script = {_DOC_ID: {_SECTION: {
        "entities": [_mapping(target_type="Decision")],
        "relationships": [],
    }}}
    pipeline = ExtractionPipeline(FakeGateway(router=scripted_router(script)))
    result = await pipeline.run([_doc()], ExtractionConfig(targetTypes=vendor_targets()), tmp_path)
    entities = read_jsonl(Path(result.outputFiles.extractions))

    assert not any(e["type"] == "VendorCapabilityMapping" for e in entities)
    assert result.stats.validationFailures >= 1


def test_l2_schema_validation_covers_all_three_edge_kinds() -> None:
    # The L2 endpoint check admits each valid {kind: (sourceType, targetType)} pair and rejects a
    # wrong one — mirroring validate_decision_relationship / validate_behavioural_relationship.
    validator = SchemaValidator()
    valid = [
        ("fulfils", "VendorProduct", "BusinessCapability"),
        ("specifies", "ProjectSpec", "DomainConcept"),
        ("realizesVendorCap", "Service", "VendorCapabilityMapping"),
    ]
    for kind, source_type, target_type in valid:
        outcome = validator.validate_l2_structural_relationship(kind, source_type, target_type)
        assert outcome.valid, (kind, outcome.error)

    # Wrong source type for fulfils (a ProjectSpec does not fulfil a capability).
    assert not validator.validate_l2_structural_relationship(
        "fulfils", "ProjectSpec", "BusinessCapability"
    ).valid
    # specifies must point AT a DomainConcept, not a BusinessCapability.
    assert not validator.validate_l2_structural_relationship(
        "specifies", "ProjectSpec", "BusinessCapability"
    ).valid
    # realizesVendorCap must originate at a Service, not a VendorProduct.
    assert not validator.validate_l2_structural_relationship(
        "realizesVendorCap", "VendorProduct", "VendorCapabilityMapping"
    ).valid
