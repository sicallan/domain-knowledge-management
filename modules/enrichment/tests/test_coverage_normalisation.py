"""Unit — coverage-claim normalisation to the locked vocabulary (feature 02 §8; D-P3.2).

`coverage` on a ``VendorCapabilityMapping`` is the expensive-when-wrong signal, so its value is
normalised to the locked enum ``{full, partial, none}`` (D-P3.2) before the schema-validation gate.
Recognised prose ("fully supports", "partially") maps onto the enum; an unrecognised value is left
untouched so the schema gate rejects it (precision-first: never silently coerce a hole to green).
"""

from __future__ import annotations

import pytest

from dkm_enrichment.coverage import COVERAGE_VALUES, normalise_coverage


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("full", "full"),
        ("Full", "full"),
        ("FULLY SUPPORTS", "full"),
        ("fully supported", "full"),
        ("complete", "full"),
        ("partial", "partial"),
        ("Partially", "partial"),
        ("partially supported", "partial"),
        ("none", "none"),
        ("not covered", "none"),
        ("no coverage", "none"),
        ("  full  ", "full"),
    ],
)
def test_recognised_prose_maps_to_enum(raw: str, expected: str) -> None:
    assert normalise_coverage(raw) == expected


@pytest.mark.parametrize("raw", ["mostly", "tbd", "", "42", None, 0.8])
def test_unrecognised_value_is_left_unmapped(raw: object) -> None:
    # Returns None so the caller leaves the original in place and the schema gate rejects it —
    # never coerce an ambiguous claim into a green cell (D-P3.1 precision-first).
    assert normalise_coverage(raw) is None


def test_enum_matches_the_locked_vocabulary() -> None:
    assert COVERAGE_VALUES == ("full", "partial", "none")
