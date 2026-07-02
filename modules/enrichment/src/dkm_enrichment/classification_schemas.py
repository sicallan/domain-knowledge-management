"""Structured-output (tool-use) schema for the Business-Architecture classification pass (#86).

The classifier is handed the curated reference spine (L1 domain → L2 capability) and a batch of raw
extracted capability names, and returns one verdict per name: either **placed** under a reference
node at an assigned tree level (2 = matches a curated capability, 3 = function, 4 = activity) or
**rejected** with a reason (a generic mention, a control, a policy, a duplicate, or not a capability
at all). This is the schema of that structured reply; the pass turns each verdict into a
first-class ``CapabilityClassification`` :class:`~dkm_enrichment.models.JsonlEntry` the projector
reads (ADR-0009).

The placement/rejection field conventions (``assignedParent`` + ``assignedLevel`` when placed,
``rejectionReason`` when rejected) are guidance to the model here and enforced by the pass + the
projector — mirroring the deliberately-loose ``capability-classification.schema.json`` so the first
cut stays additive.
"""

from __future__ import annotations

from typing import Any

CLASSIFICATION_RESULT_TITLE = "CapabilityClassificationResult"

REJECTION_REASONS = ["generic-mention", "control", "policy", "duplicate", "not-a-capability"]


def build_classification_result_schema() -> dict[str, Any]:
    return {
        "title": CLASSIFICATION_RESULT_TITLE,
        "type": "object",
        "required": ["classifications"],
        "properties": {
            "classifications": {
                "type": "array",
                "description": "One verdict per raw capability name given (place it or reject it).",
                "items": {
                    "type": "object",
                    "required": ["subject", "disposition", "rationale"],
                    "additionalProperties": True,
                    "properties": {
                        "subject": {
                            "type": "string",
                            "description": "The raw capability name, echoed exactly as given.",
                        },
                        "disposition": {
                            "type": "string",
                            "enum": ["placed", "rejected"],
                            "description": "placed = belongs in the EA tree; rejected = not a "
                            "genuine capability.",
                        },
                        "assignedParent": {
                            "type": "string",
                            "description": "When placed: the ReferenceCapability name it sits "
                            "under (an L2 capability, or another placed capability for L4).",
                        },
                        "assignedLevel": {
                            "type": "integer",
                            "minimum": 2,
                            "maximum": 4,
                            "description": "When placed: 2 = matches a curated capability, "
                            "3 = business function, 4 = business activity.",
                        },
                        "rejectionReason": {
                            "type": "string",
                            "enum": REJECTION_REASONS,
                            "description": "When rejected: why this is not a placed capability.",
                        },
                        "rationale": {
                            "type": "string",
                            "description": "A one-line justification (always present).",
                        },
                        "confidence": {
                            "type": "number",
                            "minimum": 0,
                            "maximum": 1,
                            "description": "The classifier's certainty in this verdict (0–1).",
                        },
                    },
                },
            }
        },
    }
