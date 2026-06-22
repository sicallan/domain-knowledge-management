# Feature 01 — L2 Vendor/Project Inventory Schemas

## 1. Feature

- **Name**: Layer-2 (Functional Realisation) inventory schemas — `VendorProduct`,
  `VendorCapabilityMapping`, `ProjectSpec` — plus the L2 **structural** relationship schemas
  (`fulfils`, `specifies`, `realizesVendorCap`), cardinality-registered.
- **Plan step**: 3.1 — *L2 inventory schemas: `VendorProduct`, `VendorCapabilityMapping`,
  `ProjectSpec`* ([plan.md §Phase 3](../../../plan.md)).
- **Spec(s) expanded**: [specs/001-schema-module.md](../../../specs/001-schema-module.md) — these
  files extend the spec's §Schema Organisation tree into a new `L2/` directory. This feature
  **realises** the L2 inventory rows already enumerated in [plan.md §Inventories](../../../plan.md)
  and the L2 structural edges in [plan.md §Relationships → Structural](../../../plan.md); it does not
  invent new structure.

## 2. Summary & scope

The schema foundation for the whole phase, and the **first L2 layer** in the model. Phases 0–2
populated **L1** (structural + decisions) and **L3** (behaviour). Phase 3 adds **L2 Functional
Realisation** — the vendor products, vendor↔domain capability mappings, and project specs that
*claim to fulfil* L1 canonical truth. Every downstream Phase 3 feature (extraction 3.2, the Coverage
Map 3.3, Gap Analysis 3.4) is gated on these schemas existing and validating, so this is sequenced
first.

> **Layering note.** L2 asserts *claims to fulfil* L1 — it never replaces L1 canonical truth. The
> vendor/tech-agnostic L1 stays the source of truth; everything maps *to* it. Schemas live under a
> **new** `schemas/inventory/L2/` directory.

> **Already shipped — reuse, do NOT re-author.**
> - The `common/base-entry.schema.json`, provenance and temporal common schemas, the `SchemaRegistry`
>   filesystem auto-discovery (whose `layerFromPath` **already recognises `L2`** —
>   [registry.ts:130-135](../../../modules/schema/src/registry.ts)), and the Ajv +
>   `jsonschema` cross-validator parity harness — all from Phase 0a.
> - The `RelationshipTypeRegistry` cardinality engine
>   ([relationships.ts](../../../modules/schema/src/relationships.ts)) and its additive registration
>   pattern (`register()` + `register…Relationships` helpers, never mutate `DEFAULT_DEFS`).
> - **`satisfiedBy → ProjectSpec` is already registered** (Phase 2.5,
>   `CROSS_LAYER_RELATIONSHIP_DEFS`) as forward-compatible — its L2 `ProjectSpec` target now becomes
>   real. This feature **adds the L2 node + the remaining L2 structural edges**; it does not recreate
>   the registry, the parity harness, or `satisfiedBy`.

**In scope**
- **Three new L2 inventory schemas** (Draft 2020-12), each `$ref`-composing
  `common/base-entry.schema.json`: `vendor-product`, `vendor-capability-mapping`, `project-spec`.
- One relationship schema `schemas/relationships/l2-structural.schema.json` (grouped, with an internal
  `kind` enum like the Phase 2 `behavioural`/`decision-specific` files): `fulfils`, `specifies`,
  `realizesVendorCap` — extending the existing `relationship.schema.json` base.
- **Additive registration** of the three L2 structural edge defs onto the shared cardinality registry
  via a new `L2_STRUCTURAL_RELATIONSHIP_DEFS` + `registerL2Relationships(registry)` helper, wired into
  `createFullRelationshipRegistry()` — never mutating `DEFAULT_DEFS` (OCP, D-P2.2: one shared rule set
  at both gates).
- Generated TypeScript types (schema-first — spec 001 Decision 2) and Python `jsonschema` parity in CI.
- Auto-discovery proof: the three L2 files are picked up with **no** registry/manifest edit.

