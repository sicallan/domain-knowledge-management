import type { GraphQueryService, QueryContext } from "@dkm/query";
import type { InventoryEntry, RelationshipEntry } from "@dkm/schema";

/**
 * Behaviour & Decisions PlantUML renderer (demo) — the **Phase 2** picture.
 *
 * Phase 1's domain map shows the static L1 structure. This renders what the Phase 2 extraction
 * passes add on top: an **orchestration flow** (behaviour pass, 2.2) — its ordered steps, the
 * event that triggers it, the events/state-transitions its steps emit — and the **decisions**
 * those steps invoke (decision pass, 2.3), each shown with its full traceability: the rules it
 * evaluates, the reference data it consumes, the invariants that constrain it, what triggers it,
 * and what it produces. Decisions are the highest-value nodes, so they are emphasised (gold
 * hexagons, bold amber edges).
 *
 * Like the domain-map exporter this is a **demo-local consumer** reading back through the Query
 * Interface (`listEntries` + `traverse`) — the dedicated Behaviour Flow *view* is Feature 2.4.
 */

const CONTEXT: QueryContext = {
  userId: "demo",
  roles: ["reader"],
  scopes: ["*"],
  requestId: "demo-behaviour-flow",
};

/** Edge kinds that tell the behaviour + decision story (others — belongsTo, operatesOn — omitted). */
const BEHAVIOUR_EDGES = new Set(["triggers", "invokes", "emits", "transitionsTo", "compensates"]);
const DECISION_EDGES = new Set([
  "evaluates",
  "consumes",
  "constrainedBy",
  "produces",
  "triggeredBy",
  "realizedBy",
]);
const STORY_EDGES = new Set([...BEHAVIOUR_EDGES, ...DECISION_EDGES]);

interface TypeStyle {
  shape: "rectangle" | "hexagon" | "card" | "usecase";
  colour: string;
  stereotype: string;
}

const TYPE_STYLE: Record<string, TypeStyle> = {
  OrchestrationFlow: { shape: "rectangle", colour: "#B0BEC5", stereotype: "Flow" },
  OrchestrationStep: { shape: "rectangle", colour: "#C5CAE9", stereotype: "Step" },
  Event: { shape: "usecase", colour: "#FFE082", stereotype: "Event" },
  StateTransition: { shape: "rectangle", colour: "#B39DDB", stereotype: "StateTransition" },
  Decision: { shape: "hexagon", colour: "#FFD54F", stereotype: "Decision" },
  Rule: { shape: "rectangle", colour: "#A5D6A7", stereotype: "Rule" },
  BusinessInvariant: { shape: "rectangle", colour: "#CE93D8", stereotype: "BusinessInvariant" },
  ReferenceData: { shape: "card", colour: "#FFAB91", stereotype: "ReferenceData" },
};
const FALLBACK_STYLE: TypeStyle = { shape: "rectangle", colour: "#ECEFF1", stereotype: "Entry" };

function prop(node: InventoryEntry, key: string): unknown {
  return (node as unknown as Record<string, unknown>)[key];
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function nodeName(node: InventoryEntry): string {
  return str(prop(node, "name")) ?? node.id;
}

function alias(id: string): string {
  return `b_${id.replace(/[^A-Za-z0-9_]/g, "_")}`;
}

function escapeLabel(text: string): string {
  return text.replace(/"/g, "'");
}

/** Second label line: the most useful type-specific detail for this node. */
function nodeDetail(node: InventoryEntry): string | undefined {
  switch (node.type) {
    case "Decision": {
      const decisionType = str(prop(node, "decisionType"));
      const raw = prop(node, "outcomes");
      const outcomes = Array.isArray(raw) ? raw.map((o) => String(o)).join(" / ") : undefined;
      return [decisionType ? `«${decisionType}»` : undefined, outcomes]
        .filter((p): p is string => Boolean(p))
        .join("  ");
    }
    case "OrchestrationStep": {
      const seq = prop(node, "sequence");
      const action = str(prop(node, "actionType"));
      return [typeof seq === "number" ? `#${seq}` : undefined, action ? `«${action}»` : undefined]
        .filter((p): p is string => Boolean(p))
        .join(" ");
    }
    case "Event":
      return str(prop(node, "eventType")) ? `«${str(prop(node, "eventType"))}»` : undefined;
    case "StateTransition": {
      const from = str(prop(node, "fromState"));
      const to = str(prop(node, "toState"));
      return from && to ? `${from} → ${to}` : undefined;
    }
    case "ReferenceData": {
      const owner = str(prop(node, "owner"));
      return owner ? `owner: ${owner}` : undefined;
    }
    case "Rule":
    case "BusinessInvariant":
      return str(prop(node, "expression"));
    default:
      return undefined;
  }
}

interface BehaviourSubgraph {
  flows: InventoryEntry[];
  nodes: Map<string, InventoryEntry>;
  edges: RelationshipEntry[];
}

/**
 * Collect the behaviour + decision subgraph by reading back through the Query Interface: seed from
 * the orchestration flows and their member steps (the flow holds step ids in `steps`), then expand
 * only along the behaviour/decision *story* edges so the picture stays the flow's neighbourhood —
 * not the whole graph.
 */
export async function collectBehaviourSubgraph(
  service: GraphQueryService,
): Promise<BehaviourSubgraph | null> {
  const flowPage = await service.listEntries({ type: "OrchestrationFlow" }, CONTEXT);
  const flows = flowPage.items;
  if (flows.length === 0) return null;

  const nodes = new Map<string, InventoryEntry>();
  const edges = new Map<string, RelationshipEntry>();
  const visited = new Set<string>();

  for (const flow of flows) {
    nodes.set(flow.id, flow);
    visited.add(flow.id);
    const stepIds = prop(flow, "steps");
    if (Array.isArray(stepIds)) {
      for (const stepId of stepIds) {
        const entry = await service.getEntry(String(stepId), CONTEXT);
        if (entry?.entry && !nodes.has(entry.entry.id)) {
          nodes.set(entry.entry.id, entry.entry);
          visited.add(entry.entry.id);
        }
      }
    }
  }

  let frontier = [...nodes.keys()];
  for (let depth = 0; depth < 3 && frontier.length > 0; depth += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const direction of ["in", "out"] as const) {
        const sub = await service.traverse(
          { startNodeId: id, direction, maxDepth: 1, includeEdges: true },
          CONTEXT,
        );
        const byId = new Map(sub.nodes.map((n) => [n.id, n] as const));
        for (const edge of sub.edges) {
          if (!STORY_EDGES.has(edge.relationshipType)) continue;
          edges.set(edge.id, edge);
          for (const endId of [edge.sourceId, edge.targetId]) {
            if (!nodes.has(endId)) {
              const node = byId.get(endId) ?? (await service.getEntry(endId, CONTEXT))?.entry;
              if (node) nodes.set(endId, node);
            }
            if (!visited.has(endId)) {
              visited.add(endId);
              next.push(endId);
            }
          }
        }
      }
    }
    frontier = next;
  }

  return { flows, nodes, edges: [...edges.values()] };
}

