"""DKM enrichment — the Phase 1 LLM extraction pipeline (CanonicalDocument[] → JSONL).

Public surface: the pipeline orchestrator, its config/result models, and the LLM gateway
port. All inference flows through :class:`LLMGateway`; the pipeline stages are provider-agnostic
(D-P1.1). See ``docs/features/phase-1/02-llm-extraction-pipeline.md``.
"""

from dkm_enrichment.gateway import FakeGateway, LLMGateway
from dkm_enrichment.models import (
    CanonicalDocument,
    EvaluationMetrics,
    ExtractionConfig,
    ExtractionRunResult,
    GoldenDataset,
    JsonlEntry,
)
from dkm_enrichment.pipeline import ExtractionPipeline

__all__ = [
    "CanonicalDocument",
    "EvaluationMetrics",
    "ExtractionConfig",
    "ExtractionPipeline",
    "ExtractionRunResult",
    "FakeGateway",
    "GoldenDataset",
    "JsonlEntry",
    "LLMGateway",
]