**Out of scope**
- Extraction of these types from documents (Feature 02); persistence/traversal of the edges (loader +
  Query Interface, exercised by Features 03/04); UI form generation.
- L0 strategic schemas (Phase 6); the `RegulatoryRequirement`/`PolicyStatement` L1/L2 schemas (already
  partially present via Phase 2.5's regulatory edges — not re-authored here).
- Storage-level schema / graph labels (per-loader concern — spec 001 §Out of scope).
- A schema-migration tool — additive-only evolution is sufficient.

## 3. Dependencies

- **Upstream**: Phase 0a Schema Module (registry, validator, base-entry/provenance/temporal commons,
  auto-discovery + Ajv/`jsonschema` parity harness); Phase 2.5 cross-layer registry (`satisfiedBy →
  ProjectSpec` already registered). L1 structural schemas (`BusinessCapability`, `DomainConcept`,
  `Service`) are referenced by the new edge endpoints.
- **Unblocks**: **all** other Phase 3 features. 02 uses these schemas as structured-output targets and
  validation gates; 03 reads validated L2 entries and edges to build the coverage matrix; 04 reads the
  realisation edges to compute gaps.
- **Cross-feature**: the cardinality rules defined here are *enforced* at extraction (02 emit gate) and
  at link time (loader, exercised by 03/04). This feature owns the **definition**.

## 4. Applied decisions

| Decision | How it constrains this feature |
|---|---|
| **spec 001 Decision 1 — JSON Schema (Draft 2020-12)** | Schemas authored in JSON Schema so Python extraction validates the same files. |
| **spec 001 Decision 2 — schema-first** | Author `.schema.json`; **generate** TS types. |
| **spec 001 Decision 3 — Ajv + `jsonschema`, unified fixtures** | Every new schema gets a fixture set run through both validators in CI; divergence = CI failure. |
| **spec 001 Decision 4 — filesystem auto-discovery** | New `L2/` files picked up by convention; **no** registry/manifest edit (OCP). |
| **D-P2.2 — one shared cardinality rule set** | The L2 edge defs join the single registry consumed at both emit and link gates; no second rule set. |
| **D-P1.3 — language split** | Schemas + generated TS are TypeScript-side; the Python extractor consumes the same JSON Schema files. |
| **Decisions-to-LOCK #2 (coverage semantics), #5 (name collisions)** | `coverage` enum `{full,partial,none}` + optional `coveragePercentage`; rename `ProjectSpec.type → specType`, `VendorProduct.version → productVersion`. |

## 5. User stories

- *As a solution architect, I want vendor products and their capability claims modelled as evidenced,
  versioned inventory entries, so that "what a vendor says it covers" is a graph node, not a slide.*
- *As a portfolio manager, I want vendor↔domain capability mappings to carry an explicit coverage
  level and named gaps, so that build-vs-buy is answerable from the graph.*
- *As a domain architect, I want project specs (requirements/designs/ADRs) linked to the domain
  concepts they address, so that "what work touches this concept" is traceable.*
- *As a platform maintainer, I want adding the L2 layer to require only new files (no edits to the
  registry or existing schemas), so that the OCP guarantee holds across a whole new layer.*

## 6. Acceptance criteria (Given/When/Then)

1. **Valid fixtures pass** — *Given* a well-formed fixture for each of the three L2 types, *when*
   validated by `SchemaValidator.validate(entry, type)`, *then* `valid: true` with no errors.
2. **Invalid fixtures fail with precise errors** — *Given* a `VendorCapabilityMapping` missing its
   `coverage` field (or a `VendorProduct` missing `vendor`), *when* validated, *then* `valid: false`
   with a `ValidationError` whose `path`/`keyword` points at the missing required field.
3. **Base-entry inheritance** — *Given* any L2 fixture, *when* validated, *then* the common fields
   (`id`, `version`, `lifecycle_status`, `evidencedBy`, `validFrom`/`validTo`, `confidence`) are
   required exactly as in `common/base-entry.schema.json` — no per-type drift.
4. **Name-collision avoidance** — *Given* a `ProjectSpec` fixture, *then* its requirement/design/ADR
   axis is the field **`specType`** (the base-entry discriminator stays `type: { const: "ProjectSpec" }`);
   *given* a `VendorProduct`, its product version is **`productVersion`** (distinct from base-entry
   `version`). A fixture using the colliding names fails (or is absent by construction).
5. **Coverage enum** — *Given* a `VendorCapabilityMapping` with `coverage` ∉ `{full,partial,none}`,
   *when* validated, *then* rejected; an optional `coveragePercentage` (0–100) validates when present.
6. **Cross-validator parity** — *Given* the unified L2 fixture set, *when* run through **both** Ajv
   (TS) and `jsonschema` (Python), *then* every fixture yields the **same** valid/invalid verdict.
7. **Auto-discovery (OCP)** — *Given* the three new files dropped in `schemas/inventory/L2/`, *when*
   the registry loads, *then* `hasType('VendorProduct')` / `'VendorCapabilityMapping'` / `'ProjectSpec'`
   are `true`, `listTypes()` includes them and `layerOf(...)` returns `'L2'` — with **no** edit to
   registry code or a manifest.
8. **L2 structural relationship endpoints** — *Given* a `fulfils` edge `{source: VendorProduct,
   target: BusinessCapability}`, *when* validated by `validateRelationship`, *then* it passes; a
   `fulfils` edge with an invalid endpoint type fails. Likewise `specifies` (ProjectSpec →
   DomainConcept) and `realizesVendorCap` (Service → VendorCapabilityMapping).
9. **L2 edges register additively on the shared registry** — *Given* `createFullRelationshipRegistry()`,
   *then* `has('fulfils')`/`has('specifies')`/`has('realizesVendorCap')` are `true` **and** the shipped
   `DEFAULT_DEFS`, behavioural and cross-layer defs are unchanged (diff touches only new code paths).
10. **Additive-only** — *Given* the previously-shipped L1/L3 schemas and `DEFAULT_DEFS`, *when* this
    feature lands, *then* none is modified (diff adds only new files + a new `register…` helper).

## 7. Interface contracts

Reuse spec 001 verbatim — no new interfaces; this feature adds **data** (schema files) the existing
`SchemaRegistry`/`SchemaValidator` already serve, plus one additive registry helper mirroring the
Phase 2 pattern.

New schema files (new `L2/` directory):

```
schemas/inventory/L2/vendor-product.schema.json
schemas/inventory/L2/vendor-capability-mapping.schema.json
schemas/inventory/L2/project-spec.schema.json
schemas/relationships/l2-structural.schema.json
```

New registry export (additive, in [relationships.ts](../../../modules/schema/src/relationships.ts)):

```typescript
export const L2_STRUCTURAL_RELATIONSHIP_DEFS: RelationshipTypeDef[] = [
  { name: "fulfils",           sourceTypes: ["VendorProduct"], targetTypes: ["BusinessCapability"],       maxTargetsPerSource: "unbounded", minTargetsPerSource: 0 },
  { name: "specifies",         sourceTypes: ["ProjectSpec"],   targetTypes: ["DomainConcept"],            maxTargetsPerSource: "unbounded", minTargetsPerSource: 0 },
  { name: "realizesVendorCap", sourceTypes: ["Service"],       targetTypes: ["VendorCapabilityMapping"], maxTargetsPerSource: "unbounded", minTargetsPerSource: 0 },
];
export function registerL2Relationships(registry: RelationshipTypeRegistry): void { /* register each */ }
// …and call it inside createFullRelationshipRegistry().
```

Field sets (from [plan.md §Inventories](../../../plan.md), atop base-entry):

| Type (L2) | Type-specific fields |
|---|---|
| `VendorProduct` | `name`, `vendor`, **`productVersion`** (renamed — see criterion 4), `capabilityClaims[]` (free-text or coded claims the vendor asserts). |
| `VendorCapabilityMapping` | `vendorCapability` (the vendor-side capability name), `mappedConcept` (ref → DomainConcept **or** BusinessCapability id), **`coverage`** (`full`/`partial`/`none`), optional `coveragePercentage` (0–100), `gaps[]` (named shortfalls). First-class node (see README open question). |
| `ProjectSpec` | `name`, **`specType`** (`requirement`/`design`/`ADR`), `status`, `addressedConcepts[]` (refs → DomainConcept ids). |

## 8. TDD test plan (write these first)

- **Unit — `l2-schemas.test.ts`**: one valid + ≥2 invalid fixtures per L2 type (missing required
  field; bad `coverage` enum; `specType` enum violation); assert `productVersion`/`specType` naming.
- **Unit — `l2-relationships.test.ts`**: each `kind` (`fulfils`/`specifies`/`realizesVendorCap`)
  validates only for its allowed `{sourceType,targetType}`; bad endpoints fail (criterion 8).
- **Unit — extend `cardinality.test.ts`**: `createFullRelationshipRegistry()` now `has` the three L2
  edges; `DEFAULT_DEFS`/behavioural/cross-layer defs untouched (criteria 9–10).
- **Contract — extend the Ajv + `jsonschema` parity harness**: the unified L2 fixture set yields
  identical verdicts under both validators (criterion 6).
- **Contract — extend `registry-autodiscovery` test**: dropping the three `L2/` files makes
  `hasType`/`listTypes`/`layerOf('…')==='L2'` report them with **zero** registry-code change
  (criterion 7).

## 9. Task breakdown

1. [ ] Author the three L2 inventory schemas + valid/invalid fixtures (apply the `productVersion`/
   `specType`/`coverage` decisions).
2. [ ] Author `l2-structural.schema.json` extending the relationship base; encode the allowed endpoint
   type pairs with an internal `kind` enum.
3. [ ] Add `L2_STRUCTURAL_RELATIONSHIP_DEFS` + `registerL2Relationships`, wire into
   `createFullRelationshipRegistry()` (additive — leave `DEFAULT_DEFS` alone).
4. [ ] Wire all new fixtures into the Ajv + `jsonschema` parity harness.
5. [ ] Regenerate TypeScript types from the new L2 + relationship schemas (schema-first pipeline).
6. [ ] Extend the registry auto-discovery test proving the new L2 files need no manifest/registry edit.
7. [ ] Update `schemas/` index / docs to list the new L2 types and the `l2-structural` edge group.

## 10. OCP extension points

- **Open**: adding further L2 sub-types (e.g. a future `VendorContract`) and new L2 relationship kinds
  by dropping new `.schema.json` files (auto-discovered) and registering edge defs additively;
  additive minor-version fields on these schemas.
- **Closed**: `common/base-entry.schema.json`, the existing L1/L3 schemas and `DEFAULT_DEFS`
  (untouched — criterion 10); the `SchemaRegistry`/`SchemaValidator` interfaces; the relationship base
  schema. Adding the entire L2 layer must require **zero** edits to registry/validation code.

## 11. Open questions / risks

- **`VendorCapabilityMapping` as node vs edge** (README cross-cutting Q). *Recommendation:* first-class
  node — it carries evidence, coverage and gaps and must be versioned/evidenced. `fulfils`/`specifies`
  are the thin edges. Confirm before authoring the schema.
- **`mappedConcept` target type** — a mapping points at a `DomainConcept` *or* a `BusinessCapability`
  (the plan says "domain concept", the Coverage Map matrix is capability-oriented). *Recommendation:*
  allow either via a typed ref `{ targetType, targetId }`; the coverage predicate (Decision-to-LOCK #3)
  resolves both. Confirm.
- **Name collisions (Decision-to-LOCK #5)** — `specType`/`productVersion` chosen to avoid clobbering
  the base-entry `type`/`version`. Team to ratify the naming so extraction targets (Feature 02) are
  closed against the same field names.
- **Coverage semantics (Decision-to-LOCK #2)** — enum + optional percentage. Lock before 02/03 so the
  extracted value and the rendered cell status share one vocabulary.
