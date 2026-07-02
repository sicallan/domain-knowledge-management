"""The Business-Architecture classification pass (Feature 08, #86 — ADR-0009).

The raw Capability Map is faithful but unusable as navigation (222 near-synonym roots, controls and
implementation detail promoted to top level). This pass normalises it: each raw
``BusinessCapability`` is classified against a **curated ``ReferenceCapability`` spine** (L1
enterprise domain → L2
capability) — either *placed* beneath a reference node at an assigned tree level (2 capability /
3 function / 4 activity) or *rejected* with a reason — and one first-class
``CapabilityClassification`` is emitted per capability.

This is the direct analogue of the ``normalise`` pass (:mod:`llm_resolution`): a batch LLM judgment
run through the :class:`LLMGateway` port (so the ``FakeGateway`` exercises it in CI with no key),
producing a reviewable, diffable JSONL artifact. The **judgment** is materialised here; the EA tree
is a deterministic projection over (spine + these classifications) — ADR-0008/0009. The pass never
rewrites the raw graph (layer-alongside): "Vanguard Investor Choice" is not deleted, it is
*classified* as a rejected generic mention, and that classification can be disagreed with.

Ids are deterministic (``cls-<subject-id>``) so a re-run overwrites rather than duplicates, and the
CLI feeds already-classified subject ids back in as ``already_classified`` — so the pass is
**incremental**: ingest a doc, extract N new capabilities, classify only those N.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from dkm_enrichment.classification_schemas import build_classification_result_schema
from dkm_enrichment.entity_resolution import entity_name
from dkm_enrichment.gateway.base import LLMGateway
from dkm_enrichment.models import JsonlEntry, LLMOptions, SourceProvenance

CLASSIFICATION_TYPE = "CapabilityClassification"
BUSINESS_CAPABILITY_TYPE = "BusinessCapability"
_VALID_DISPOSITIONS = frozenset({"placed", "rejected"})
_DEFAULT_CONFIDENCE = 0.5
# Bound the prompt: the spine is small and rides every call, so batch the raw capabilities.
_DEFAULT_BATCH_SIZE = 40


def _now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _spine_outline(spine: list[JsonlEntry]) -> str:
    """Render the curated spine as an ``L1 domain → its L2 capabilities`` outline for the prompt."""

    by_name = {entity_name(r): r for r in spine}
    domains = [r for r in spine if _level(r) == 1]
    children: dict[str, list[str]] = defaultdict(list)
    for r in spine:
        if _level(r) != 2:
            continue
        parent = r.data.get("parent")
        if isinstance(parent, str) and parent in by_name:
            children[parent].append(entity_name(r))
    lines: list[str] = []
    for domain in sorted(domains, key=entity_name):
        name = entity_name(domain)
        lines.append(f"- {name}")
        for capability in sorted(children.get(name, [])):
            lines.append(f"    - {capability}")
    return "\n".join(lines)


def _level(entry: JsonlEntry) -> int | None:
    value = entry.data.get("level")
    return value if isinstance(value, int) else None


def build_classification_prompt(spine: list[JsonlEntry], names: list[str]) -> str:
    """Ask the model to normalise raw capabilities into the curated spine (precision-first)."""

    outline = _spine_outline(spine)
    listing = "\n".join(f"- {name}" for name in names)
    return (
        "You are a business architect (BIZBOK / APQC) normalising a messy extracted capability "
        "catalogue into a curated reference architecture.\n\n"
        "Here is the curated reference spine — enterprise domains (L1) and their capabilities "
        "(L2):\n\n"
        f"{outline}\n\n"
        "Classify EACH of the raw extracted names below into that spine. For each name return one "
        "verdict:\n"
        "- PLACED: it is a genuine capability. Give the reference capability it belongs under "
        "(`assignedParent`) and its level: 2 if it essentially IS one of the curated L2 "
        "capabilities, 3 if it is a business function beneath one, 4 if it is a business "
        "activity.\n"
        "- REJECTED: it is NOT a standalone capability. Use `rejectionReason`: `generic-mention` "
        "(a brand/product/industry mention like 'Vanguard Investor Choice'), `control`, `policy`, "
        "`duplicate`, or `not-a-capability`.\n\n"
        "Always give a one-line `rationale`. Prefer placing genuine capabilities over rejecting "
        "them, but reject implementation detail, controls, and policies rather than promoting "
        "them.\n\n"
        f"Raw names to classify:\n{listing}"
    )


def _coerce_confidence(value: Any) -> float:
    if isinstance(value, int | float):
        return max(0.0, min(1.0, float(value)))
    return _DEFAULT_CONFIDENCE


def _classification_data(record: dict[str, Any], subject_id: str) -> dict[str, Any] | None:
    """Build the projector-shaped ``data`` payload from one model verdict (``None`` if invalid)."""

    disposition = record.get("disposition")
    rationale = record.get("rationale")
    if disposition not in _VALID_DISPOSITIONS or not isinstance(rationale, str) or not rationale:
        return None
    data: dict[str, Any] = {
        "subject": subject_id, "disposition": disposition, "rationale": rationale
    }
    if disposition == "placed":
        parent = record.get("assignedParent")
        if isinstance(parent, str) and parent:
            data["assignedParent"] = parent
        level = record.get("assignedLevel")
        if isinstance(level, int) and 2 <= level <= 4:
            data["assignedLevel"] = level
    else:  # rejected
        reason = record.get("rejectionReason")
        if isinstance(reason, str) and reason:
            data["rejectionReason"] = reason
    return data


def _classification_entry(data: dict[str, Any], confidence: float, now: str) -> JsonlEntry:
    subject_id = data["subject"]
    return JsonlEntry(
        id=f"cls-{subject_id}",
        type=CLASSIFICATION_TYPE,
        version="1.0.0",
        source=SourceProvenance(
            file="architecture-classification",
            location=subject_id,
            fetchedAt=now,
            sourceAuthority="operational",
        ),
        confidence=confidence,
        extractedAt=now,
        data=data,
    )


async def classify_architecture(
    gateway: LLMGateway,
    capabilities: list[JsonlEntry],
    spine: list[JsonlEntry],
    *,
    options: LLMOptions | None = None,
    already_classified: set[str] | None = None,
    batch_size: int = _DEFAULT_BATCH_SIZE,
    now: str | None = None,
) -> list[JsonlEntry]:
    """Classify raw capabilities into the spine — one ``CapabilityClassification`` per verdict.

    Names the model omits are simply left unclassified (honest freshness — the projector surfaces
    them). Subjects in ``already_classified`` are skipped before any LLM call, so a re-run over an
    unchanged corpus makes no calls and emits nothing new.
    """

    skip = already_classified or set()
    pending = [c for c in capabilities if c.id not in skip]
    if not pending:
        return []

    schema = build_classification_result_schema()
    timestamp = now or _now_iso()
    outputs: list[JsonlEntry] = []

    for start in range(0, len(pending), batch_size):
        batch = pending[start : start + batch_size]
        names_to_ids: dict[str, list[str]] = defaultdict(list)
        for cap in batch:
            names_to_ids[entity_name(cap)].append(cap.id)

        prompt = build_classification_prompt(spine, sorted(names_to_ids))
        response = await gateway.extract_structured(prompt, schema, options)

        for record in _iter_records(response.result):
            subject_name = record.get("subject")
            if not isinstance(subject_name, str):
                continue
            confidence = _coerce_confidence(record.get("confidence"))
            for subject_id in names_to_ids.get(subject_name, []):
                data = _classification_data(record, subject_id)
                if data is not None:
                    outputs.append(_classification_entry(data, confidence, timestamp))

    return outputs


def _iter_records(result: dict[str, Any]) -> list[dict[str, Any]]:
    raw = result.get("classifications")
    if not isinstance(raw, list):
        return []
    return [record for record in raw if isinstance(record, dict)]
