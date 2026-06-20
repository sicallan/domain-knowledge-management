# Feature 01 — Behaviour & Decision Inventory Schemas

## 1. Feature

- **Name**: Behaviour inventory schemas + Decision as a first-class type, with behavioural and
  decision-specific relationship schemas (cardinality-constrained).
- **Plan step**: 2.1 — *Behaviour inventory schemas: `OrchestrationFlow`, `OrchestrationStep`,
  `Event`, `StateTransition`, `Decision`* ([plan.md §Phase 2](../../../plan.md)).
- **Spec(s) expanded**:
  [specs/001-schema-module.md](../../../specs/001-schema-module.md) — these schema files are
  already enumerated in the spec's §Schema Organisation tree (`/L3/orchestration-flow…`,
  `/L1/decision.schema.json`, `/relationships/behavioural…`, `/relationships/decision-specific…`).
  This feature **realises** those named files; it does not invent new structure.

## 2. Summary & scope

The schema foundation for the whole phase. Phase 1 populated the **structural** L1 types
(DomainConcept, BusinessCapability, etc.); Phase 2 adds the **behavioural** L3 types and
**Decision** — the highest-value node in the model ([plan.md §Decision as a First-Class Inventory
Item](../../../plan.md)). Every downstream Phase 2 feature (extraction 2.2/2.3, the Behaviour Flow
view 2.4, cross-layer linking 2.5) is gated on these schemas existing and validating, so this is
sequenced first.

> **Layering note (do not flatten).** Plan step 2.1 lists the five types together, but they live in
> two layers per spec 001: **`OrchestrationFlow`, `OrchestrationStep`, `Event`, `StateTransition`
> are L3** (runtime behaviour); **`Decision` is L1** (canonical domain truth, vendor/tech-agnostic).
> Keep the directory placement the spec already prescribes (`/schemas/inventory/L3/…` vs
> `/schemas/inventory/L1/decision.schema.json`). Decision is modelled here because behaviour and
> decisions are extracted together (2.2/2.3) and because Decision is the phase's centrepiece.

