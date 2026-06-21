import type { GraphMutationEvent } from "@dkm/knowledge-graph";
import type { QueryContext, QueryService } from "@dkm/query";
import type { InventoryEntry } from "@dkm/schema";
import type {
  BehaviourFlowDecision,
  BehaviourFlowEventRef,
  BehaviourFlowHeader,
  BehaviourFlowOutcome,
  BehaviourFlowParams,
  BehaviourFlowStep,
  BehaviourFlowTransition,
  BehaviourFlowView,
  ViewMetadata,
  ViewProjector,
} from "./types";

const ORCHESTRATION_FLOW = "OrchestrationFlow";
const ORCHESTRATION_STEP = "OrchestrationStep";
const EVENT = "Event";
const STATE_TRANSITION = "StateTransition";
const DECISION = "Decision";

// Behavioural + decision edge types (schemas/relationships/{behavioural,decision-specific}).
const EMITS = "emits";
const TRANSITIONS_TO = "transitionsTo";
const INVOKES = "invokes";
const COMPENSATES = "compensates";
const TRIGGERS = "triggers";
const PRODUCES = "produces";

const DECISION_TYPES = new Set(["automated", "manual", "hybrid"]);

/** Node types whose mutation could change a Behaviour Flow view (used by `invalidatedBy`). */
const RELEVANT_NODE_TYPES = new Set([
  ORCHESTRATION_FLOW,
  ORCHESTRATION_STEP,
  EVENT,
  STATE_TRANSITION,
  DECISION,
]);

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function sequenceOf(node: InventoryEntry): number {
  const value = node.sequence;
  return typeof value === "number" ? value : 0;
}

/** Map the Decision node's `decisionType` axis field to the view's `type` union. */
function decisionTypeOf(node: InventoryEntry): "automated" | "manual" | "hybrid" {
  const value = node.decisionType;
  return typeof value === "string" && DECISION_TYPES.has(value)
    ? (value as "automated" | "manual" | "hybrid")
    : "automated";
}

function toEventRef(node: InventoryEntry): BehaviourFlowEventRef {
  return { eventId: node.id, name: str(node.name) ?? node.id };
}

function toTransition(node: InventoryEntry): BehaviourFlowTransition {
  const transition: BehaviourFlowTransition = {
    fromState: str(node.fromState) ?? "",
    toState: str(node.toState) ?? "",
  };
  const guard = str(node.guardCondition);
  if (guard) transition.guardCondition = guard;
  return transition;
}

function byEventId(a: BehaviourFlowEventRef, b: BehaviourFlowEventRef): number {
  return a.eventId.localeCompare(b.eventId);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * Behaviour Flow projector (feature 04; spec 007 §Defined Views). Projects **one**
 * orchestration flow — its ordered steps, the events each step emits/consumes, its
 * state transitions and its **decision points** — into a {@link BehaviourFlowView}
 * by composing **only** the Query Interface primitives (`getEntry`, `traverse`). It
 * never touches the graph port directly, so adapter parity (in-memory ↔ Neo4j) is
 * inherited from the Query Interface (D-P1.2).
 *
 * Step membership is read from the flow node's ordered `steps: string[]` (NOT a
 * membership edge — the L3 schema stores ids), then re-ordered by each step's
 * `sequence`. Wiring is read from behavioural/decision edges: `emits` (step → Event),
 * `transitionsTo` (step → StateTransition), `invokes` (step → Decision), `compensates`
 * (step → step), the flow's `triggers` Event (→ first step's `consumes`, best-effort)
 * and the Decision's `produces` Events (→ outcome branches).
 *
 * Registered with refresh policy `on-demand` (spec 007 Decision 1 — the flow view is
 * cheap/scoped). `invalidatedBy` is defined per the port but unused while on-demand
 * (no cache to invalidate).
 *
 * **OCP**: this projector adds a view purely by implementing {@link ViewProjector} and
 * registering — the engine and the Domain Map projector are untouched.
 */
export class BehaviourFlowProjector implements ViewProjector<BehaviourFlowParams, BehaviourFlowView> {
  readonly viewType = "behaviour-flow";

  constructor(private readonly service: QueryService) {}

  describe(): ViewMetadata {
    return {
      viewType: this.viewType,
      description:
        "An orchestration flow: ordered steps with emitted/consumed events, state transitions and decision points highlighted.",
      parameters: [
        { name: "flowId", type: "string", required: true, description: "The OrchestrationFlow id to project." },
      ],
      refreshPolicy: "on-demand",
      estimatedComputeTime: "<1s",
    };
  }

