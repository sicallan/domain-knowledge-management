"""Stage 6: schema-validation gate — validates against the canonical ``/schemas`` (not copies).

The repo's JSON Schemas are the single source of truth. This module discovers them by
convention (same approach as ``modules/schema`` on the TS side), builds a ``referencing``
registry so cross-file ``$ref``s resolve, and validates each JSONL entry's ``data`` payload
against the schema for its ``type``.

Entity ``data`` validates against the matching inventory type schema. Relationship ``data``
follows the spec 003 intermediate shape (``relationshipType`` / ``sourceEntityId`` /
``targetEntityId``) — the *intermediate* relationship form the loader later maps onto the graph
edge schema; it is validated structurally here.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import best_match
from referencing import Registry, Resource

from dkm_enrichment.models import RELATIONSHIP_TYPE


def find_schemas_dir(start: Path | None = None) -> Path:
    """Locate the repo-root ``/schemas`` directory by walking upward."""

    here = (start or Path(__file__)).resolve()
    for parent in [here, *here.parents]:
        candidate = parent / "schemas"
        if (candidate / "common" / "base-entry.schema.json").exists():
            return candidate
    raise FileNotFoundError("Could not locate the canonical /schemas directory.")


@dataclass(frozen=True)
class ValidationOutcome:
    valid: bool
    error: str | None = None


class SchemaValidator:
    """Validates JSONL ``data`` payloads against the canonical schemas."""

    def __init__(self, schemas_dir: Path | None = None) -> None:
        self._dir = schemas_dir or find_schemas_dir()
        self._by_type: dict[str, dict[str, Any]] = {}
        self._by_id: dict[str, dict[str, Any]] = {}
        self._registry = self._build_registry()

    def _build_registry(self) -> Registry:
        resources: list[tuple[str, Resource[Any]]] = []
        for path in sorted(self._dir.rglob("*.schema.json")):
            schema = json.loads(path.read_text(encoding="utf-8"))
            schema_id = schema.get("$id", path.as_uri())
            resources.append((schema_id, Resource.from_contents(schema)))
            self._by_id[schema_id] = schema
            type_const = _extract_type_const(schema)
            if type_const is not None:
                self._by_type[type_const] = schema
        return Registry().with_resources(resources)

    @property
    def known_types(self) -> set[str]:
        return set(self._by_type)

    def optional_fields(self, type_name: str) -> list[str]:
        """Type-specific properties that are not required (drives completeness scoring).

        Returns the declared properties of the type's own schema minus its ``required``
        list and the ``type`` discriminator. Unknown types yield an empty list (so
        completeness falls back to the neutral 0.5 in :func:`field_completeness`).
        """

        schema = self._by_type.get(type_name)
        if schema is None:
            return []
        properties = schema.get("properties", {})
        required = set(schema.get("required", []))
        return [
            name
            for name in properties
            if name != "type" and name not in required
        ]

    def validate_data(self, type_name: str, data: dict[str, Any]) -> ValidationOutcome:
        """Validate an inventory ``data`` payload against its type schema."""

        schema = self._by_type.get(type_name)
        if schema is None:
            return ValidationOutcome(False, f"Unknown inventory type: {type_name}")
        validator = Draft202012Validator(schema, registry=self._registry)
        errors = list(validator.iter_errors(data))
        if not errors:
            return ValidationOutcome(True)
        match = best_match(errors)
        path = "/" + "/".join(str(p) for p in (match.absolute_path if match else []))
        message = match.message if match else "validation error"
        return ValidationOutcome(False, f"{path}: {message}")

    def validate_against_schema_id(self, schema_id: str, data: dict[str, Any]) -> ValidationOutcome:
        """Validate a payload against any discovered schema by its ``$id``.

        Mirrors the TS ``SchemaValidator.validateAgainstSchemaId`` so the unified
        relationship fixtures (validated against the behavioural / decision-specific
        relationship schemas) yield the same verdict in both ecosystems.
        """

        schema = self._by_id.get(schema_id)
        if schema is None:
            return ValidationOutcome(False, f"Unknown schema id: {schema_id}")
        validator = Draft202012Validator(schema, registry=self._registry)
        errors = list(validator.iter_errors(data))
        if not errors:
            return ValidationOutcome(True)
        match = best_match(errors)
        path = "/" + "/".join(str(p) for p in (match.absolute_path if match else []))
        message = match.message if match else "validation error"
        return ValidationOutcome(False, f"{path}: {message}")

    def validate_relationship_data(self, data: dict[str, Any]) -> ValidationOutcome:
        """Validate the spec 003 intermediate relationship payload shape."""

        for field in ("relationshipType", "sourceEntityId", "targetEntityId"):
            value = data.get(field)
            if not isinstance(value, str) or not value.strip():
                return ValidationOutcome(False, f"/{field}: required non-empty string")
        return ValidationOutcome(True)

    def validate_entry(self, type_name: str, data: dict[str, Any]) -> ValidationOutcome:
        """Dispatch on ``type`` — relationships use the intermediate shape, entities the schema."""

        if type_name == RELATIONSHIP_TYPE:
            return self.validate_relationship_data(data)
        return self.validate_data(type_name, data)


def _extract_type_const(schema: dict[str, Any]) -> str | None:
    """Extract the ``type`` discriminator a schema pins via ``const`` (top-level or in allOf)."""

    def from_props(node: Any) -> str | None:
        if not isinstance(node, dict):
            return None
        type_prop = node.get("properties", {}).get("type")
        if isinstance(type_prop, dict) and isinstance(type_prop.get("const"), str):
            return type_prop["const"]
        return None

    direct = from_props(schema)
    if direct:
        return direct
    for branch in schema.get("allOf", []):
        found = from_props(branch)
        if found:
            return found
    return None
