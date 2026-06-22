"""Integration — vendor/project docs → both JSONL files, schema-valid (feature 02 §8, crit. 1-4,9).

Drives a vendor-datasheet + project-spec fixture through the full ``run`` and validates every
emitted line against the canonical ``/schemas``: L2 entities against their type schema, the
``fulfils`` / ``specifies`` edges against the intermediate relationship shape with endpoint types
that satisfy
``schemas/relationships/l2-structural.schema.json``. It also proves the D-P3.7 contract — the pass
emits the thin ``fulfils`` edge **and** the graded ``VendorCapabilityMapping`` together — and the
D-P3.2 coverage normalisation (prose ``"fully supports"`` → the locked enum ``full``).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from dkm_enrichment.emission import read_jsonl
from dkm_enrichment.gateway.fake import FakeGateway
from dkm_enrichment.models import (
    L2_STRUCTURAL_RELATIONSHIP_TYPES,
    CanonicalDocument,
    DocumentSection,
    ExtractionConfig,
)
from dkm_enrichment.pipeline import ExtractionPipeline
from dkm_enrichment.schema_validation import SchemaValidator

from .conftest import scripted_router, vendor_targets

_DOC_ID = "doc-vendor-e2e"


def _document() -> CanonicalDocument:
    return CanonicalDocument(
        id=_DOC_ID,
        sourceType="filesystem",
        sourcePath="vendors/acme-datasheet.md",
        sourceVersion="1",
        fetchedAt="2026-01-01T00:00:00.000Z",
        sourceAuthority="vendor",
        content="(sections carry the content)",
        title="Acme Pay datasheet + authorisation design",
        sections=[
            DocumentSection(id="s1", title="Acme Pay Datasheet", content="content"),
            DocumentSection(id="s2", title="Authorisation Design", content="content"),
        ],
    )


def _script() -> dict[str, dict[str, dict[str, Any]]]:
    return {
        _DOC_ID: {
            "Acme Pay Datasheet": {
                "entities": [
                    {"type": "VendorProduct", "name": "Acme Pay Gateway", "vendor": "Acme",
                     "productVersion": "4.2",
                     "capabilityClaims": ["Acme Card Authorisation", "3-D Secure"],
                     "confidence": 0.9},
                    {"type": "BusinessCapability", "name": "Accept Card Payments",
                     "description": "Take card payments from customers.", "confidence": 0.9},
                    {"type": "VendorCapabilityMapping",
                     "vendorCapability": "Acme Card Authorisation",
                     "mappedConcept": {"targetType": "BusinessCapability",
                                       "targetId": "Accept Card Payments"},
                     # Prose, not the enum — normalisation must map it to ``full`` (D-P3.2).
                     "coverage": "fully supports", "coveragePercentage": 100,
                     "confidence": 0.88},
                ],
                "relationships": [
                    {"type": "fulfils", "source": "Acme Pay Gateway",
                     "target": "Accept Card Payments", "confidence": 0.85},
                ],
            },
            "Authorisation Design": {
                "entities": [
                    {"type": "ProjectSpec", "name": "Authorisation Hardening",
                     "specType": "design", "status": "approved",
                     "addressedConcepts": ["Authorisation"], "confidence": 0.9},
                    {"type": "DomainConcept", "name": "Authorisation",
                     "conceptType": "aggregate", "confidence": 0.9},
                ],
                "relationships": [
                    {"type": "specifies", "source": "Authorisation Hardening",
                     "target": "Authorisation", "confidence": 0.82},
                ],
            },
        }
    }


async def _run(tmp_path: Path) -> tuple[Any, list[dict[str, Any]], list[dict[str, Any]]]:
    pipeline = ExtractionPipeline(FakeGateway(router=scripted_router(_script())))
    result = await pipeline.run(
        [_document()], ExtractionConfig(targetTypes=vendor_targets()), tmp_path
    )
    entities = read_jsonl(Path(result.outputFiles.extractions))
    relationships = read_jsonl(Path(result.outputFiles.relationships))
    return result, entities, relationships


async def test_vendor_pass_emits_only_schema_valid_lines(tmp_path: Path) -> None:
    result, entities, relationships = await _run(tmp_path)
    validator = SchemaValidator()

    assert entities and relationships
    types = {e["type"] for e in entities}
    assert {"VendorProduct", "VendorCapabilityMapping", "ProjectSpec"} <= types

    by_id_type: dict[str, str] = {}
    for line in entities:
        outcome = validator.validate_data(line["type"], line["data"])
        assert outcome.valid, f"{line['type']} invalid: {outcome.error}"
        by_id_type[line["id"]] = line["type"]

    emitted_ids = set(by_id_type)
    for line in relationships:
        assert line["type"] == "Relationship"
        data = line["data"]
        assert validator.validate_entry("Relationship", data).valid
        assert data["sourceEntityId"] in emitted_ids
        assert data["targetEntityId"] in emitted_ids
        if data["relationshipType"] in L2_STRUCTURAL_RELATIONSHIP_TYPES:
            endpoint = validator.validate_l2_structural_relationship(
                data["relationshipType"],
                by_id_type[data["sourceEntityId"]],
                by_id_type[data["targetEntityId"]],
            )
            assert endpoint.valid, (data["relationshipType"], endpoint.error)

    assert result.stats.quarantined == 0


async def test_vendor_product_carries_claims_and_distinct_versions(tmp_path: Path) -> None:
    _, entities, _ = await _run(tmp_path)
    product = next(e for e in entities if e["type"] == "VendorProduct")
    assert product["data"]["name"] == "Acme Pay Gateway"
    assert product["data"]["vendor"] == "Acme"
    # ``productVersion`` (the vendor's) is distinct from base-entry ``version`` (D-P3.5).
    assert product["data"]["productVersion"] == "4.2"
    assert product["data"]["version"] == "1.0.0"
    assert "Acme Card Authorisation" in product["data"]["capabilityClaims"]


async def test_mapping_normalises_coverage_and_keeps_typed_concept(tmp_path: Path) -> None:
    _, entities, _ = await _run(tmp_path)
    mapping = next(e for e in entities if e["type"] == "VendorCapabilityMapping")
    # Criterion 2 + D-P3.2: prose coverage is normalised to the locked enum before emit.
    assert mapping["data"]["coverage"] == "full"
    assert mapping["data"]["coveragePercentage"] == 100
    assert mapping["data"]["mappedConcept"] == {
        "targetType": "BusinessCapability",
        "targetId": "Accept Card Payments",
    }


async def test_fulfils_pairs_with_a_graded_mapping(tmp_path: Path) -> None:
    # D-P3.7: a bare fulfils is degenerate; the pass emits the thin edge AND the rich mapping node.
    _, entities, relationships = await _run(tmp_path)
    fulfils = [r for r in relationships if r["data"]["relationshipType"] == "fulfils"]
    assert len(fulfils) == 1
    assert any(e["type"] == "VendorCapabilityMapping" for e in entities)


async def test_project_spec_emits_specifies_to_domain_concept(tmp_path: Path) -> None:
    _, entities, relationships = await _run(tmp_path)
    spec = next(e for e in entities if e["type"] == "ProjectSpec")
    assert spec["data"]["specType"] == "design"
    assert spec["data"]["status"] == "approved"
    specifies = [r for r in relationships if r["data"]["relationshipType"] == "specifies"]
    assert len(specifies) == 1


async def test_every_l2_record_is_evidenced_and_versioned(tmp_path: Path) -> None:
    # Criterion 9 / CLAUDE.md conventions: every asserted fact is evidenced + temporal.
    _, entities, _ = await _run(tmp_path)
    l2 = [e for e in entities
          if e["type"] in {"VendorProduct", "VendorCapabilityMapping", "ProjectSpec"}]
    assert l2
    for entry in l2:
        assert entry["data"]["evidencedBy"]
        assert entry["data"]["version"]
        assert entry["data"]["validFrom"]
        assert entry["source"]["sourceAuthority"] == "vendor"
