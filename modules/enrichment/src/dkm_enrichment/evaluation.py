"""Golden-dataset eval harness (spec 005 §Golden-dataset evals, feature 02 §6).

Runs the extraction pipeline against a labelled :class:`GoldenDataset` and scores
precision / recall / F1 — overall and per type — for entities and relationships
separately (D-P1.5 gates each category independently). The auto-merge-band precision
(precision over predictions whose ``confidence >= autoMergeBand``) is reported as the
strict graph-integrity gate; ``confidenceCalibration`` is a reported sanity signal, not
a gate.

Matching is conservative and deterministic: an entity matches a golden label iff it
shares a type and a normalised name (the same key entity-resolution uses). A relationship
matches iff its type and both endpoint *names* (resolved from the predicted entity ids)
match a golden triple. This harness is provider-agnostic — it scores whatever pipeline +
gateway it is handed, so the deterministic suite and the opt-in real-Claude eval share it.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING, Any

from dkm_enrichment.entity_resolution import normalise_name
from dkm_enrichment.models import (
    CanonicalDocument,
    CategoryMetrics,
    EvaluationMetrics,
    ExpectedEntity,
    ExpectedRelationship,
    ExtractionConfig,
    GoldenDataset,
    JsonlEntry,
    TypeMetrics,
)

if TYPE_CHECKING:
    from dkm_enrichment.pipeline import ExtractionPipeline


# --------------------------------------------------------------------------- dataset loading


def load_golden_dataset(directory: Path) -> GoldenDataset:
    """Load a golden dataset from ``<directory>/dataset.json`` + its ``documents/`` files.

    ``dataset.json`` carries the labels (``expectedEntities`` / ``expectedRelationships``)
    and document descriptors; each descriptor's ``file`` is read as the document content so
    the source text stays in plain Markdown under version control.
    """

    spec = json.loads((directory / "dataset.json").read_text(encoding="utf-8"))
    documents: list[CanonicalDocument] = []
    for descriptor in spec.get("documents", []):
        content = (directory / descriptor["file"]).read_text(encoding="utf-8")
        documents.append(
            CanonicalDocument(
                id=descriptor["id"],
                sourceType=descriptor.get("sourceType", "filesystem"),
                sourcePath=descriptor.get("sourcePath", descriptor["file"]),
                sourceVersion=descriptor.get("sourceVersion", "1"),
                fetchedAt=descriptor.get("fetchedAt", "2026-01-01T00:00:00.000Z"),
                sourceAuthority=descriptor.get("sourceAuthority", "scheme"),
                content=content,
                title=descriptor.get("title"),
            )
        )
    return GoldenDataset(
        id=spec["id"],
        name=spec["name"],
        documents=documents,
        expectedEntities=[ExpectedEntity(**e) for e in spec.get("expectedEntities", [])],
        expectedRelationships=[
            ExpectedRelationship(**r) for r in spec.get("expectedRelationships", [])
        ],
    )


# --------------------------------------------------------------------------- evaluation


async def evaluate_pipeline(
    pipeline: ExtractionPipeline,
    golden: GoldenDataset,
    config: ExtractionConfig,
) -> EvaluationMetrics:
    """Extract every golden document and score the predictions against the labels."""

    predicted_entities: list[JsonlEntry] = []
    predicted_relationships: list[JsonlEntry] = []
    for document in golden.documents:
        result = await pipeline.extract_single(document, config)
        predicted_entities.extend(result.entities)
        predicted_relationships.extend(result.relationships)

    entity_metrics = _score_entities(
        predicted_entities, golden.expectedEntities, config.autoMergeBand
    )
    relationship_metrics = _score_relationships(
        predicted_entities,
        predicted_relationships,
        golden.expectedRelationships,
        config.autoMergeBand,
    )
    calibration = _confidence_calibration(predicted_entities, golden.expectedEntities)
    return EvaluationMetrics(
        entities=entity_metrics,
        relationships=relationship_metrics,
        confidenceCalibration=calibration,
    )


# --------------------------------------------------------------------------- entity scoring


def _entity_key(type_name: str, name: str) -> tuple[str, str]:
    return (type_name, normalise_name(name))


def _score_entities(
    predicted: list[JsonlEntry],
    expected: list[ExpectedEntity],
    band: float,
) -> CategoryMetrics:
    gold = {_entity_key(e.type, e.name) for e in expected}
    pred_keys = {_entity_key(e.type, _entity_name(e)) for e in predicted}

    metrics = _prf(pred_keys, gold)
    band_keys = {
        _entity_key(e.type, _entity_name(e)) for e in predicted if e.confidence >= band
    }
    band_precision = _precision(band_keys, gold)

    per_type: dict[str, TypeMetrics] = {}
    for type_name in {key[0] for key in gold}:
        gold_t = {k for k in gold if k[0] == type_name}
        pred_t = {k for k in pred_keys if k[0] == type_name}
        prf = _prf(pred_t, gold_t)
        per_type[type_name] = TypeMetrics(
            precision=prf[0], recall=prf[1], f1=prf[2], support=len(gold_t)
        )

    return CategoryMetrics(
        precision=metrics[0],
        recall=metrics[1],
        f1=metrics[2],
        autoMergeBandPrecision=band_precision,
        perType=per_type,
    )


# ----------------------------------------------------------------- relationship scoring


def _score_relationships(
    predicted_entities: list[JsonlEntry],
    predicted_relationships: list[JsonlEntry],
    expected: list[ExpectedRelationship],
    band: float,
) -> CategoryMetrics:
    id_to_name = {e.id: _entity_name(e) for e in predicted_entities}

    gold = {
        (r.relationshipType, normalise_name(r.sourceName), normalise_name(r.targetName))
        for r in expected
    }
    pred_keys = {
        triple
        for triple in (_relationship_key(r, id_to_name) for r in predicted_relationships)
        if triple is not None
    }
    metrics = _prf(pred_keys, gold)

    band_keys = {
        triple
        for triple in (
            _relationship_key(r, id_to_name)
            for r in predicted_relationships
            if r.confidence >= band
        )
        if triple is not None
    }
    band_precision = _precision(band_keys, gold)

    per_type: dict[str, TypeMetrics] = {}
    for rel_type in {key[0] for key in gold}:
        gold_t = {k for k in gold if k[0] == rel_type}
        pred_t = {k for k in pred_keys if k[0] == rel_type}
        prf = _prf(pred_t, gold_t)
        per_type[rel_type] = TypeMetrics(
            precision=prf[0], recall=prf[1], f1=prf[2], support=len(gold_t)
        )

    return CategoryMetrics(
        precision=metrics[0],
        recall=metrics[1],
        f1=metrics[2],
        autoMergeBandPrecision=band_precision,
        perType=per_type,
    )


def _relationship_key(
    relationship: JsonlEntry, id_to_name: dict[str, str]
) -> tuple[str, str, str] | None:
    data = relationship.data
    rel_type = data.get("relationshipType")
    source_name = id_to_name.get(str(data.get("sourceEntityId")))
    target_name = id_to_name.get(str(data.get("targetEntityId")))
    if not isinstance(rel_type, str) or source_name is None or target_name is None:
        return None
    return (rel_type, normalise_name(source_name), normalise_name(target_name))


# --------------------------------------------------------------------------- metric maths


def _prf(predicted: set[Any], gold: set[Any]) -> tuple[float, float, float]:
    true_positives = len(predicted & gold)
    precision = true_positives / len(predicted) if predicted else 0.0
    recall = true_positives / len(gold) if gold else 0.0
    f1 = (
        2 * precision * recall / (precision + recall)
        if (precision + recall) > 0
        else 0.0
    )
    return (round(precision, 4), round(recall, 4), round(f1, 4))


def _precision(predicted: set[Any], gold: set[Any]) -> float:
    if not predicted:
        return 0.0
    return round(len(predicted & gold) / len(predicted), 4)


def _confidence_calibration(
    predicted: list[JsonlEntry], expected: list[ExpectedEntity]
) -> float:
    """Mean alignment of confidence with correctness (1 - mean abs error). Reported only."""

    if not predicted:
        return 0.0
    gold = {_entity_key(e.type, e.name) for e in expected}
    error = 0.0
    for entry in predicted:
        correct = 1.0 if _entity_key(entry.type, _entity_name(entry)) in gold else 0.0
        error += abs(entry.confidence - correct)
    return round(1.0 - error / len(predicted), 4)


def _entity_name(entry: JsonlEntry) -> str:
    data = entry.data
    for key in ("name", "statement", "expression"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return entry.id
