"""Stage 5: confidence scoring + the confidence gate (spec 005 §Confidence Scoring).

Confidence combines the model's self-assessment with source authority and schema
completeness. The function is deterministic so the eval's confidence-calibration signal is
reproducible. The **gate** is kept separate from scoring so it can be tested in isolation
(feature 02 acceptance criterion 4): below-threshold items are excluded *and counted*, never
silently dropped.
"""

from __future__ import annotations

from dkm_enrichment.models import SourceAuthority

# Higher-authority sources yield higher confidence (spec 005 §Confidence Scoring).
_AUTHORITY_WEIGHT: dict[SourceAuthority, float] = {
    "regulatory": 1.00,
    "scheme": 0.97,
    "vendor": 0.90,
    "project": 0.85,
    "operational": 0.80,
}


def score_confidence(
    model_confidence: float,
    *,
    source_authority: SourceAuthority,
    completeness: float = 0.5,
) -> float:
    """Combine model self-confidence, source authority, and schema completeness into [0, 1].

    ``model_confidence`` dominates; authority scales it; completeness nudges it slightly. With a
    ``regulatory`` source and average completeness the result is ~the model's own confidence,
    keeping the score interpretable.
    """

    weight = _AUTHORITY_WEIGHT.get(source_authority, 0.85)
    base = _clamp(model_confidence) * weight
    nudge = 0.05 * (_clamp(completeness) - 0.5)
    return round(_clamp(base + nudge), 4)


def field_completeness(data: dict[str, object], optional_fields: list[str]) -> float:
    """Fraction of the schema's optional fields that are populated (0.5 if none defined)."""

    if not optional_fields:
        return 0.5
    filled = sum(1 for f in optional_fields if _is_present(data.get(f)))
    return filled / len(optional_fields)


def passes_gate(confidence: float, threshold: float) -> bool:
    """A confidence at or above the threshold is emitted; below it is excluded (criterion 4)."""

    return confidence >= threshold


def _is_present(value: object) -> bool:
    if value is None:
        return False
    return not (isinstance(value, str | list | dict) and len(value) == 0)


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, value))
