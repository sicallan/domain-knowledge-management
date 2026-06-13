# 001 — Schema Module

## Purpose & Scope

The Schema Module is the single source of truth for all inventory type definitions in the Domain Knowledge Management platform. It provides JSON Schema definitions that validate every inventory entry at rest, in transit, and during extraction. All other components depend on these schemas for type safety and structural correctness.

**In scope:**
- JSON Schema definitions for all inventory types (L0, L1, L2, L3)
- Relationship type schemas with cardinality constraints
- Schema versioning (semver) and lifecycle metadata
- Validation utilities (validate an entry against its schema)
- Schema registry (programmatic access to schemas by type and version)
- Extension point: adding a new inventory type without modifying existing schemas

**Out of scope:**
- Storage-level schema (DB DDL, graph labels) — that's per-loader responsibility
- UI form generation from schema — that's a UI concern
- Schema migration tooling — separate module

---

## Inputs

| Input | Source | Format |
|-------|--------|--------|
| Inventory type definitions | Architecture team (manual authoring) | JSON Schema files (`.schema.json`) |
| Schema version metadata | Git history + explicit version field | Semver string in schema `$id` |
| Entry to validate | Any component (extraction, loader, API) | JSON object |

---

## Outputs

| Output | Consumer | Format |
|--------|----------|--------|
| Validation result | Extraction pipeline, loaders, API layer | `{ valid: boolean, errors: ValidationError[] }` |
| Schema definition | Loaders, UI, documentation generators | JSON Schema object |
| Schema registry listing | API layer, admin console | `{ type: string, version: string, schema: object }[]` |
| Type metadata | Various | `{ type, layer, requiredRelationships, lifecycleStates }` |

---

## Behaviour

### Schema Organisation

```
/schemas
  /inventory
    /L0
      strategic-initiative.schema.json
      value-stream.schema.json
      value-stream-stage.schema.json
      stakeholder-map.schema.json
      value-impact-map.schema.json
      product-roadmap.schema.json
      north-star-roadmap.schema.json
    /L1
      domain-concept.schema.json
      business-capability.schema.json
      business-invariant.schema.json
      rule.schema.json
      reference-data.schema.json
      decision.schema.json
    /L2
      vendor-product.schema.json
      vendor-capability-mapping.schema.json
      project-spec.schema.json
    /L3
      system.schema.json
      service.schema.json
      orchestration-flow.schema.json
      orchestration-step.schema.json
      event.schema.json
      state-transition.schema.json
      integration.schema.json
    /cross-cutting
      regulatory-requirement.schema.json
      policy-statement.schema.json
  /relationships
    relationship.schema.json        # Base schema for all edges
    structural.schema.json          # implements, fulfils, specifies, etc.
    behavioural.schema.json         # triggers, emits, consumes, etc.
    decision-specific.schema.json   # evaluates, produces, etc.
    regulatory.schema.json          # obliges, satisfiedBy, exposes
    strategic.schema.json           # targets, funds, coordinatedBy, etc.
  /common
    base-entry.schema.json          # Common fields: id, version, lifecycle_status, evidencedBy, etc.
    provenance.schema.json          # Source provenance object
    temporal.schema.json            # Bi-temporal fields (validFrom, validTo, transactionTime)
```

### Validation Rules

1. **Structural validation**: Entry conforms to its type schema (JSON Schema `$ref`)
2. **Referential validation**: Referenced entries (by ID) exist in the graph (deferred/async check)
3. **Lifecycle validation**: State transitions follow allowed paths (draft→active→deprecated→retired)
4. **Cardinality validation**: Relationships satisfy minimum cardinality constraints
5. **Temporal validation**: `validFrom` < `validTo`; no overlapping valid periods for same entity

### Extension Mechanism

Adding a new inventory type requires:
1. Create a new `.schema.json` file in the appropriate layer directory
2. Register the type in the schema registry (auto-discovered from filesystem)
3. Optionally define new relationship types that reference the new type
4. **No modification** to existing schemas, validation logic, or registry code (OCP)

### Schema Evolution

- **Minor version** (additive): new optional fields, new enum values → backward compatible
- **Major version** (breaking): field removal, type change, required field addition → requires migration
- All schemas include `$schema`, `$id` (with version), `title`, `description`
- Previous versions remain available in the registry for validation of historical entries

---

## Interfaces & Contracts

### SchemaRegistry

```typescript
interface SchemaRegistry {
  // Get schema by type and optional version (latest if omitted)
  getSchema(type: InventoryType, version?: string): JsonSchema;
  
  // List all registered types with metadata
  listTypes(): TypeMetadata[];
  
  // Get all versions of a type's schema
  getVersionHistory(type: InventoryType): SchemaVersion[];
  
  // Check if a type exists in the registry
  hasType(type: string): boolean;
}
```

### SchemaValidator

```typescript
interface SchemaValidator {
  // Validate an entry against its type schema
  validate(entry: unknown, type: InventoryType, version?: string): ValidationResult;
  
  // Validate a relationship against relationship schema
  validateRelationship(relationship: unknown): ValidationResult;
  
  // Validate a lifecycle transition
  validateTransition(currentStatus: string, newStatus: string, type: InventoryType): ValidationResult;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

interface ValidationError {
  path: string;        // JSON pointer to invalid field
  message: string;     // Human-readable error
  schemaPath: string;  // JSON pointer into schema that failed
  keyword: string;     // JSON Schema keyword that failed (e.g., "required", "type")
}
```

