import { knownInventoryTypes, layerOfType } from "../explorer/encoding";

/**
 * The conceptual-model reference data behind the Overview screen (enhancement). It's the single
 * source the layered diagram and the concepts/relationships tables read. The **active** inventory
 * types and their layers come from the graph's own encoding (`knownInventoryTypes` / `layerOfType`)
 * so the page can never drift from what the explorer renders; this module adds the plain-English
 * descriptions, the (not-yet-extracted) L0 strategic layer, and the relationship glossary.
 */

export interface LayerMeta {
  /** Layer id (L0–L3) — matches the graph's `layerOfType` and colour encoding. */
  id: string;
  title: string;
  subtitle: string;
}

/** The four-layer domain model, top (strategy / "why") to bottom (runtime / "evidence"). */
export const LAYERS: LayerMeta[] = [
  { id: "L0", title: "Strategic Alignment", subtitle: "The why — initiatives, value & stakeholders" },
  { id: "L1", title: "Pure Domain", subtitle: "DDD canonical truth — vendor & tech agnostic" },
  { id: "L2", title: "Functional Realisation", subtitle: "Vendor products & project specs claiming to fulfil L1" },
  { id: "L3", title: "Technical Realisation", subtitle: "Systems, runtime behaviour & operational evidence" },
];

export type ConceptStatus = "active" | "planned";

export interface ConceptMeta {
  type: string;
  layer: string;
  description: string;
  /** `active` = extractable today (has a schema the pipeline targets); `planned` = future phase. */
  status: ConceptStatus;
}

/** Plain-English descriptions for the active inventory types (keyed by the encoding's type names). */
const ACTIVE_DESCRIPTIONS: Record<string, string> = {
  // L1 — pure domain
  Subdomain: "A cohesive area of the business domain (a DDD subdomain).",
  BoundedContext: "A boundary within which the domain model and its ubiquitous language stay consistent.",
  DomainConcept: "A core domain noun — an aggregate, entity or value object.",
  Decision: "A point where regulation or business logic determines an outcome — the highest-value node in the graph.",
  Rule: "A policy or constraint the domain enforces.",
  BusinessInvariant: "A condition that must always hold true within the domain.",
  BusinessCapability: "Something the business is able to do, independent of how it's implemented.",
  ReferenceData: "Controlled value sets and lookups the domain depends on.",
  // L2 — functional realisation
  VendorProduct: "A vendor product claiming to fulfil part of the pure domain (L1).",
  VendorCapabilityMapping: "A graded claim that a vendor product covers a business capability.",
  ProjectSpecification: "A project or specification asserting how it realises domain needs.",
  // L3 — technical realisation
  OrchestrationFlow: "An observed end-to-end process flow.",
  OrchestrationStep: "A single step within an orchestration flow.",
  Event: "A significant occurrence emitted by the running system.",
  StateTransition: "A change from one state to another.",
};

/** The L0 strategic concepts — modelled but not yet extracted (Phase 6). */
const PLANNED_L0: ConceptMeta[] = [
  { type: "Initiative", layer: "L0", status: "planned", description: "A strategic programme of work the organisation is investing in." },
  { type: "ValueStream", layer: "L0", status: "planned", description: "An end-to-end flow that delivers value to a stakeholder." },
  { type: "Stakeholder", layer: "L0", status: "planned", description: "A party with an interest in, or influence over, the domain." },
  { type: "Roadmap", layer: "L0", status: "planned", description: "A time-ordered plan of initiatives and milestones." },
];

/** All concepts in the model: the planned L0 layer plus every active inventory type the graph knows. */
export function conceptModel(): ConceptMeta[] {
  const active: ConceptMeta[] = knownInventoryTypes().map((type) => ({
    type,
    layer: layerOfType(type),
    status: "active",
    description: ACTIVE_DESCRIPTIONS[type] ?? "—",
  }));
  return [...PLANNED_L0, ...active];
}

export interface LayerGroup {
  layer: LayerMeta;
  concepts: ConceptMeta[];
}

/** Concepts grouped under their layer, in L0→L3 order — the shape the layered diagram renders. */
export function conceptsByLayer(): LayerGroup[] {
  const all = conceptModel();
  return LAYERS.map((layer) => ({
    layer,
    concepts: all.filter((concept) => concept.layer === layer.id),
  }));
}

export interface RelationshipMeta {
  type: string;
  category: string;
  /** "Source → Target" gist of what the edge connects. */
  connects: string;
  description: string;
}

/** The key relationship types in the graph, grouped by category — the relationships glossary. */
export function relationshipModel(): RelationshipMeta[] {
  return [
    // Structural (L1)
    { type: "governs", category: "Structural", connects: "Rule / Decision → DomainConcept", description: "A rule or decision governs a domain concept." },
    { type: "belongsTo", category: "Structural", connects: "DomainConcept → BoundedContext / Subdomain", description: "Nests a concept within its bounded context or subdomain." },
    // Behavioural (L3)
    { type: "triggers", category: "Behavioural", connects: "Step / Event → Step", description: "One step or event triggers the next." },
    { type: "emits", category: "Behavioural", connects: "OrchestrationStep → Event", description: "A step emits an event." },
    { type: "consumes", category: "Behavioural", connects: "Step / Decision → Event / ReferenceData", description: "A step or decision consumes an event or reference data." },
    { type: "transitionsTo", category: "Behavioural", connects: "StateTransition → state", description: "Moves an entity from one state to the next." },
    { type: "invokes", category: "Behavioural", connects: "OrchestrationFlow → OrchestrationStep", description: "A flow invokes a step or sub-flow." },
    { type: "compensates", category: "Behavioural", connects: "OrchestrationStep → OrchestrationStep", description: "A step compensates (undoes) another on failure." },
    // Decision-specific (L1)
    { type: "evaluates", category: "Decision", connects: "Decision → Rule", description: "A decision evaluates a rule or condition." },
    { type: "constrainedBy", category: "Decision", connects: "Decision → BusinessInvariant", description: "A decision is constrained by an invariant or rule." },
    { type: "produces", category: "Decision", connects: "Decision → Event", description: "A decision produces an outcome or event." },
    // Realisation (L2 → L1)
    { type: "fulfils", category: "Realisation", connects: "VendorProduct → BusinessCapability", description: "A vendor product fulfils a business capability." },
    { type: "specifies", category: "Realisation", connects: "ProjectSpecification → BusinessCapability", description: "A project spec specifies a capability or concept." },
  ];
}
