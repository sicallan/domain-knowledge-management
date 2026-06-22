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

# The 2.1 grouped relationship schemas (each a single file with a ``kind`` enum, D-P2.4).
BEHAVIOURAL_RELATIONSHIP_SCHEMA_ID = "https://dkm.dev/schemas/relationships/behavioural.schema.json"
DECISION_SPECIFIC_RELATIONSHIP_SCHEMA_ID = (
    "https://dkm.dev/schemas/relationships/decision-specific.schema.json"
)
# The 3.1 L2 functional-realisation edge schema (fulfils / specifies / realizesVendorCap).
L2_STRUCTURAL_RELATIONSHIP_SCHEMA_ID = (
    "https://dkm.dev/schemas/relationships/l2-structural.schema.json"
)


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

    def validate_behavioural_relationship(
        self, relationship_type: str, source_type: str, target_type: str
    ) -> ValidationOutcome:
        """Validate a behavioural edge's endpoint types against ``behavioural.schema.json``.

        The intermediate JSONL relationship form (``sourceEntityId`` / ``targetEntityId``) is
        validated structurally elsewhere; here we check that the edge's endpoint *inventory
        types* satisfy the 2.1 ``{sourceType, targetType}`` constraints for its ``relationshipType``
        (e.g. ``emits`` must go ``OrchestrationStep|Service → Event``). We build the canonical
        graph-edge shape the schema expects and reuse :meth:`validate_against_schema_id`.
        """

        edge = {
            "id": "00000000-0000-0000-0000-000000000000",
            "type": RELATIONSHIP_TYPE,
            "relationshipType": relationship_type,
            "sourceId": "source",
            "targetId": "target",
            "version": "1.0.0",
            "evidencedBy": [{"source": "extraction", "fetchedAt": "1970-01-01T00:00:00.000Z"}],
            "sourceType": source_type,
            "targetType": target_type,
        }
        return self.validate_against_schema_id(BEHAVIOURAL_RELATIONSHIP_SCHEMA_ID, edge)

    def validate_decision_relationship(
        self, relationship_type: str, source_type: str, target_type: str
    ) -> ValidationOutcome:
        """Validate a decision edge's endpoint types against ``decision-specific.schema.json``.

        Mirrors :meth:`validate_behavioural_relationship`: the intermediate JSONL relationship
        form (``sourceEntityId`` / ``targetEntityId``) is validated structurally elsewhere; here we
        check that the edge's endpoint *inventory types* satisfy the 2.1
        ``{sourceType, targetType}`` constraints for its ``relationshipType`` (e.g. ``evaluates``
        must go ``Decision → Rule|BusinessInvariant``, ``triggeredBy`` ``Event|Step → Decision``).
        The ``evaluates ≥ 1`` / ``produces ≥ 1`` / ``automated ⇒ triggeredBy`` *count* rules cannot
        be expressed in a single-edge schema and are enforced separately by the emit gate (D-P2.2).
        """

        edge = {
            "id": "00000000-0000-0000-0000-000000000000",
            "type": RELATIONSHIP_TYPE,
            "relationshipType": relationship_type,
            "sourceId": "source",
            "targetId": "target",
            "version": "1.0.0",
            "evidencedBy": [{"source": "extraction", "fetchedAt": "1970-01-01T00:00:00.000Z"}],
            "sourceType": source_type,
            "targetType": target_type,
        }
        return self.validate_against_schema_id(DECISION_SPECIFIC_RELATIONSHIP_SCHEMA_ID, edge)

    def validate_l2_structural_relationship(
        self, relationship_type: str, source_type: str, target_type: str
    ) -> ValidationOutcome:
        """Validate an L2 structural edge's endpoint types against ``l2-structural.schema.json``.

        Mirrors :meth:`validate_decision_relationship`: the intermediate JSONL relationship form
        (``sourceEntityId`` / ``targetEntityId``) is validated structurally elsewhere; here we check
        that the edge's endpoint *inventory types* satisfy the 3.1 ``{sourceType, targetType}``
        constraints for its ``relationshipType`` — ``fulfils`` ``VendorProduct →
        BusinessCapability``, ``specifies`` ``ProjectSpec → DomainConcept``, ``realizesVendorCap``
        ``Service → VendorCapabilityMapping``. Cardinality lives in the ``RelationshipTypeRegistry``
        (D-P2.2), not here. We build the canonical graph-edge shape the schema expects and reuse
        :meth:`validate_against_schema_id`.
        """

        edge = {
            "id": "00000000-0000-0000-0000-000000000000",
            "type": RELATIONSHIP_TYPE,
            "relationshipType": relationship_type,
            "sourceId": "source",
            "targetId": "target",
            "version": "1.0.0",
            "evidencedBy": [{"source": "extraction", "fetchedAt": "1970-01-01T00:00:00.000Z"}],
            "sourceType": source_type,
            "targetType": target_type,
        }
        return self.validate_against_schema_id(L2_STRUCTURAL_RELATIONSHIP_SCHEMA_ID, edge)

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