### Base Entry Schema (common to all types)

```json
{
  "id": "string (UUID v4)",
  "type": "string (InventoryType enum)",
  "version": "string (semver)",
  "lifecycle_status": "draft | active | deprecated | retired",
  "validFrom": "ISO 8601 datetime",
  "validTo": "ISO 8601 datetime | null",
  "evidencedBy": [{ "source": "string", "location": "string", "fetchedAt": "datetime" }],
  "createdAt": "ISO 8601 datetime",
  "updatedAt": "ISO 8601 datetime",
  "createdBy": "string",
  "confidence": "number (0.0–1.0)"
}
```

---

## Dependencies

| Depends on | Reason |
|------------|--------|
| None (foundational) | Schema module has zero runtime dependencies on other modules |

| Depended on by | Reason |
|----------------|--------|
| Extraction pipeline | Validates extracted entries before writing JSONL |
| Loaders | Validates entries before persisting to stores |
| API layer | Validates mutations; serves schema definitions |
| Quality scoring | Uses schema metadata for completeness checks |
| Admin console | Displays schema versions; previews changes |

---

## Key Decisions

### Decision 1: Schema Language

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **JSON Schema (Draft 2020-12)** | Industry standard; massive tooling ecosystem (validators in every language); composable via `$ref`; supports conditional schemas; IDE support | Verbose for complex constraints; no built-in graph semantics; limited expressiveness for cross-field validation |
| **TypeBox (TypeScript-first)** | Type-safe schema definitions; generates JSON Schema; colocates types and schemas; lighter syntax | TypeScript-only authoring; generated JSON Schema is the actual contract; adds a build step; team must learn TypeBox API |
| **Zod** | Excellent TypeScript DX; runtime validation built-in; composable; growing ecosystem | TypeScript-only; no standard serialisation format (must export to JSON Schema for cross-language use); validation semantics differ from JSON Schema |

**Recommendation: JSON Schema (Draft 2020-12)**

*Rationale*: The platform has Python workloads (ML/NLP agents) that need to validate the same schemas. JSON Schema is the only option that works natively across TypeScript and Python without translation. The schema files are also documentation — they're readable by architects and business stakeholders. We author in JSON Schema directly and generate TypeScript types from them (not the reverse), ensuring the schema is the source of truth.

---

### Decision 2: Schema-to-Type Generation Direction

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Schema-first (JSON Schema → TypeScript types)** | Schema is the canonical contract; works cross-language; schema files are documentation; generation is a build step that catches drift | Requires tooling (json-schema-to-typescript); developer workflow slightly longer; schema authoring is more verbose |
| **Code-first (TypeScript types → JSON Schema)** | Better DX for TypeScript developers; types are familiar; schema is derived | TypeScript becomes the source of truth (excludes Python team); schema drift possible; generated schemas may not be optimal |

**Recommendation: Schema-first (JSON Schema → generated types)**

*Rationale*: The schema IS the contract between extraction (Python), storage (multiple), and API (TypeScript). Making the schema the source of truth ensures all consumers agree on structure. Generated TypeScript types give us compile-time safety without making TypeScript the authority.

---

### Decision 3: Validation Library

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Ajv (TypeScript)** | Fastest JSON Schema validator; supports Draft 2020-12; widely used; compiles schemas for performance | API is low-level; error messages need transformation for user-facing display |
| **jsonschema (Python)** | Standard Python JSON Schema library; supports Draft 2020-12; well-maintained | Python-only; slower than Ajv; different error format |
| **Both (Ajv + jsonschema)** | Each ecosystem uses its native best-in-class validator | Must ensure validation semantics are identical; test both against same fixtures |

**Recommendation: Both (Ajv for TypeScript, jsonschema for Python), unified test fixtures**

*Rationale*: Each ecosystem should use its best validator. We ensure consistency by running both validators against the same fixture set in CI. If a fixture passes in one but fails in the other, that's a CI failure. The test fixtures become the true specification of validation behaviour.

---

### Decision 4: Schema File Discovery and Registry Loading

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Filesystem convention (auto-discovery)** | Zero configuration; adding a schema = adding a file; OCP-compliant | Relies on directory structure convention; no explicit registration; harder to add metadata beyond what's in the schema itself |
| **Explicit manifest file** | Clear listing of all types; can include metadata; supports ordering/grouping | Must be updated when adding types (violates OCP); extra maintenance step |
| **Hybrid (auto-discovery + optional manifest for metadata)** | Auto-discovery for schemas; manifest only for supplementary metadata (display name, icon, etc.) | Slightly more complex; two sources of truth for different concerns |

**Recommendation: Filesystem auto-discovery (pure convention)**

*Rationale*: OCP compliance is a guiding principle. Adding a new inventory type should require adding a file, not editing a manifest. The schema `$id`, `title`, and `description` fields provide sufficient metadata. If richer metadata is needed later, a companion `.meta.json` pattern can be introduced without changing the core mechanism.

---

## Open Questions

1. **Cross-field validation**: Some constraints span multiple fields (e.g., "if `type` is `automated`, then `triggeredBy` is required"). Do we express these in JSON Schema (using `if/then/else`) or in a separate validation layer?
2. **Schema testing strategy**: Do we maintain a golden fixture per schema version, or generate fixtures from the schema using property-based testing?
3. **Relationship schema granularity**: One schema per relationship type, or a single parameterised relationship schema with an enum for relationship kind?
