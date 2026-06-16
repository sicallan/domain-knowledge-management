import type { GraphQueryService, QueryContext } from "@dkm/query";
import type { InventoryEntry, RelationshipEntry } from "@dkm/schema";

/**
 * Domain Map exporter (demo / Phase 1.6 spike). Reads the populated graph **through
 * the Query Interface** (`@dkm/query` — the same API that will feed the UI) and renders
 * a decisions-first DDD domain map as PlantUML. This is the seed of the real diagram
 * exporter that feature #9 (View Projection Engine, spec 007) will productionise as a
 * projection consumer.
 */

/** Inventory types rendered, in vertical section order (capability → data). */
const RENDER_TYPES = [
  "BusinessCapability",
  "DomainConcept",
  "Decision",
  "Rule",
  "BusinessInvariant",
  "ReferenceData",
] as const;

interface TypeStyle {
  shape: "rectangle" | "hexagon" | "card" | "folder";
  colour: string;
  stereotype: string;
}

/** Visual language — decisions are gold hexagons (the highest-value nodes). */
const TYPE_STYLE: Record<string, TypeStyle> = {
  Decision: { shape: "hexagon", colour: "#FFD54F", stereotype: "Decision" },
  DomainConcept: { shape: "rectangle", colour: "#90CAF9", stereotype: "DomainConcept" },
  Rule: { shape: "rectangle", colour: "#A5D6A7", stereotype: "Rule" },
  BusinessInvariant: { shape: "rectangle", colour: "#CE93D8", stereotype: "BusinessInvariant" },
  ReferenceData: { shape: "card", colour: "#FFAB91", stereotype: "ReferenceData" },
  BusinessCapability: { shape: "folder", colour: "#80CBC4", stereotype: "BusinessCapability" },
};

const FALLBACK_STYLE: TypeStyle = { shape: "rectangle", colour: "#ECEFF1", stereotype: "Entry" };

const CONTEXT: QueryContext = {
  userId: "demo",
  roles: ["reader"],
  scopes: ["*"],
  requestId: "demo-domain-map",
};

function prop(node: InventoryEntry, key: string): unknown {
  return (node as unknown as Record<string, unknown>)[key];
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function nodeName(node: InventoryEntry): string {
  return str(prop(node, "name")) ?? node.id;
}

function sourceOf(node: InventoryEntry): string {
  return str(node.evidencedBy?.[0]?.source) ?? "unattributed";
}

/** Second label line: the most useful type-specific detail for this node. */
function detail(node: InventoryEntry): string | undefined {
  if (node.type === "Decision") {
    const decisionType = str(prop(node, "decisionType"));
    const raw = prop(node, "outcomes");
    const outcomes = Array.isArray(raw) ? raw.map((o) => String(o)).join(" / ") : undefined;
    const parts = [decisionType ? `«${decisionType}»` : undefined, outcomes].filter((p): p is string => Boolean(p));
    return parts.length > 0 ? parts.join("  ") : undefined;
  }
  if (node.type === "Rule" || node.type === "BusinessInvariant") return str(prop(node, "expression"));
  if (node.type === "ReferenceData") {
    const owner = str(prop(node, "owner"));
    return owner ? `owner: ${owner}` : undefined;
  }
  if (node.type === "DomainConcept") {
    const conceptType = str(prop(node, "conceptType"));
    return conceptType ? `«${conceptType}»` : undefined;
  }
  return undefined;
}

function alias(id: string): string {
  return `n_${id.replace(/[^A-Za-z0-9_]/g, "_")}`;
}

function escapeLabel(text: string): string {
  return text.replace(/"/g, "'");
}

export interface DomainMapModel {
  /** Nodes grouped by their source document (bounded-context proxy). */
  nodesByDoc: Map<string, InventoryEntry[]>;
  edges: RelationshipEntry[];
  decisionIds: Set<string>;
  nodeCount: number;
}

/**
 * Assemble the decisions-first model by querying the graph **through the Query
 * Interface**: `listEntries` per type for the nodes, then a one-hop `traverse` out of
 * every node to collect (and de-duplicate) the relationships.
 */
export async function buildDomainMapModel(service: GraphQueryService): Promise<DomainMapModel> {
  const nodes = new Map<string, InventoryEntry>();
  for (const type of RENDER_TYPES) {
    const page = await service.listEntries({ type, limit: 100 }, CONTEXT);
    for (const node of page.items) nodes.set(node.id, node);
  }

  const edges = new Map<string, RelationshipEntry>();
  for (const node of nodes.values()) {
    const subgraph = await service.traverse(
      { startNodeId: node.id, direction: "out", maxDepth: 1, includeEdges: true },
      CONTEXT,
    );
    for (const edge of subgraph.edges) edges.set(edge.id, edge);
  }

  const nodesByDoc = new Map<string, InventoryEntry[]>();
  for (const node of nodes.values()) {
    const doc = sourceOf(node);
    const list = nodesByDoc.get(doc) ?? [];
    list.push(node);
    nodesByDoc.set(doc, list);
  }

  const decisionIds = new Set(
    [...nodes.values()].filter((node) => node.type === "Decision").map((node) => node.id),
  );

  return { nodesByDoc, edges: [...edges.values()], decisionIds, nodeCount: nodes.size };
}

/** Render the model as a PlantUML DDD domain map, decisions highlighted. */
export function renderPlantUml(model: DomainMapModel): string {
  const lines: string[] = [
    "@startuml payments-domain-map",
    "title Payments — Domain Map (L1) · auto-generated from source documents",
    "skinparam shadowing false",
    "skinparam defaultFontName Helvetica",
    "skinparam packageStyle frame",
    "legend right",
    "  Each frame = a source document (bounded-context proxy).",
    "  <b>Decisions</b> (gold hexagons) are the highest-value nodes —",
    "  where regulation and business logic concentrate.",
    "endlegend",
    "",
  ];

  for (const doc of [...model.nodesByDoc.keys()].sort()) {
    lines.push(`package "${doc}" {`);
    const items = [...(model.nodesByDoc.get(doc) ?? [])].sort(
      (a, b) => a.type.localeCompare(b.type) || nodeName(a).localeCompare(nodeName(b)),
    );
    for (const node of items) {
      const style = TYPE_STYLE[node.type] ?? FALLBACK_STYLE;
      const extra = detail(node);
      const label = escapeLabel(extra ? `${nodeName(node)}\\n${extra}` : nodeName(node));
      lines.push(`  ${style.shape} "${label}" as ${alias(node.id)} <<${style.stereotype}>> ${style.colour}`);
    }
    lines.push("}");
    lines.push("");
  }

  // Relationships — decision-sourced edges emphasised (bold amber) to keep the
  // decisions central to the reading of the map.
  for (const edge of model.edges) {
    const arrow = model.decisionIds.has(edge.sourceId) ? "-[#F57F17,bold]->" : "-->";
    lines.push(`${alias(edge.sourceId)} ${arrow} ${alias(edge.targetId)} : ${edge.relationshipType}`);
  }

  lines.push("@enduml");
  return lines.join("\n");
}
