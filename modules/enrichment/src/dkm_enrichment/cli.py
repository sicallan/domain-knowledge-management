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
import shutil
import sys
from pathlib import Path

from dkm_enrichment.gateway import FakeGateway, LLMGateway
from dkm_enrichment.models import (
    PHASE_0A_L1_TYPES,
    PHASE_2_BEHAVIOUR_TYPES,
    CanonicalDocument,
    ExtractionConfig,
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

    pipeline = ExtractionPipeline(build_gateway(fake=args.fake))
    result = await pipeline.run(documents, config, staging)

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
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "extract":
        return asyncio.run(_run_extract(args))
    return 1  # pragma: no cover — argparse enforces a known subcommand
