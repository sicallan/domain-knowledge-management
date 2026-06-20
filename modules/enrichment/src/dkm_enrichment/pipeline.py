"""The extraction pipeline orchestrator (spec 005 §Pipeline Stages, feature 02).

Wires the seven stages together: pre-process/chunk → entity extract → relationship extract →
entity resolution → confidence scoring → confidence gate → schema-validation gate → streaming
JSONL emission. All inference goes through the injected :class:`LLMGateway`; the orchestrator
itself is provider-agnostic. The ``ExtractionPipeline`` / ``LLMGateway`` signatures are a
**closed** contract — new behaviour arrives via new gateways, prompt templates, or resolution
tiers, never by editing these stages.
"""

from __future__ import annotations

import json
import logging
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from dkm_enrichment.chunking import Chunk, chunk_document
from dkm_enrichment.confidence import field_completeness, passes_gate, score_confidence
from dkm_enrichment.emission import JsonlWriter
from dkm_enrichment.entity_resolution import remap_relationship, resolve_entities
from dkm_enrichment.extraction_schemas import (
    build_entity_result_schema,
    build_relationship_result_schema,
)
from dkm_enrichment.gateway.base import LLMGateway
from dkm_enrichment.models import (
    BEHAVIOURAL_RELATIONSHIP_TYPES,
    PHASE_2_BEHAVIOUR_TYPES,
    RELATIONSHIP_TYPE,
    CanonicalDocument,
    ExtractionConfig,
    ExtractionOutputFiles,
    ExtractionResult,
    ExtractionRunResult,
    ExtractionStats,
    JsonlEntry,
    LLMOptions,
    LLMUsage,
    SourceProvenance,
)
from dkm_enrichment.prompts import PromptLibrary
from dkm_enrichment.schema_validation import SchemaValidator

logger = logging.getLogger(__name__)

ENTRY_VERSION = "1.0.0"
_META_FIELDS = {"type", "confidence"}


