import type { ValidationResult } from "./types";

/**
 * Cardinality definition for a relationship (edge) type, derived from plan.md
 * "Relationship Cardinality and Constraints".
 *
 * - maxTargetsPerSource: how many edges of this type a single source node may have
 *   ("unbounded" for 1:N / M:N fan-out; 1 for N:1 like belongsTo).
 * - minTargetsPerSource: required minimum for a complete source node (the "Required"
 *   column). Checked at completeness time, not on every individual edge insert.
 */
export interface RelationshipTypeDef {
  name: string;
  sourceTypes?: string[];
  targetTypes?: string[];
  maxTargetsPerSource: number | "unbounded";
  minTargetsPerSource: number;
  description?: string;
}

// Decision-specific + structural edge types (plan.md §Decision-specific / §Structural).
//
// `sourceTypes`/`targetTypes` are the endpoint types the LINK gate (loader) checks — a COARSE
// union per name (the fine per-kind constraint is the emit-time JSON-Schema gate). Link-time
// endpoint typing is scoped to the **decision-specific** edges (a decision's traceability is
// the high-value, well-defined cross-layer signal). Structural containment edges
// (`belongsTo`, `implements`, `emits`, `evidencedBy`) are deliberately endpoint-OPEN: they are
// used broadly across the model (e.g. any inventory type `belongsTo` a BoundedContext), so a
// narrow link-time type gate would wrongly quarantine valid edges. `consumes` is overloaded
// (Decision→ReferenceData and Service→Event), so its endpoint sets are the union.
const DEFAULT_DEFS: RelationshipTypeDef[] = [
  { name: "evaluates", sourceTypes: ["Decision"], targetTypes: ["Rule", "BusinessInvariant"], maxTargetsPerSource: "unbounded", minTargetsPerSource: 1, description: "Decision → Rule (≥1)" },
  { name: "consumes", sourceTypes: ["Decision", "Service"], targetTypes: ["ReferenceData", "Event"], maxTargetsPerSource: "unbounded", minTargetsPerSource: 0, description: "Decision → ReferenceData / Service → Event" },
  { name: "constrainedBy", sourceTypes: ["Decision", "DomainConcept"], targetTypes: ["BusinessInvariant"], maxTargetsPerSource: "unbounded", minTargetsPerSource: 0, description: "Decision/DomainConcept → BusinessInvariant" },
  { name: "produces", sourceTypes: ["Decision"], targetTypes: ["Event", "Command", "StateTransition"], maxTargetsPerSource: "unbounded", minTargetsPerSource: 1, description: "Decision → outcome (≥1)" },
  { name: "triggeredBy", sourceTypes: ["Event", "OrchestrationStep"], targetTypes: ["Decision"], maxTargetsPerSource: 1, minTargetsPerSource: 0, description: "Event/Step → Decision" },
  { name: "realizedBy", sourceTypes: ["Decision"], targetTypes: ["Service", "Component"], maxTargetsPerSource: "unbounded", minTargetsPerSource: 0, description: "Decision → Service" },
  // Structural containment / provenance — endpoint-open at the link gate (used broadly).
  { name: "implements", maxTargetsPerSource: "unbounded", minTargetsPerSource: 1, description: "Service → DomainConcept (≥1)" },
  { name: "belongsTo", maxTargetsPerSource: 1, minTargetsPerSource: 1, description: "→ BoundedContext (exactly one)" },
  { name: "emits", maxTargetsPerSource: "unbounded", minTargetsPerSource: 0, description: "Service → Event" },
  { name: "evidencedBy", maxTargetsPerSource: "unbounded", minTargetsPerSource: 1, description: "Any → Source (≥1)" },
];

/**
 * Behavioural edge types (plan.md §Behavioural). Phase 2.1 adds these additively — they are
 * NOT baked into DEFAULT_DEFS. Register them onto a registry via `register()` (or the
 * `registerBehaviouralRelationships` helper) to prove OCP extension without touching the
 * shipped defaults. None carries a minimum: behavioural edges are optional structure.
 */
export const BEHAVIOURAL_RELATIONSHIP_DEFS: RelationshipTypeDef[] = [
  { name: "triggers", sourceTypes: ["Event", "Command"], targetTypes: ["OrchestrationFlow"], maxTargetsPerSource: "unbounded", minTargetsPerSource: 0, description: "Event/Command → OrchestrationFlow" },
  { name: "transitionsTo", sourceTypes: ["OrchestrationStep"], targetTypes: ["StateTransition"], maxTargetsPerSource: "unbounded", minTargetsPerSource: 0, description: "OrchestrationStep → StateTransition" },
  { name: "compensates", sourceTypes: ["OrchestrationStep"], targetTypes: ["OrchestrationStep"], maxTargetsPerSource: "unbounded", minTargetsPerSource: 0, description: "OrchestrationStep → OrchestrationStep" },
  { name: "invokes", sourceTypes: ["OrchestrationStep"], targetTypes: ["Decision"], maxTargetsPerSource: "unbounded", minTargetsPerSource: 0, description: "OrchestrationStep → Decision" },
];

