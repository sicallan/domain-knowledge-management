"""Structured-output (tool-use) schemas the pipeline hands the gateway.

These describe the *shape of the gateway response* (a list of entity/relationship records),
which is distinct from the canonical ``/schemas`` that validate the emitted ``data`` payloads.
They carry the ``title`` markers a gateway uses to tell which extraction stage is calling.
Item schemas are intentionally permissive (``additionalProperties: true``) so adding a new
inventory type needs no change here — the per-type prompt + canonical schema do the work (OCP).
"""

from __future__ import annotations

from typing import Any

from dkm_enrichment.gateway.base import ENTITY_RESULT_TITLE, RELATIONSHIP_RESULT_TITLE


def build_entity_result_schema(target_types: list[str]) -> dict[str, Any]:
    return {
        "title": ENTITY_RESULT_TITLE,
        "type": "object",
        "required": ["entities"],
        "properties": {
            "entities": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["type", "confidence"],
                    "additionalProperties": True,
                    "properties": {
                        "type": {"type": "string", "enum": list(target_types)},
                        "name": {"type": "string"},
                        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    },
                },
            }
        },
    }


def build_relationship_result_schema() -> dict[str, Any]:
    return {
        "title": RELATIONSHIP_RESULT_TITLE,
        "type": "object",
        "required": ["relationships"],
        "properties": {
            "relationships": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": [
                        "relationshipType",
                        "sourceEntityId",
                        "targetEntityId",
                        "confidence",
                    ],
                    "additionalProperties": True,
                    "properties": {
                        "relationshipType": {"type": "string"},
                        "sourceEntityId": {"type": "string"},
                        "targetEntityId": {"type": "string"},
                        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    },
                },
            }
        },
    }