class ExtractionPipeline:
    """Transforms ``CanonicalDocument[]`` into schema-valid intermediate JSONL."""

    def __init__(
        self,
        gateway: LLMGateway,
        *,
        validator: SchemaValidator | None = None,
        prompts: PromptLibrary | None = None,
    ) -> None:
        self._gateway = gateway
        self._validator = validator or SchemaValidator()
        self._prompts = prompts or PromptLibrary()

    # ------------------------------------------------------------------ public API

    async def extract_single(
        self, document: CanonicalDocument, config: ExtractionConfig
    ) -> ExtractionResult:
        """Extract one document into memory (for testing/debugging) — no files written."""

        options = self._options(config)
        entities, relationships, chunk_count, _usage = await self._extract_document(
            document, config, options
        )
        if config.entityResolution:
            resolution = resolve_entities(entities)
            entities = resolution.entities
            relationships = [
                remap_relationship(r, resolution.id_remap) for r in relationships
            ]
        stats = ExtractionStats(
            documentsProcessed=1,
            chunksProcessed=chunk_count,
            entitiesExtracted=len(entities),
            relationshipsExtracted=len(relationships),
        )
        return ExtractionResult(
            documentId=document.id,
            entities=entities,
            relationships=relationships,
            stats=stats,
        )

    async def run(
        self,
        documents: list[CanonicalDocument],
        config: ExtractionConfig,
        output_dir: Path,
    ) -> ExtractionRunResult:
        """Execute a full run, streaming validated entries to immutable JSONL files."""

        started = time.monotonic()
        run_id = f"run-{uuid4().hex[:12]}"
        options = self._options(config)
        model = options.model

        all_entities: list[JsonlEntry] = []
        all_relationships: list[JsonlEntry] = []
        chunks_total = 0
        usage = LLMUsage()
        for document in documents:
            entities, relationships, chunk_count, doc_usage = await self._extract_document(
                document, config, options
            )
            all_entities.extend(entities)
            all_relationships.extend(relationships)
            chunks_total += chunk_count
            usage.inputTokens += doc_usage.inputTokens
            usage.outputTokens += doc_usage.outputTokens

        merged_count = 0
        if config.entityResolution:
            resolution = resolve_entities(all_entities)
            all_entities = resolution.entities
            all_relationships = [
                remap_relationship(r, resolution.id_remap) for r in all_relationships
            ]
            merged_count = resolution.merged_count

        return self._emit(
            run_id=run_id,
            documents=documents,
            entities=all_entities,
            relationships=all_relationships,
            config=config,
            output_dir=output_dir,
            model=model,
            chunks_total=chunks_total,
            merged_count=merged_count,
            usage=usage,
            duration=time.monotonic() - started,
        )

    async def evaluate(
        self, golden: GoldenDataset, config: ExtractionConfig
    ) -> EvaluationMetrics:
        """Run against a golden dataset and score precision/recall/F1 (delegates to harness)."""

        from dkm_enrichment.evaluation import evaluate_pipeline

        return await evaluate_pipeline(self, golden, config)

    # ------------------------------------------------------------------ stages

    async def _extract_document(
        self, document: CanonicalDocument, config: ExtractionConfig, options: LLMOptions
    ) -> tuple[list[JsonlEntry], list[JsonlEntry], int, LLMUsage]:
        entity_schema = build_entity_result_schema(config.targetTypes)
        relationship_schema = build_relationship_result_schema()
        chunks = chunk_document(
            document,
            max_chars=config.maxChunkChars,
            overlap_chars=config.chunkOverlapChars,
        )
        entities: list[JsonlEntry] = []
        relationships: list[JsonlEntry] = []
        usage = LLMUsage()

        for chunk in chunks:
            entity_prompt = self._prompts.build_entity_prompt(chunk, config.targetTypes)
            entity_response = await self._gateway.extract_structured(
                entity_prompt, entity_schema, options
            )
            usage.inputTokens += entity_response.usage.inputTokens
            usage.outputTokens += entity_response.usage.outputTokens
            built_entities = [
                self._build_entity(item, chunk, document, config)
                for item in _items(entity_response.result, "entities")
            ]
            chunk_entities = [e for e in built_entities if e is not None]
            entities.extend(chunk_entities)

            relationship_prompt = self._prompts.build_relationship_prompt(chunk, chunk_entities)
            relationship_response = await self._gateway.extract_structured(
                relationship_prompt, relationship_schema, options
            )
            usage.inputTokens += relationship_response.usage.inputTokens
            usage.outputTokens += relationship_response.usage.outputTokens
            valid_ids = {e.id for e in chunk_entities}
            for item in _items(relationship_response.result, "relationships"):
                built = self._build_relationship(item, chunk, document, valid_ids)
                if built is not None:
                    relationships.append(built)

        return entities, relationships, len(chunks), usage

    def _build_entity(
        self,
        item: dict[str, Any],
        chunk: Chunk,
        document: CanonicalDocument,
        config: ExtractionConfig,
    ) -> JsonlEntry | None:
        type_name = item.get("type")
        if not isinstance(type_name, str) or type_name not in config.targetTypes:
            return None
        entry_id = str(uuid4())
        now = _now_iso()
        evidence = {
            "source": document.sourcePath,
            "location": chunk.location,
            "fetchedAt": document.fetchedAt,
            "sourceAuthority": document.sourceAuthority,
        }
        data: dict[str, Any] = {k: v for k, v in item.items() if k not in _META_FIELDS}
        data.update(
            {
                "id": entry_id,
                "type": type_name,
                "version": ENTRY_VERSION,
                "lifecycle_status": data.get("lifecycle_status", "draft"),
                "evidencedBy": [evidence],
                "validFrom": data.get("validFrom", now),
            }
        )
        model_confidence = _as_float(item.get("confidence"), default=0.5)
        completeness = field_completeness(data, self._validator_optional_fields(type_name))
        confidence = score_confidence(
            model_confidence,
            source_authority=document.sourceAuthority,
            completeness=completeness,
        )
        return JsonlEntry(
            id=entry_id,
            type=type_name,
            version=ENTRY_VERSION,
            source=_provenance(document, chunk),
            confidence=confidence,
            extractedAt=now,
            data=data,
            metadata={"chunk": chunk.id, "modelConfidence": model_confidence},
        )

    def _build_relationship(
        self,
        item: dict[str, Any],
        chunk: Chunk,
        document: CanonicalDocument,
        valid_ids: set[str],
    ) -> JsonlEntry | None:
        rel_type = item.get("relationshipType")
        source_id = item.get("sourceEntityId")
        target_id = item.get("targetEntityId")
        if not all(isinstance(v, str) and v for v in (rel_type, source_id, target_id)):
            return None
        if source_id not in valid_ids or target_id not in valid_ids or source_id == target_id:
            return None
        now = _now_iso()
        model_confidence = _as_float(item.get("confidence"), default=0.5)
        confidence = score_confidence(
            model_confidence,
            source_authority=document.sourceAuthority,
            completeness=1.0,
        )
        data = {
            "relationshipType": rel_type,
            "sourceEntityId": source_id,
            "targetEntityId": target_id,
            "metadata": item.get("metadata", {}),
        }
        return JsonlEntry(
            id=str(uuid4()),
            type=RELATIONSHIP_TYPE,
            version=ENTRY_VERSION,
            source=_provenance(document, chunk),
            confidence=confidence,
            extractedAt=now,
            data=data,
            metadata={"chunk": chunk.id, "modelConfidence": model_confidence},
        )

    def _emit(
        self,
        *,
        run_id: str,
        documents: list[CanonicalDocument],
        entities: list[JsonlEntry],
        relationships: list[JsonlEntry],
        config: ExtractionConfig,
        output_dir: Path,
        model: str,
        chunks_total: int,
        merged_count: int,
        usage: LLMUsage,
        duration: float,
    ) -> ExtractionRunResult:
        output_dir.mkdir(parents=True, exist_ok=True)
        extractions_path = output_dir / f"{run_id}-extractions.jsonl"
        relationships_path = output_dir / f"{run_id}-relationships.jsonl"
        metadata_path = output_dir / f"{run_id}-metadata.json"

        stats = ExtractionStats(
            documentsProcessed=len(documents),
            chunksProcessed=chunks_total,
            entitiesResolved=merged_count,
        )
        confidences: list[float] = []
        emitted_ids: set[str] = set()
        # Endpoint-type lookup spans *all* built entities (including those the gates below
        # exclude), so a behavioural edge can tell a wrong-typed endpoint apart from a
        # cross-pass placeholder that was extracted but not committed.
        entity_type_by_id = {entry.id: entry.type for entry in entities}

        with JsonlWriter(extractions_path) as writer:
            for entry in entities:
                if not passes_gate(entry.confidence, config.confidenceThreshold):
                    stats.belowThreshold += 1
                    logger.info(
                        "Excluded below-threshold entity %s (%.3f)",
                        entry.id,
                        entry.confidence,
                    )
                    continue
                outcome = self._validator.validate_entry(entry.type, entry.data)
                if not outcome.valid:
                    stats.validationFailures += 1
                    logger.warning(
                        "Schema-invalid entity %s excluded: %s", entry.id, outcome.error
                    )
                    continue
                writer.write(entry)
                emitted_ids.add(entry.id)
                stats.entitiesExtracted += 1
                confidences.append(entry.confidence)

        with JsonlWriter(relationships_path) as writer:
            for entry in relationships:
                rel_type = str(entry.data.get("relationshipType", ""))
                source_id = str(entry.data.get("sourceEntityId", ""))
                target_id = str(entry.data.get("targetEntityId", ""))
                source_type = entity_type_by_id.get(source_id)
                target_type = entity_type_by_id.get(target_id)

                # An edge is governed by the behavioural endpoint gate only when it is a
                # behavioural relationshipType *and* at least one endpoint is a Phase 2
                # behaviour entity. This keeps the overloaded `consumes` (Phase 1's
                # Decision → ReferenceData) on the structural path, untouched.
                if rel_type in BEHAVIOURAL_RELATIONSHIP_TYPES and (
                    source_type in PHASE_2_BEHAVIOUR_TYPES
                    or target_type in PHASE_2_BEHAVIOUR_TYPES
                ):
                    # D-P2.5: quarantine (never commit as a dangling edge) when an endpoint is
                    # not committed — e.g. invokes → a not-yet-extracted Decision placeholder —
                    # or when the endpoint *types* violate behavioural.schema.json. (Both
                    # endpoints being committed guarantees their types are non-None here.)
                    endpoints_committed = (
                        source_id in emitted_ids and target_id in emitted_ids
                    )
                    if not endpoints_committed or not (
                        self._validator.validate_behavioural_relationship(
                            rel_type, source_type or "", target_type or ""
                        ).valid
                    ):
                        stats.quarantined += 1
                        logger.info(
                            "Quarantined behavioural relationship %s (%s)", entry.id, rel_type
                        )
                        continue
                elif source_id not in emitted_ids or target_id not in emitted_ids:
                    stats.validationFailures += 1
                    logger.info("Relationship %s dropped: endpoint not emitted", entry.id)
                    continue
                if not passes_gate(entry.confidence, config.confidenceThreshold):
                    stats.belowThreshold += 1
                    continue
                outcome = self._validator.validate_entry(RELATIONSHIP_TYPE, entry.data)
                if not outcome.valid:
                    stats.validationFailures += 1
                    logger.warning(
                        "Invalid relationship %s excluded: %s", entry.id, outcome.error
                    )
                    continue
                writer.write(entry)
                stats.relationshipsExtracted += 1
                confidences.append(entry.confidence)

        stats.averageConfidence = (
            round(sum(confidences) / len(confidences), 4) if confidences else 0.0
        )
        stats.duration = round(duration, 4)

        metadata = {
            "runId": run_id,
            "model": model,
            "escalated": config.escalate,
            "promptVersions": self._prompts.prompt_versions(),
            "config": config.model_dump(),
            "stats": stats.model_dump(),
            "usage": usage.model_dump(),
            "createdAt": _now_iso(),
        }
        metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

        return ExtractionRunResult(
            runId=run_id,
            outputFiles=ExtractionOutputFiles(
                extractions=str(extractions_path),
                relationships=str(relationships_path),
                metadata=str(metadata_path),
            ),
            stats=stats,
            model=model,
            escalated=config.escalate,
        )

    # ------------------------------------------------------------------ helpers

    def _options(self, config: ExtractionConfig) -> LLMOptions:
        model = config.escalateModel if config.escalate else config.model
        return LLMOptions(model=model)

    def _validator_optional_fields(self, type_name: str) -> list[str]:
        return self._validator.optional_fields(type_name)


def _provenance(document: CanonicalDocument, chunk: Chunk) -> SourceProvenance:
    return SourceProvenance(
        file=document.sourcePath,
        location=chunk.location,
        fetchedAt=document.fetchedAt,
        sourceAuthority=document.sourceAuthority,
    )


def _items(result: dict[str, Any], key: str) -> list[dict[str, Any]]:
    value = result.get(key, [])
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _as_float(value: Any, *, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


# Imported lazily-referenced types for annotations only.
from dkm_enrichment.models import EvaluationMetrics, GoldenDataset  # noqa: E402
