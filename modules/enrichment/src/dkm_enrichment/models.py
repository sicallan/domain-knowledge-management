"""Pydantic models mirroring the spec 005 / spec 003 TypeScript interfaces.

These are the Python realisation of the interface contracts (feature 02 §7). The JSONL
line shape (:class:`JsonlEntry`) is the spec 003 fixed core and is a **closed** contract.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

SourceAuthority = Literal["regulatory", "scheme", "vendor", "project", "operational"]
ContentType = Literal["markdown", "plaintext", "structured"]

# The L1 inventory types available in Phase 0a (each has a JSON Schema under /schemas).
PHASE_0A_L1_TYPES: tuple[str, ...] = (
    "DomainConcept",
    "Decision",
    "Rule",
    "BusinessInvariant",
    "BusinessCapability",
    "ReferenceData",
)

# The L3 behaviour types added by the Phase 2.2 behavioural pass (feature 02). Additive: these
# extend the available extraction ``targetTypes`` without modifying ``PHASE_0A_L1_TYPES`` (OCP).
# ``Decision`` is deliberately **not** here — it stays a structural target owned by Feature 03.
PHASE_2_BEHAVIOUR_TYPES: tuple[str, ...] = (
    "OrchestrationFlow",
    "OrchestrationStep",
    "Event",
    "StateTransition",
)

# The behavioural edge kinds (schemas/relationships/behavioural.schema.json, shipped in 2.1).
BEHAVIOURAL_RELATIONSHIP_TYPES: tuple[str, ...] = (
    "triggers",
    "emits",
    "consumes",
    "transitionsTo",
    "compensates",
    "invokes",
)

# The Decision inventory type — the highest-value node (Feature 03). Already a Phase 0a structural
# target (``PHASE_0A_L1_TYPES``); named here so the decision pass and its gate can reference it.
DECISION_TYPE = "Decision"

# The decision-specific edge kinds (schemas/relationships/decision-specific.schema.json, 2.1).
# Note ``consumes`` is shared with the behavioural set but is disambiguated at the emit gate by
# its endpoints (a decision ``consumes`` always has a Decision source → ReferenceData target).
DECISION_SPECIFIC_RELATIONSHIP_TYPES: tuple[str, ...] = (
    "evaluates",
    "consumes",
    "constrainedBy",
    "triggeredBy",
    "produces",
    "realizedBy",
)

RELATIONSHIP_TYPE = "Relationship"


# --------------------------------------------------------------------------- inputs


class DocumentSection(BaseModel):
    """A pre-identified logical section of a document (mirrors source-connectors)."""

    id: str
    title: str
    content: str
    startOffset: int = 0
    endOffset: int = 0
    level: int = 1


class CanonicalDocument(BaseModel):
    """The uniform representation every connector emits (spec 004).

    Mirrors ``modules/source-connectors/src/canonical-document.ts`` across the file
    boundary — the only coupling between the TS slice and this Python component.
    """

    model_config = ConfigDict(extra="ignore")

    id: str
    sourceType: str
    sourcePath: str
    sourceVersion: str
    fetchedAt: str
    sourceAuthority: SourceAuthority
    content: str
    contentType: ContentType = "markdown"
    structuredContent: dict[str, Any] | None = None
    title: str | None = None
    author: str | None = None
    lastModified: str | None = None
    tags: list[str] | None = None
    sections: list[DocumentSection] | None = None


# --------------------------------------------------------------------------- gateway


class LLMOptions(BaseModel):
    """Options for a single gateway call (spec 005 §LLM Gateway Interface)."""

    model: str = "claude-sonnet-4-6"
    temperature: float = 0.0
    maxTokens: int = 4096


class LLMUsage(BaseModel):
    inputTokens: int = 0
    outputTokens: int = 0


class LLMResponse(BaseModel):
    """A structured gateway response. ``result`` is the parsed JSON object."""

    result: dict[str, Any]
    usage: LLMUsage = Field(default_factory=LLMUsage)
    latency: float = 0.0
    modelUsed: str = "claude-sonnet-4-6"


# --------------------------------------------------------------------------- provenance


class SourceProvenance(BaseModel):
    """Spec 003 §SourceProvenance — where a JSONL entry was extracted from."""

    file: str
    location: str
    fetchedAt: str
    sourceAuthority: SourceAuthority


# --------------------------------------------------------------------------- JSONL core


class JsonlEntry(BaseModel):
    """Spec 003 fixed-core JSONL line. **Closed contract** — do not add required fields.

    ``data`` is the typed payload whose schema varies by ``type``:
    for inventory entries it validates against the matching ``/schemas`` type schema;
    for relationships (``type == "Relationship"``) it carries
    ``relationshipType`` / ``sourceEntityId`` / ``targetEntityId``.
    """

    id: str
    type: str
    version: str
    source: SourceProvenance
    confidence: float = Field(ge=0.0, le=1.0)
    extractedAt: str
    data: dict[str, Any]
    metadata: dict[str, Any] | None = None

    def to_jsonl(self) -> str:
        return self.model_dump_json(exclude_none=True)


# --------------------------------------------------------------------------- config / result


class ExtractionConfig(BaseModel):
    """Spec 005 §ExtractionConfig (+ Phase 1 escalation knobs, D-P1.1)."""

    targetTypes: list[str] = Field(default_factory=lambda: list(PHASE_0A_L1_TYPES))
    confidenceThreshold: float = 0.5
    entityResolution: bool = True
    model: str = "claude-sonnet-4-6"
    maxConcurrency: int = 4
    # Escalation (D-P1.1): on a re-run with ``escalate=True``, items below the
    # auto-merge band are re-extracted with ``escalateModel``.
    escalate: bool = False
    escalateModel: str = "claude-opus-4-8"
    autoMergeBand: float = 0.8
    # Chunking (spec 005 Decision 3).
    maxChunkChars: int = 12_000
    chunkOverlapChars: int = 800


class ExtractionStats(BaseModel):
    documentsProcessed: int = 0
    chunksProcessed: int = 0
    entitiesExtracted: int = 0
    relationshipsExtracted: int = 0
    entitiesResolved: int = 0
    validationFailures: int = 0
    belowThreshold: int = 0
    # D-P2.5: edges whose endpoint is unresolved (cross-pass placeholder, e.g. invokes → a
    # not-yet-extracted Decision) or whose endpoint types fail the behavioural/decision schema
    # are routed to the review queue and counted here — never committed as dangling edges.
    quarantined: int = 0
    # D-P2.2 + D-P2.5: committed Decisions that violate a Feature 01 cardinality/conditional rule
    # (evaluates≥1, produces≥1, automated⇒triggeredBy) are flagged to the review queue and counted
    # here — emitted but never auto-merged, never hard-dropped (the D-P1.5 two-tier model).
    cardinalityFlagged: int = 0
    averageConfidence: float = 0.0
    duration: float = 0.0


class ExtractionOutputFiles(BaseModel):
    extractions: str
    relationships: str
    metadata: str


class ExtractionRunResult(BaseModel):
    """Spec 005 §ExtractionRunResult."""

    runId: str
    outputFiles: ExtractionOutputFiles
    stats: ExtractionStats
    model: str = "claude-sonnet-4-6"
    escalated: bool = False


class ExtractionResult(BaseModel):
    """In-memory result of extracting a single document (for testing/debugging)."""

    documentId: str
    entities: list[JsonlEntry] = Field(default_factory=list)
    relationships: list[JsonlEntry] = Field(default_factory=list)
    stats: ExtractionStats = Field(default_factory=ExtractionStats)


# --------------------------------------------------------------------------- golden eval


class ExpectedEntity(BaseModel):
    type: str
    name: str


class ExpectedRelationship(BaseModel):
    relationshipType: str
    sourceName: str
    targetName: str


class GoldenDataset(BaseModel):
    """Spec 005 §Golden Dataset Format."""

    id: str
    name: str
    documents: list[CanonicalDocument]
    expectedEntities: list[ExpectedEntity]
    expectedRelationships: list[ExpectedRelationship] = Field(default_factory=list)


class TypeMetrics(BaseModel):
    precision: float
    recall: float
    f1: float
    support: int  # number of golden instances of this type


class CategoryMetrics(BaseModel):
    """Metrics for one category (entities or relationships)."""

    precision: float
    recall: float
    f1: float
    autoMergeBandPrecision: float  # precision over predictions with confidence >= band
    perType: dict[str, TypeMetrics] = Field(default_factory=dict)


class EvaluationMetrics(BaseModel):
    """Spec 005 §EvaluationMetrics, split per category (D-P1.5 gates each separately)."""

    entities: CategoryMetrics
    relationships: CategoryMetrics
    confidenceCalibration: float  # reported as a sanity signal; not a Phase 1 gate
