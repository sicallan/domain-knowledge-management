"""Coverage-claim normalisation to the locked ``{full, partial, none}`` vocabulary (D-P3.2).

The ``coverage`` value on a ``VendorCapabilityMapping`` is the costly-when-wrong signal — a false
"covered" turns a real hole green on the Coverage Map and corrupts build-vs-buy (D-P3.1). The
extractor prompt asks for the enum directly; this is the deterministic safety net that maps the
prose a model (or source) actually uses onto the one vocabulary the schema (3.1), the Coverage Map
(3.3) and the realisation predicate (D-P3.3) all share. An unrecognised value is **not** guessed —
:func:`normalise_coverage` returns ``None`` so the caller leaves the original in place and the
schema-validation gate rejects it (precision-first: never silently coerce ambiguity into coverage).
"""

from __future__ import annotations

from typing import Literal

Coverage = Literal["full", "partial", "none"]

# The locked enum (D-P3.2), 1:1 with spec 007's Coverage Map cell status (full→covered,
# partial→partial, none→uncovered). One vocabulary, no second coverage vocab anywhere.
COVERAGE_VALUES: tuple[Coverage, ...] = ("full", "partial", "none")

# Prose → enum. Order matters: "none"/"not" wins over a bare "cover" substring so that
# "not covered" resolves to ``none`` rather than ``full``.
_NONE_MARKERS = ("none", "not covered", "not supported", "no coverage", "unsupported", "no ")
_PARTIAL_MARKERS = ("partial", "partially", "some ", "limited")
_FULL_MARKERS = ("full", "fully", "complete", "comprehensive", "covered", "supported")


def normalise_coverage(raw: object) -> Coverage | None:
    """Map a raw coverage value onto the locked enum, or ``None`` if it is unrecognised."""

    if not isinstance(raw, str):
        return None
    text = raw.strip().lower()
    if not text:
        return None
    for value in COVERAGE_VALUES:
        if text == value:
            return value
    if any(marker in text for marker in _NONE_MARKERS):
        return "none"
    if any(marker in text for marker in _PARTIAL_MARKERS):
        return "partial"
    if any(marker in text for marker in _FULL_MARKERS):
        return "full"
    return None
