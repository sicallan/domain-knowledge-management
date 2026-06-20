"""Loads versioned prompt templates and composes extraction prompts.

Templates live as ``<name>.v<N>.md`` files in ``templates/`` (spec 005 Open Q1 — prompts as
versioned files with golden regression per version). Adding a new inventory type means adding a
``<type>.vN.md`` template alongside its ``/schemas`` entry — no pipeline-core change (OCP).
The composed prompt embeds ``[[doc:…]]`` / ``[[section:…]]`` provenance markers so any gateway
(including the deterministic fake) can trace a chunk without parsing prose.
"""

from __future__ import annotations

import re
from pathlib import Path

from dkm_enrichment.chunking import Chunk
from dkm_enrichment.models import JsonlEntry

_TEMPLATES_DIR = Path(__file__).parent / "templates"
_VERSION_RE = re.compile(r"^(?P<name>.+)\.v(?P<version>\d+)\.md$")

# Inventory type -> template stem. New types register by adding a template + schema.
TYPE_TEMPLATE_NAMES: dict[str, str] = {
    "DomainConcept": "domain-concept",
    "Decision": "decision",
    "Rule": "rule",
    "BusinessInvariant": "business-invariant",
    "BusinessCapability": "business-capability",
    "ReferenceData": "reference-data",
    # Phase 2.2 behaviour pass (feature 02) — registered additively alongside their L3 schemas.
    "OrchestrationFlow": "orchestration-flow",
    "OrchestrationStep": "orchestration-step",
    "Event": "event",
    "StateTransition": "state-transition",
}


class PromptLibrary:
    """Discovers versioned templates and composes entity/relationship prompts."""

    def __init__(self, templates_dir: Path | None = None) -> None:
        self._dir = templates_dir or _TEMPLATES_DIR
        self._latest: dict[str, tuple[int, Path]] = {}
        for path in self._dir.glob("*.md"):
            match = _VERSION_RE.match(path.name)
            if not match:
                continue
            name = match.group("name")
            version = int(match.group("version"))
            if name not in self._latest or version > self._latest[name][0]:
                self._latest[name] = (version, path)

    def version_of(self, name: str) -> str:
        return f"v{self._latest[name][0]}"

    def text(self, name: str) -> str:
        if name not in self._latest:
            raise KeyError(f"No prompt template named {name!r} in {self._dir}")
        return self._latest[name][1].read_text(encoding="utf-8").strip()

    def prompt_versions(self) -> dict[str, str]:
        return {name: f"v{version}" for name, (version, _) in sorted(self._latest.items())}

    def build_entity_prompt(self, chunk: Chunk, target_types: list[str]) -> str:
        type_guidance = "\n\n".join(
            self.text(TYPE_TEMPLATE_NAMES[t]) for t in target_types if t in TYPE_TEMPLATE_NAMES
        )
        return (
            f"{self.text('_system')}\n\n"
            f"{type_guidance}\n\n"
            f"## Source\n{self._provenance_block(chunk)}\n\n"
            f"## Text\n{chunk.content}\n\n"
            "Return the extracted entities as structured output."
        )

    def build_relationship_prompt(self, chunk: Chunk, entities: list[JsonlEntry]) -> str:
        roster = "\n".join(
            f"- id={e.id} type={e.type} name={_display_name(e)}" for e in entities
        ) or "- (no entities extracted from this chunk)"
        return (
            f"{self.text('_system')}\n\n"
            f"{self.text('_relationship')}\n\n"
            f"## Source\n{self._provenance_block(chunk)}\n\n"
            f"## Entities in scope\n{roster}\n\n"
            f"## Text\n{chunk.content}\n\n"
            "Return the relationships as structured output, referencing entity ids above."
        )

    @staticmethod
    def _provenance_block(chunk: Chunk) -> str:
        return (
            f"[[doc:{chunk.documentId}]] [[section:{chunk.sectionTitle}]]\n"
            f"Location: {chunk.location}"
        )


def _display_name(entry: JsonlEntry) -> str:
    for key in ("name", "statement", "expression"):
        value = entry.data.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return entry.id
