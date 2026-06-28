"""Structured-output (tool-use) schema for the LLM entity-resolution tier.

The adjudicator is handed a candidate cluster of same-type entity names and returns the subsets
that are genuinely the **same** concept, each with a canonical name. Distinct-but-similar names
(e.g. "Scope 1 Emissions" vs "Scope 2 Emissions", a "Policy" vs its "Guidelines") must be left in
separate groups — that judgement is exactly why this tier is an LLM and not string distance.
"""

from __future__ import annotations

from typing import Any

RESOLUTION_RESULT_TITLE = "EntityResolutionResult"


def build_resolution_result_schema() -> dict[str, Any]:
    return {
        "title": RESOLUTION_RESULT_TITLE,
        "type": "object",
        "required": ["groups"],
        "properties": {
            "groups": {
                "type": "array",
                "description": "Only groups of 2+ names that refer to the SAME concept.",
                "items": {
                    "type": "object",
                    "required": ["canonical", "members"],
                    "additionalProperties": True,
                    "properties": {
                        "canonical": {
                            "type": "string",
                            "description": "The clearest name to keep for the merged concept.",
                        },
                        "members": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Two or more input names that are the same concept.",
                        },
                    },
                },
            }
        },
    }