/**
 * Cross-layer edge types (plan.md §Structural / §Regulatory). Phase 2.5 adds these
 * additively — the regulatory edges (`satisfiedBy`, `obliges`, `exposes`) and the
 * remaining structural edges (`usesReferenceData`, `governs`) that span L1↔L2↔L3.
 * Endpoint types come from plan.md; cardinalities are unbounded with no minimum (these
 * are optional cross-layer links, not completeness requirements). `satisfiedBy` registers
 * the L2 `ProjectSpec` target now (forward-compatible — not gated on L2 data existing,
 * which arrives in Phase 3; see docs/phase-2/decisions.md "Deferred to their own feature").
 */
export const CROSS_LAYER_RELATIONSHIP_DEFS: RelationshipTypeDef[] = [
  { name: "satisfiedBy", sourceTypes: ["RegulatoryRequirement"], targetTypes: ["ProjectSpec", "Rule", "PolicyStatement", "Decision"], maxTargetsPerSource: "unbounded", minTargetsPerSource: 0, description: "RegulatoryRequirement → ProjectSpec/Rule/PolicyStatement/Decision" },
  { name: "obliges", sourceTypes: ["RegulatoryRequirement"], targetTypes: ["DomainConcept", "BusinessCapability"], maxTargetsPerSource: "unbounded", minTargetsPerSource: 0, description: "RegulatoryRequirement → DomainConcept/BusinessCapability" },
  { name: "exposes", sourceTypes: ["Service"], targetTypes: ["RegulatoryRequirement"], maxTargetsPerSource: "unbounded", minTargetsPerSource: 0, description: "Service → RegulatoryRequirement (surface area)" },
  { name: "usesReferenceData", sourceTypes: ["Service", "Rule", "Decision"], targetTypes: ["ReferenceData"], maxTargetsPerSource: "unbounded", minTargetsPerSource: 0, description: "Service/Rule/Decision → ReferenceData" },
  // governs is a broad structural edge (plan: Rule→DomainConcept; also Capability→Decision) →
  // endpoint-open at the link gate, like the other structural containment edges.
  { name: "governs", maxTargetsPerSource: "unbounded", minTargetsPerSource: 0, description: "Rule/Capability → DomainConcept/Decision/Step" },
];

/**
 * L2 structural edge types (plan.md §Structural). Phase 3.1 adds these additively — the
 * functional-realisation edges that link vendor/project (L2) entries to the L1 they claim
 * to fulfil. Endpoint types come from plan.md; cardinalities are unbounded with no minimum
 * (an L1 capability may be fulfilled by zero or many vendor products — completeness is the
 * Gap Analysis view's concern, not a structural requirement). Endpoint-typed at the link
 * gate (a decision/realisation's traceability is the high-value cross-layer signal — same
 * scoping as the decision-specific + regulatory edges).
 */
export const L2_STRUCTURAL_RELATIONSHIP_DEFS: RelationshipTypeDef[] = [
  { name: "fulfils", sourceTypes: ["VendorProduct"], targetTypes: ["BusinessCapability"], maxTargetsPerSource: "unbounded", minTargetsPerSource: 0, description: "VendorProduct → BusinessCapability" },
  { name: "specifies", sourceTypes: ["ProjectSpec"], targetTypes: ["DomainConcept"], maxTargetsPerSource: "unbounded", minTargetsPerSource: 0, description: "ProjectSpec → DomainConcept" },
  { name: "realizesVendorCap", sourceTypes: ["Service"], targetTypes: ["VendorCapabilityMapping"], maxTargetsPerSource: "unbounded", minTargetsPerSource: 0, description: "Service → VendorCapabilityMapping" },
];

/**
 * RelationshipTypeRegistry — declares cardinality constraints per relationship type.
 * New edge types register via `register()` without modifying existing logic (OCP).
 * Unknown relationship types carry no cardinality constraint (valid by default).
 */
export class RelationshipTypeRegistry {
  private readonly defs = new Map<string, RelationshipTypeDef>();

  constructor(defs: RelationshipTypeDef[] = DEFAULT_DEFS) {
    for (const def of defs) {
      this.defs.set(def.name, def);
    }
  }

  register(def: RelationshipTypeDef): void {
    this.defs.set(def.name, def);
  }

  has(name: string): boolean {
    return this.defs.has(name);
  }

  get(name: string): RelationshipTypeDef | undefined {
    return this.defs.get(name);
  }

  list(): RelationshipTypeDef[] {
    return [...this.defs.values()];
  }