/** A short textual summary of the behaviour layer for the console. */
export function summariseBehaviour(graph: BehaviourSubgraph): string {
  const counts = new Map<string, number>();
  for (const node of graph.nodes.values()) {
    counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
  }
  const order = [
    "OrchestrationFlow",
    "OrchestrationStep",
    "Event",
    "StateTransition",
    "Decision",
    "Rule",
    "ReferenceData",
    "BusinessInvariant",
  ];
  const parts = order
    .filter((type) => counts.has(type))
    .map((type) => `${counts.get(type)} ${type}`);
  const decisionEdges = graph.edges.filter((e) => DECISION_EDGES.has(e.relationshipType)).length;
  const behaviourEdges = graph.edges.filter((e) => BEHAVIOUR_EDGES.has(e.relationshipType)).length;
  return `${parts.join(" · ")}  (${behaviourEdges} behavioural + ${decisionEdges} decision edges)`;
}

/** Render the behaviour + decision subgraph as a left-to-right PlantUML picture. */
export function renderBehaviourFlow(graph: BehaviourSubgraph): string {
  const decisionIds = new Set(
    [...graph.nodes.values()].filter((n) => n.type === "Decision").map((n) => n.id),
  );
  const steps = [...graph.nodes.values()]
    .filter((n) => n.type === "OrchestrationStep")
    .sort((a, b) => Number(prop(a, "sequence") ?? 0) - Number(prop(b, "sequence") ?? 0));

  const lines: string[] = [
    "@startuml payments-behaviour-flow",
    "title Payments — Behaviour & Decisions · Phase 2 extraction (behaviour pass 2.2 + decision pass 2.3)",
    "skinparam shadowing false",
    "skinparam defaultFontName Helvetica",
    "left to right direction",
    "legend right",
    "  Phase 1 builds the static domain map; Phase 2 adds runtime <b>behaviour</b> and",
    "  first-class <b>Decisions</b>. Gold hexagons are Decisions (the highest-value nodes);",
    "  bold amber arrows are decision-sourced edges (its traceability).",
    "  Blue boxes = steps · yellow ovals = events · purple = state transitions.",
    "endlegend",
    "",
  ];

  // Declare every node with its type style.
  for (const node of graph.nodes.values()) {
    const style = TYPE_STYLE[node.type] ?? FALLBACK_STYLE;
    const detail = nodeDetail(node);
    const label = escapeLabel(detail ? `${nodeName(node)}\\n${detail}` : nodeName(node));
    lines.push(`${style.shape} "${label}" as ${alias(node.id)} <<${style.stereotype}>> ${style.colour}`);
  }
  lines.push("");

  // The flow's ordered step sequence (dashed grey "then" arrows).
  for (let i = 0; i < steps.length - 1; i += 1) {
    const from = steps[i];
    const to = steps[i + 1];
    if (from && to) lines.push(`${alias(from.id)} -[#90A4AE,dashed]-> ${alias(to.id)} : then`);
  }
  lines.push("");

  // The typed story edges — decision-sourced edges emphasised (bold amber).
  for (const edge of graph.edges) {
    const arrow = decisionIds.has(edge.sourceId) ? "-[#F57F17,bold]->" : "-[#5C6BC0]->";
    lines.push(`${alias(edge.sourceId)} ${arrow} ${alias(edge.targetId)} : ${edge.relationshipType}`);
  }

  lines.push("@enduml");
  return lines.join("\n");
}
