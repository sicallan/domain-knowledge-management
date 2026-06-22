"""Per-type entity-data normalisers — the pipeline's one generic post-build hook.

The extraction core (:meth:`ExtractionPipeline._build_entity`) is type-agnostic; where a type needs
its raw extracted payload tidied before the schema-validation gate, it registers a normaliser here
rather than adding a branch to the pipeline (OCP — open for new types, the core stays closed). A
type with no registered normaliser is passed through unchanged, so every prior pass's output is
byte-identical (the pass-isolation contract).

Today the only normaliser is the Phase 3.2 ``VendorCapabilityMapping`` coverage tidy (D-P3.2): map
the raw ``coverage`` prose onto the locked enum so the gate can trust it; leave an unrecognised
value in place so the gate rejects it (precision-first — never coerce ambiguity into a green cell).
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from dkm_enrichment.coverage import normalise_coverage
from dkm_enrichment.models import VENDOR_CAPABILITY_MAPPING_TYPE


def _normalise_vendor_capability_mapping(data: dict[str, Any]) -> dict[str, Any]:
    raw = data.get("coverage")
    normalised = normalise_coverage(raw)
    if normalised is not None:
        data["coverage"] = normalised
    return data


_ENTITY_NORMALISERS: dict[str, Callable[[dict[str, Any]], dict[str, Any]]] = {
    VENDOR_CAPABILITY_MAPPING_TYPE: _normalise_vendor_capability_mapping,
}


def normalise_entity_data(type_name: str, data: dict[str, Any]) -> dict[str, Any]:
    """Apply the type's registered normaliser (identity when none is registered)."""

    normaliser = _ENTITY_NORMALISERS.get(type_name)
    return normaliser(data) if normaliser is not None else data