  async project(params: BehaviourFlowParams, context: QueryContext): Promise<BehaviourFlowView> {
    const flowId = params.flowId ?? "";
    const flowResult = flowId ? await this.service.getEntry(flowId, context) : null;
    const flowNode = flowResult?.entry;

    if (!flowNode || flowNode.type !== ORCHESTRATION_FLOW) {
      // Unknown flow (criterion 4): empty, clearly "not found" — echo the id, never throw.
      return { flow: { id: flowId, name: "", trigger: "" }, steps: [] };
    }

    const header: BehaviourFlowHeader = {
      id: flowNode.id,
      name: str(flowNode.name) ?? flowNode.id,
      trigger: str(flowNode.trigger) ?? "",
    };
    const owningService = str(flowNode.owningService);
    if (owningService) header.owningService = owningService;

    // Best-effort: the flow's trigger Event becomes the first step's `consumes`.
    const triggerEvents = await this.neighbours(flowNode.id, "in", [TRIGGERS], EVENT, context);
    const firstConsumes = triggerEvents.map(toEventRef).sort(byEventId);

    // Steps are ordered ids on the flow node; resolve each, then order by `sequence`.
    const stepNodes: InventoryEntry[] = [];
    for (const stepId of asStringArray(flowNode.steps)) {
      const result = await this.service.getEntry(stepId, context);
      if (result?.entry && result.entry.type === ORCHESTRATION_STEP) stepNodes.push(result.entry);
    }
    stepNodes.sort((a, b) => sequenceOf(a) - sequenceOf(b) || a.id.localeCompare(b.id));

    const steps: BehaviourFlowStep[] = [];
    for (let i = 0; i < stepNodes.length; i++) {
      const node = stepNodes[i];
      if (!node) continue;
      steps.push(await this.projectStep(node, i === 0 ? firstConsumes : [], context));
    }

    return { flow: header, steps };
  }

  /** Defined per the port; unused while the view is on-demand (no cache to invalidate). */
  invalidatedBy(event: GraphMutationEvent): boolean {
    return RELEVANT_NODE_TYPES.has(event.entityType) || event.entityType.startsWith("Relationship:");
  }

  /** Freshness metadata: count the flow (when found) + each projected step. */
  entriesIncluded(result: BehaviourFlowView): number {
    return result.steps.length + (result.flow.name.length > 0 ? 1 : 0);
  }

  // ---- Internals -------------------------------------------------------------

  /** Project a single step: partition its outgoing edges into the view's wiring. */
  private async projectStep(
    stepNode: InventoryEntry,
    consumes: BehaviourFlowEventRef[],
    context: QueryContext,
  ): Promise<BehaviourFlowStep> {
    const subgraph = await this.service.traverse(
      { startNodeId: stepNode.id, direction: "out", maxDepth: 1, includeEdges: true },
      context,
    );
    const nodeById = new Map(subgraph.nodes.map((node) => [node.id, node]));

    const emits: BehaviourFlowEventRef[] = [];
    const transitions: BehaviourFlowTransition[] = [];
    let decisionNode: InventoryEntry | undefined;
    let compensates: string | undefined;

    for (const edge of subgraph.edges) {
      if (edge.sourceId !== stepNode.id) continue;
      const target = nodeById.get(edge.targetId);
      if (!target) continue;
      switch (edge.relationshipType) {
        case EMITS:
          if (target.type === EVENT) emits.push(toEventRef(target));
          break;
        case TRANSITIONS_TO:
          if (target.type === STATE_TRANSITION) transitions.push(toTransition(target));
          break;
        case INVOKES:
          if (target.type === DECISION && !decisionNode) decisionNode = target;
          break;
        case COMPENSATES:
          if (target.type === ORCHESTRATION_STEP && !compensates) compensates = target.id;
          break;
        default:
          break;
      }
    }

    emits.sort(byEventId);
    transitions.sort(
      (a, b) => a.toState.localeCompare(b.toState) || a.fromState.localeCompare(b.fromState),
    );

    const step: BehaviourFlowStep = {
      id: stepNode.id,
      sequence: sequenceOf(stepNode),
      actionType: str(stepNode.actionType) ?? "",
      emits,
      consumes,
      transitions,
      isDecisionPoint: decisionNode !== undefined,
    };
    const serviceOrComponent = str(stepNode.serviceOrComponent);
    if (serviceOrComponent) step.serviceOrComponent = serviceOrComponent;
    if (compensates) step.compensates = compensates;
    if (decisionNode) step.decision = await this.projectDecision(decisionNode, context);

    return step;
  }

  /** Project an invoked Decision: id/name/type + outcome branches (criterion 3). */
  private async projectDecision(
    decisionNode: InventoryEntry,
    context: QueryContext,
  ): Promise<BehaviourFlowDecision> {
    const producedEvents = await this.neighbours(decisionNode.id, "out", [PRODUCES], EVENT, context);
    const eventIdByName = new Map<string, string>();
    for (const eventNode of producedEvents) {
      const name = str(eventNode.name);
      if (name) eventIdByName.set(name.trim().toLowerCase(), eventNode.id);
    }

    const outcomes: BehaviourFlowOutcome[] = asStringArray(decisionNode.outcomes).map((label) => {
      const producesEventId = eventIdByName.get(label.trim().toLowerCase());
      return producesEventId ? { label, producesEventId } : { label };
    });

    return {
      id: decisionNode.id,
      name: str(decisionNode.name) ?? decisionNode.id,
      type: decisionTypeOf(decisionNode),
      outcomes,
    };
  }

  /** Depth-1 neighbours of `startNodeId` reached over `edgeTypes`, filtered to `nodeType`. */
  private async neighbours(
    startNodeId: string,
    direction: "in" | "out",
    edgeTypes: string[],
    nodeType: string,
    context: QueryContext,
  ): Promise<InventoryEntry[]> {
    const subgraph = await this.service.traverse(
      { startNodeId, direction, edgeTypes, maxDepth: 1, includeEdges: false },
      context,
    );
    return subgraph.nodes.filter((node) => node.id !== startNodeId && node.type === nodeType);
  }
}
