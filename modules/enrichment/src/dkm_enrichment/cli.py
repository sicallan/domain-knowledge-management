"""Command-line entry for the extraction pipeline — the Python half of ``dkm process``.

``python -m dkm_enrichment extract <canonical-docs.jsonl> --out <dir>`` reads the canonical
documents a connector run produced (one :class:`CanonicalDocument` JSON per line), runs the
:class:`ExtractionPipeline` over them, and writes the intermediate JSONL the gateway serves —
``extractions.jsonl`` + ``relationships.jsonl`` (plus ``metadata.json``) — under ``--out`` with
**stable, canonical names** (a re-run overwrites rather than accumulating run-id-prefixed files).

By default it uses the real Claude gateway (needs ``ANTHROPIC_API_KEY``); ``--fake`` swaps in the
deterministic :class:`FakeGateway` so the whole pipeline is exercisable with no key (CI/plumbing).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import shutil
import sys
from collections import defaultdict
from pathlib import Path

from dkm_enrichment.emission import JsonlWriter
from dkm_enrichment.entity_resolution import dedupe_relationships, entity_name
from dkm_enrichment.gateway import FakeGateway, LLMGateway, LLMGatewayError
from dkm_enrichment.llm_resolution import candidate_blocks, resolve_with_llm
from dkm_enrichment.models import (
    PHASE_0A_L1_TYPES,
    PHASE_2_BEHAVIOUR_TYPES,
    CanonicalDocument,
    ExtractionConfig,
    JsonlEntry,
    LLMOptions,
)
from dkm_enrichment.pipeline import ExtractionPipeline

# The default extraction universe for an ad-hoc domain: the L1 pure-domain types (concepts,
# decisions, rules, invariants, capabilities, reference data) + the L3 behaviour types (flows,
# steps, events, transitions). L2 vendor types need vendor-specific sources, so they are opt-in.
DEFAULT_TARGET_TYPES: list[str] = list(
    dict.fromkeys([*PHASE_0A_L1_TYPES, *PHASE_2_BEHAVIOUR_TYPES])
)

_STAGING = ".staging"


def read_canonical_documents(path: Path) -> list[CanonicalDocument]:
    """Parse a canonical-docs JSONL file (one CanonicalDocument per line)."""
    documents: list[CanonicalDocument] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped:
            documents.append(CanonicalDocument.model_validate_json(stripped))
    return documents


def build_gateway(*, fake: bool) -> LLMGateway:
    """The real Claude gateway by default; the deterministic fake when ``--fake`` is set.

    Claude is imported lazily so ``--fake`` (and the test suite) never require the ``anthropic``
    SDK or a key.
    """
    if fake:
        return FakeGateway()
    from dkm_enrichment.gateway.claude import ClaudeGateway

    return ClaudeGateway()


async def _run_extract(args: argparse.Namespace) -> int:
    source = Path(args.canonical_docs)
    if not source.exists():
        print(f"✗ canonical-docs file not found: {source}", file=sys.stderr)
        return 1

    documents = read_canonical_documents(source)
    if not documents:
        print(f"✗ no documents in {source}", file=sys.stderr)
        return 1

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    staging = out / _STAGING
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)

    target_types = (
        [t.strip() for t in args.target_types.split(",") if t.strip()]
        if args.target_types
        else DEFAULT_TARGET_TYPES
    )
    config = ExtractionConfig(targetTypes=target_types, model=args.model)

    try:
        gateway = build_gateway(fake=args.fake)
    except LLMGatewayError as exc:
        # Misconfiguration before any call (no key / SDK missing) — clean message, no traceback.
        shutil.rmtree(staging, ignore_errors=True)
        print(f"✗ {exc}", file=sys.stderr)
        return 1

    pipeline = ExtractionPipeline(gateway)
    try:
        result = await pipeline.run(documents, config, staging)
    except LLMGatewayError as exc:
        # The LLM step failed (out of credits, rate limit, network …) but the connectors already
        # parsed and saved the documents — reassure the user and point at the intact canonical file.
        shutil.rmtree(staging, ignore_errors=True)
        print(f"✗ {exc}", file=sys.stderr)
        print(
            f"  Your documents are parsed and intact at {source}; only the LLM extraction step "
            "failed. Resolve the issue above and re-run, or pass --fake to exercise the pipeline "
            "without the LLM.",
            file=sys.stderr,
        )
        return 1

    # Promote the run-id-prefixed files to stable, canonical names the gateway watches.
    for produced, canonical in (
        (result.outputFiles.extractions, out / "extractions.jsonl"),
        (result.outputFiles.relationships, out / "relationships.jsonl"),
        (result.outputFiles.metadata, out / "metadata.json"),
    ):
        shutil.move(produced, str(canonical))
    shutil.rmtree(staging, ignore_errors=True)

    print(
        f"✓ extracted {result.stats.entitiesExtracted} entities, "
        f"{result.stats.relationshipsExtracted} relationships "
        f"from {len(documents)} document(s) → {out}"
    )
    return 0


def _read_entries(path: Path) -> list[JsonlEntry]:
    """Parse a JSONL file of inventory/relationship records into JsonlEntry objects."""
    if not path.exists():
        return []
    return [
        JsonlEntry.model_validate_json(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


async def _run_normalise(args: argparse.Namespace) -> int:
    """LLM-adjudicated normalisation: merge same-concept entities in a domain's JSONL in place."""
    out = Path(args.dir)
    extractions_path = out / "extractions.jsonl"
    relationships_path = out / "relationships.jsonl"
    if not extractions_path.exists():
        print(f"✗ no extractions.jsonl in {out} — run `extract` first.", file=sys.stderr)
        return 1

    entities = _read_entries(extractions_path)
    relationships = _read_entries(relationships_path)
    pre_names = {entry.id: entity_name(entry) for entry in entities}
    block_count = len(candidate_blocks(entities))
    print(f"▶ Normalising {len(entities)} entities ({block_count} candidate cluster(s)) in {out}…")

    try:
        gateway = build_gateway(fake=args.fake)
        result = await resolve_with_llm(
            gateway,
            entities,
            options=LLMOptions(model=args.model),
            min_similarity=args.min_similarity,
        )
    except LLMGatewayError as exc:
        print(f"✗ {exc}", file=sys.stderr)
        print(
            f"  Your extracted graph in {out} is untouched; resolve the issue above and re-run, "
            "or pass --fake to exercise the pipeline without the LLM.",
            file=sys.stderr,
        )
        return 1

    normalised_relationships = dedupe_relationships(relationships, result.id_remap)
    report = _normalisation_report(
        result, pre_names, len(relationships), len(normalised_relationships)
    )

    # Back up the originals before overwriting the gateway-watched files.
    backup = out / "pre-normalisation"
    backup.mkdir(exist_ok=True)
    shutil.copy2(extractions_path, backup / "extractions.jsonl")
    if relationships_path.exists():
        shutil.copy2(relationships_path, backup / "relationships.jsonl")

    with JsonlWriter(extractions_path) as writer:
        for entry in result.entities:
            writer.write(entry)
    with JsonlWriter(relationships_path) as writer:
        for entry in normalised_relationships:
            writer.write(entry)
    (out / "normalisation-report.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8"
    )

    print(
        f"✓ merged {result.merged_count} duplicate entit(y/ies) "
        f"({len(entities)} → {len(result.entities)}); relationships "
        f"{len(relationships)} → {len(normalised_relationships)}. "
        f"Originals backed up to {backup}/; see {out / 'normalisation-report.json'}."
    )
    return 0