  /**
   * Check whether adding one more edge of this type from a source that already has
   * `currentTargetCount` edges would violate the maximum cardinality.
   */
  canAddEdge(relationshipType: string, currentTargetCount: number): ValidationResult {
    const def = this.defs.get(relationshipType);
    if (!def || def.maxTargetsPerSource === "unbounded") {
      return ok();
    }
    if (currentTargetCount + 1 > def.maxTargetsPerSource) {
      return fail(
        `Cardinality violation: '${relationshipType}' allows at most ${def.maxTargetsPerSource} target(s) per source (would become ${currentTargetCount + 1})`,
        "maxCardinality",
      );
    }
    return ok();
  }

  /**
   * Check whether a source node satisfies the minimum required edges of this type.
   * Used to validate completeness (e.g. a Decision must `evaluate` ≥ 1 rule).
   */
  checkMinimum(relationshipType: string, targetCount: number): ValidationResult {
    const def = this.defs.get(relationshipType);
    if (!def || def.minTargetsPerSource === 0) {
      return ok();
    }
    if (targetCount < def.minTargetsPerSource) {
      return fail(
        `Cardinality violation: '${relationshipType}' requires at least ${def.minTargetsPerSource} target(s) per source (found ${targetCount})`,
        "minCardinality",
      );
    }
    return ok();
  }

  /**
   * Conditional cross-field rule (plan.md §Relationship Cardinality; spec 001 Open Q1):
   * an `automated` Decision must have at least one `triggeredBy` edge. This depends on a
   * field of the Decision (`decisionType`) AND the count of incident edges, so it is a
   * graph-level cardinality/quality rule — it cannot be expressed in a single-entry JSON
   * Schema. `manual` and `hybrid` decisions carry no such requirement.
   */
  checkAutomatedDecisionTrigger(decisionType: string, triggeredByCount: number): ValidationResult {
    if (decisionType === "automated" && triggeredByCount < 1) {
      return fail(
        "Cardinality violation: an automated Decision requires at least one 'triggeredBy' edge",
        "conditionalCardinality",
      );
    }
    return ok();
  }
}

/**
 * Register the behavioural edge types (plan.md §Behavioural) onto a registry. Pure
 * extension via `register()` — the shipped DEFAULT_DEFS are never modified (OCP).
 */
export function registerBehaviouralRelationships(registry: RelationshipTypeRegistry): void {
  for (const def of BEHAVIOURAL_RELATIONSHIP_DEFS) {
    registry.register(def);
  }
}

/**
 * Register the cross-layer edge types (plan.md §Structural / §Regulatory) onto a registry.
 * Pure extension via `register()` — the shipped DEFAULT_DEFS are never modified (OCP).
 */
export function registerCrossLayerRelationships(registry: RelationshipTypeRegistry): void {
  for (const def of CROSS_LAYER_RELATIONSHIP_DEFS) {
    registry.register(def);
  }
}

/**
 * Register the L2 structural edge types (plan.md §Structural) onto a registry. Pure
 * extension via `register()` — the shipped DEFAULT_DEFS are never modified (OCP).
 */
export function registerL2Relationships(registry: RelationshipTypeRegistry): void {
  for (const def of L2_STRUCTURAL_RELATIONSHIP_DEFS) {
    registry.register(def);
  }
}

/**
 * The single shared rule set the loader / link gate consumes (D-P2.2): the shipped
 * decision-specific + structural defaults, plus the behavioural and cross-layer edge types,
 * registered additively. The same **cardinality** rules (`canAddEdge`, `checkMinimum`,
 * `checkAutomatedDecisionTrigger`) are thereby enforced at both the emit gate (Features 02/03)
 * and the load/link gate.
 *
 * Endpoint-type checking at the link gate is scoped to the **decision-specific + regulatory
 * cross-layer** edges (a decision's traceability and regulatory coverage — the cross-layer
 * signal Phase 2.5 is about). Behavioural edges are registered **cardinality-only** here so
 * the link gate does not re-type intra-behaviour-layer edges — that typing is the emit gate's
 * JSON-Schema job (`behavioural.schema.json`), and behavioural edges are legitimately used more
 * broadly in practice (e.g. a decision that `triggers` another decision).
 */
export function createFullRelationshipRegistry(): RelationshipTypeRegistry {
  const registry = new RelationshipTypeRegistry();
  for (const def of BEHAVIOURAL_RELATIONSHIP_DEFS) {
    registry.register({
      name: def.name,
      maxTargetsPerSource: def.maxTargetsPerSource,
      minTargetsPerSource: def.minTargetsPerSource,
      description: def.description,
    });
  }
  registerCrossLayerRelationships(registry);
  // L2 structural edges are endpoint-typed at the link gate (functional-realisation
  // traceability — same high-value cross-layer signal as the regulatory edges).
  registerL2Relationships(registry);
  return registry;
}

function ok(): ValidationResult {
  return { valid: true, errors: [] };
}

function fail(message: string, keyword: string): ValidationResult {
  return { valid: false, errors: [{ path: "/relationshipType", message, schemaPath: "", keyword }] };
}