> **Already shipped in Phase 0 (PR #15) — reuse, do NOT re-author.** The foundation build already
> delivered, tested and green:
> - `schemas/inventory/L1/decision.schema.json` — the canonical `Decision` shape. **Note its
>   established design choices (keep them):** the automated/manual/hybrid axis is the field
>   **`decisionType`** (the base-entry discriminator is `type: { const: "Decision" }`); and
>   **rules / referenceData / invariants are modelled as decision-specific *relationships*, not
>   entry fields**. (An earlier draft of §7 listed them as fields and called the axis `type` — that
>   was inaccurate; this doc is corrected to the shipped schema.)
> - The cardinality framework `RelationshipTypeRegistry` (`modules/schema/src/relationships.ts`),
>   which **already enforces `evaluates ≥ 1`** for a Decision (and `belongsTo` N:1, 1:N, and OCP
>   registration of new relationship types) — `modules/schema/test/cardinality.test.ts`.
> - Filesystem auto-discovery across `L0–L3` + `relationships` (`SchemaRegistry`), so new schema
>   files are picked up with no registry edit.
>
> This feature therefore **adds the missing behaviour layer**; it does not recreate Decision or the
> cardinality engine.

**In scope**
- **Four new L3 behaviour schemas** (Draft 2020-12), each `$ref`-composing
  `common/base-entry.schema.json` (spec 001 §Base Entry): `orchestration-flow`, `orchestration-step`,
  `event`, `state-transition`. (The L1 `decision` schema **already exists** from Phase 0 — reused as
  canonical, **not** re-authored.)
- Two relationship schemas under `/schemas/relationships/`: `behavioural.schema.json`
  (`triggers`, `emits`, `consumes`, `transitionsTo`, `compensates`, `invokes`) and
  `decision-specific.schema.json` (`evaluates`, `consumes`, `constrainedBy`, `triggeredBy`,
  `produces`, `realizedBy`) — extending the existing `relationship.schema.json` base.
- **The remaining cardinality + conditional constraints** from
  [plan.md §Relationship Cardinality](../../../plan.md). `evaluates ≥ 1` (a Decision must reference
  ≥ 1 Rule **or** BusinessInvariant) is **already implemented** in `RelationshipTypeRegistry`
  (Phase 0); this feature **adds** `produces ≥ 1` (every Decision has ≥ 1 outcome edge) and the
  conditional *"if `decisionType` is `automated`, then a `triggeredBy` edge is required"*
  (spec 001 Open Q1) — extending the same registry, not a new mechanism.
- Generated TypeScript types (schema-first — spec 001 Decision 2) and Python `jsonschema` parity in CI.
- Additive registration: schemas are **auto-discovered from the filesystem** (spec 001 Decision 4);
  no manifest edit.

**Out of scope**
- Storage-level schema / graph labels (per-loader concern — spec 001 §Out of scope).
- Extraction of these types from documents (Features 02/03); persistence of the edges (loader,
  Feature 05 dependency); UI form generation.
- L2 (`VendorProduct`, `ProjectSpec`) and L0 strategic schemas — Phases 3 and 6.
- A schema-migration tool — additive-only evolution is sufficient here.

## 3. Dependencies

- **Upstream**: **Phase 0a Schema Module** (registry, validator, base-entry/provenance/temporal
  common schemas, the auto-discovery + Ajv/`jsonschema` parity harness). The L1 structural schemas
  already shipped in Phase 0a/1 are referenced by the new relationship endpoints (e.g. `evaluates →
  Rule`, `realizedBy → Service`).
- **Unblocks**: **all** other Phase 2 features. 02/03 use these schemas as structured-output targets
  and validation gates; 04 reads validated behaviour entries; 05 traverses the new edges.
- **Cross-feature**: the cardinality/conditional rules defined here are *enforced* at extraction
  (02/03 validation gate) and at link time / quality check (05) — this feature owns the **definition**.

## 4. Applied decisions

> Phase 2 decisions are locked in [`docs/phase-2/decisions.md`](../../phase-2/decisions.md). The new
> choices this feature raised are now ratified there: **D-P2.2** (conditional/cardinality rules live in
> the cardinality/quality layer, not JSON Schema), **D-P2.3** (Command = `DomainConcept
> conceptType=command`), **D-P2.4** (two grouped relationship files with a `kind` enum). The decisions
> below also carry forward from Phase 1 / accepted ADRs and bind unchanged.

| Decision | How it constrains this feature |
|---|---|
| **spec 001 Decision 1 — JSON Schema (Draft 2020-12)** | Schemas authored in JSON Schema, not TypeBox/Zod, so Python extraction can validate the same files. |
| **spec 001 Decision 2 — schema-first** | Author `.schema.json`; **generate** TS types. JSON Schema is the contract. |
| **spec 001 Decision 3 — Ajv + `jsonschema`, unified fixtures** | Every new schema gets a fixture set run through both validators in CI; divergence = CI failure. |
| **spec 001 Decision 4 — filesystem auto-discovery** | New files are picked up by convention; **no** registry/manifest edit (OCP). |
| **D-P1.3 — language split** (carried forward) | Schemas + generated TS are TypeScript-side; the Python extractor consumes the same JSON Schema files. |
| **D-P1.4 — flesh out, don't build** (carried forward) | Definition only this round. |

## 5. User stories

- *As a domain architect, I want Decision modelled as a first-class, evidenced, versioned inventory
  type, so that the points where regulation bites and logic concentrates are explicit graph nodes,
  not buried in prose.*
- *As a knowledge engineer, I want behaviour types (flows, steps, events, state transitions) with
  the same base-entry contract as every other type, so that provenance, lifecycle and bi-temporal
  versioning work uniformly.*
- *As a platform maintainer, I want adding these types to require only new files (no edits to the
  registry or existing schemas), so that the OCP guarantee holds.*
- *As a compliance reviewer, I want the schema to enforce that an automated decision cannot exist
  without a trigger and at least one outcome, so that structurally incomplete decisions are rejected
  at the gate.*

## 6. Acceptance criteria (Given/When/Then)

1. **Valid fixtures pass** — *Given* a well-formed fixture for each of the five types, *when*
   validated by `SchemaValidator.validate(entry, type)`, *then* `valid: true` with no errors.
2. **Invalid fixtures fail with precise errors** — *Given* a Decision missing `outcomes`, *when*
   validated, *then* `valid: false` and a `ValidationError` whose `path`/`keyword` point at the
   missing required field.
3. **Base-entry inheritance** — *Given* any new-type fixture, *when* validated, *then* the common
   fields (`id`, `version`, `lifecycle_status`, `evidencedBy`, `validFrom`/`validTo`, `confidence`)
   are required exactly as defined in `common/base-entry.schema.json` (no per-type drift).
4. **Cross-validator parity** — *Given* the unified fixture set, *when* run through **both** Ajv (TS)
   and `jsonschema` (Python), *then* every fixture yields the **same** valid/invalid verdict (spec
   001 Decision 3).
5. **Auto-discovery (OCP)** — *Given* the five new files dropped in their layer directories, *when*
   the registry loads, *then* `SchemaRegistry.hasType('Decision')` (and the other four) is `true`
   and `listTypes()` includes them — **with no edit** to registry code or a manifest.
6. **Behavioural relationship schema** — *Given* a `triggers` edge `{source: Event, target:
   OrchestrationFlow}`, *when* validated by `validateRelationship`, *then* it passes; a `triggers`
   edge with an invalid endpoint type fails.
7. **Decision cardinality — `evaluates` ≥ 1** — *Given* a Decision with **zero** `evaluates` edges
   to a Rule **or** BusinessInvariant, *when* cardinality is checked, *then* it is rejected (plan
   constraint: "A Decision must reference at least one evaluable element").
8. **Decision cardinality — `produces` ≥ 1** — *Given* a Decision with no `produces` edge, *when*
   checked, *then* rejected ("every decision must have at least one outcome").
9. **Conditional trigger for automated decisions** — *Given* `decisionType = "automated"` with no
   `triggeredBy` edge, *when* checked, *then* rejected; *given* `decisionType = "manual"` with none,
   *then* accepted (spec 001 Open Q1 resolved as: enforce as a graph-level cardinality/quality rule,
   not pure structural JSON Schema — see §11).
10. **Additive-only** — *Given* the previously-shipped L1 structural schemas, *when* this feature
    lands, *then* none of them is modified (diff touches only new files) — proving additive evolution.

## 7. Interface contracts

Reuse spec 001 verbatim — no new interfaces are introduced; this feature adds **data** (schema
files) the existing `SchemaRegistry` / `SchemaValidator` already serve:

```typescript
// spec 001 — unchanged
interface SchemaRegistry { getSchema(type, version?); listTypes(); getVersionHistory(type); hasType(type); }
interface SchemaValidator {
  validate(entry: unknown, type: InventoryType, version?: string): ValidationResult;
  validateRelationship(relationship: unknown): ValidationResult;
  validateTransition(currentStatus: string, newStatus: string, type: InventoryType): ValidationResult;
}
```

New schema files this feature adds (paths fixed by spec 001 §Schema Organisation):

```
schemas/inventory/L3/orchestration-flow.schema.json
schemas/inventory/L3/orchestration-step.schema.json
schemas/inventory/L3/event.schema.json
schemas/inventory/L3/state-transition.schema.json
schemas/relationships/behavioural.schema.json
schemas/relationships/decision-specific.schema.json
```

Already present (Phase 0, **reused unchanged**): `schemas/inventory/L1/decision.schema.json`.

Field sets (from [plan.md §Inventory Catalogue](../../../plan.md), atop base-entry):

| Type | Type-specific fields |
|---|---|
| `Decision` (L1) — **already shipped** | `name`, `decisionType` (`automated`/`manual`/`hybrid`), `inputs[]`, `outcomes[]`, `owner`, `frequency`, `latencyBudget`. Its links to **rules / referenceData / invariants are decision-specific relationships, not fields** (see the description in the shipped schema). Do not modify. |
| `OrchestrationFlow` (L3) | `name`, `trigger`, `steps[]` (→OrchestrationStep ids), `owningService` |
| `OrchestrationStep` (L3) | `sequence`, `actionType`, `serviceOrComponent`, `input`, `output` |
| `Event` (L3) | `name`, `eventType` (`domain`/`integration`) — named `eventType` to avoid colliding with the base-entry `type` discriminator, matching the shipped `decisionType` convention — `emitter`, `consumers[]`, `transport` |
| `StateTransition` (L3) | `entity`, `fromState`, `toState`, `trigger`, `guardCondition` |

Relationship endpoint + cardinality table — implement exactly as
[plan.md §Relationship Cardinality and Constraints](../../../plan.md) (`evaluates`, `consumes`,
`constrainedBy`, `triggeredBy`, `produces`, `realizedBy`, `triggers`, `emits`, `consumes`,
`transitionsTo`, `compensates`, `invokes`).

## 8. TDD test plan (write these first)

- **Decision schema** is already covered by the existing `modules/schema/test/validation.test.ts`
  (valid fixture + rejects a Decision missing `outcomes`) — **no new Decision-schema test needed**;
  do not duplicate or modify it. Add Decision *fixtures only* if a new edge-cardinality test needs them.
- **Unit — `behaviour-schemas.test.ts`**: one valid + ≥2 invalid fixtures per L3 type
  (flow/step/event/state-transition); `Event.type` enum; `StateTransition` from≠to.
- **Unit — `behavioural-relationships.test.ts`** + **`decision-relationships.test.ts`**: each
  relationship kind validates only for its allowed `{sourceType,targetType}`; bad endpoints fail.
- **Unit — extend `modules/schema/test/cardinality.test.ts`**: `evaluates ≥ 1` is **already
  tested** (Phase 0) — add the **new** `produces ≥ 1` and the `decisionType=automated ⇒ triggeredBy
  required` conditional (criteria 8–9). These live in the cardinality/quality layer, not structural
  JSON Schema.
- **Contract — `cross-validator-parity.test.ts`** (CI, both ecosystems): the unified fixture set
  yields identical verdicts under Ajv and `jsonschema`.
- **Contract — `registry-autodiscovery.test.ts`**: dropping the files makes `hasType`/`listTypes`
  report them with **zero** registry-code change (OCP gate).

## 9. Task breakdown

1. [x] ~~Author `decision.schema.json` (L1)~~ — **already shipped in Phase 0 (#15); reuse unchanged.**
2. [ ] Author the four L3 behaviour schemas + fixtures.
3. [ ] Author `behavioural.schema.json` + `decision-specific.schema.json` extending the relationship
   base; encode allowed endpoint type pairs.
4. [ ] Extend the cardinality/quality layer (`RelationshipTypeRegistry`) with the **new** `produces ≥ 1`
   and `decisionType=automated ⇒ triggeredBy` rules (criteria 8–9); `evaluates ≥ 1` (criterion 7) is
   already implemented — leave it.
5. [ ] Wire all new fixtures into the Ajv + `jsonschema` parity harness.
6. [ ] Regenerate TypeScript types from the new L3 + relationship schemas (schema-first pipeline).
7. [ ] Add a registry auto-discovery test proving the new L3 files need no manifest/registry edit.
8. [ ] Update `schemas/` index / docs to list the new types and versions.

## 10. OCP extension points

- **Open**: adding further behaviour or decision sub-types, and new relationship kinds, by dropping
  new `.schema.json` files (auto-discovered); additive minor-version fields on these schemas.
- **Closed**: `common/base-entry.schema.json` and the existing L1 structural schemas (untouched —
  criterion 10); the `SchemaRegistry`/`SchemaValidator` interfaces; the relationship base schema.
  Adding a type must never require editing registry/validation code or an existing schema.

## 11. Open questions / risks

- **Conditional cross-field validation (spec 001 Open Q1).** *Recommendation:* enforce
  `automated ⇒ triggeredBy` and the `evaluates`/`produces` minimums as **graph-level cardinality /
  quality rules** (checked at link time and by the quality framework), **not** as pure structural
  JSON Schema — because the constraint is about *edges that must exist*, which a single-entry schema
  cannot see. JSON Schema `if/then` is used only for *intra-entry* conditionals. Team to confirm.
- **`Command` as a node type.** `produces(Decision → Event/Command/StateTransition)` and
  `triggers(Event/Command → …)` reference **Command**, which has no schema in spec 001's tree.
  *Recommendation:* model Command as a `DomainConcept` of `type=command` (it already exists in the L1
  enum) rather than a new top-level schema; confirm so the relationship endpoint set is closed.
- **Relationship schema granularity (spec 001 Open Q3).** One schema per relationship kind vs a
  single parameterised schema with a `kind` enum. *Recommendation:* the two grouped files
  (`behavioural`, `decision-specific`) with an internal `kind` enum + per-kind endpoint constraints —
  matches the spec tree and keeps additive growth cheap.
- **Decision accuracy floor** is set in Feature 03, not here — flagged so the schema's `confidence`
  semantics stay aligned with that gate.