def _normalisation_report(
    result: object, pre_names: dict[str, str], rel_before: int, rel_after: int
) -> dict[str, object]:
    """A human-readable summary of what merged into what (for review/auditing)."""
    from dkm_enrichment.entity_resolution import ResolutionResult

    assert isinstance(result, ResolutionResult)
    survivor_by_id = {entry.id: entry for entry in result.entities}
    by_survivor: dict[str, list[str]] = defaultdict(list)
    for loser_id, survivor_id in result.id_remap.items():
        by_survivor[survivor_id].append(loser_id)

    merges = [
        {
            "canonical": entity_name(survivor_by_id[survivor_id])
            if survivor_id in survivor_by_id
            else survivor_id,
            "mergedFrom": sorted(pre_names.get(loser_id, loser_id) for loser_id in losers),
        }
        for survivor_id, losers in by_survivor.items()
    ]
    merges.sort(key=lambda m: (-len(m["mergedFrom"]), str(m["canonical"])))
    return {
        "entitiesMerged": result.merged_count,
        "entitiesAfter": len(result.entities),
        "relationshipsBefore": rel_before,
        "relationshipsAfter": rel_after,
        "merges": merges,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="dkm_enrichment", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    extract = sub.add_parser("extract", help="Extract a knowledge graph from canonical documents.")
    extract.add_argument("canonical_docs", help="Connector-produced canonical-docs JSONL.")
    extract.add_argument("--out", required=True, help="Output directory for the JSONL.")
    extract.add_argument(
        "--fake",
        action="store_true",
        help="Use the deterministic fake gateway (no LLM / key) — for CI and plumbing checks.",
    )
    extract.add_argument("--model", default="claude-sonnet-4-6", help="LLM model for extraction.")
    extract.add_argument(
        "--target-types",
        default="",
        help="Comma-separated inventory types to extract (default: L1 + behaviour types).",
    )

    normalise = sub.add_parser(
        "normalise",
        help="Merge same-concept (duplicate) entities in a domain's JSONL, LLM-adjudicated.",
    )
    normalise.add_argument("dir", help="Domain output dir holding extractions/relationships.jsonl.")
    normalise.add_argument(
        "--fake",
        action="store_true",
        help="Use the deterministic fake gateway (no LLM / key) — for CI and plumbing checks.",
    )
    normalise.add_argument(
        "--model", default="claude-sonnet-4-6", help="LLM model for adjudication."
    )
    normalise.add_argument(
        "--min-similarity",
        type=float,
        default=0.67,
        help="Token-set similarity (0-1) to treat two names as merge candidates (default 0.67; "
        "lower = more aggressive clustering).",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "extract":
        return asyncio.run(_run_extract(args))
    if args.command == "normalise":
        return asyncio.run(_run_normalise(args))
    return 1  # pragma: no cover — argparse enforces a known subcommand
