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

const DEFAULT_DEFS: RelationshipTypeDef[] = [
  { name: "evaluates", maxTargetsPerSource: "unbounded", minTargetsPerSource: 1, description: "Decision → Rule (≥1)" },
  { name: "consumes", maxTargetsPerSource: "unbounded", minTargetsPerSource: 0, description: "Decision → ReferenceData" },
  { name: "constrainedBy", maxTargetsPerSource: "unbounded", minTargetsPerSource: 0, description: "→ BusinessInvariant" },
  { name: "produces", maxTargetsPerSource: "unbounded", minTargetsPerSource: 1, description: "Decision → outcome (≥1)" },
  { name: "triggeredBy", maxTargetsPerSource: 1, minTargetsPerSource: 0, description: "Event/Step → Decision" },
  { name: "realizedBy", maxTargetsPerSource: "unbounded", minTargetsPerSource: 0, description: "Decision → Service" },
  { name: "implements", maxTargetsPerSource: "unbounded", minTargetsPerSource: 1, description: "Service → DomainConcept (≥1)" },
  { name: "belongsTo", maxTargetsPerSource: 1, minTargetsPerSource: 1, description: "Service → BoundedContext (exactly one)" },
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

function ok(): ValidationResult {
  return { valid: true, errors: [] };
}

function fail(message: string, keyword: string): ValidationResult {
  return { valid: false, errors: [{ path: "/relationshipType", message, schemaPath: "", keyword }] };
}
