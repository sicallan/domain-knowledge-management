import type { GraphQueryService, QueryContext } from "@dkm/query";
import type { DomainMapView } from "@dkm/view-projection";
import type { InventoryEntry, RelationshipEntry } from "@dkm/schema";

/**
 * Domain Map PlantUML renderer (demo). A **demo-local consumer of the projected view**:
 * feature #9's View Projection Engine produces the authoritative {@link DomainMapView}
 * (subdomains → bounded contexts → counts + cross-context relationships); this module
 * renders it as a decisions-first DDD domain map. The view drives the subdomain/context
 * skeleton; the individual member nodes (decisions as gold hexagons, etc.) are fetched
 * through the same Query Interface so the picture stays rich.
 *
 * This is intentionally **not** registered as a projector in the engine — the full
 * Phase 1.6 diagram-exporter (a diagram projection target) is a separate later feature.
 */

const BELONGS_TO = "belongsTo";

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

/** Second label line: the most useful type-specific detail for this node. */
function nodeDetail(node: InventoryEntry): string | undefined {
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

/** The decisions-first detail behind the view: member nodes per context, plus edges. */
export interface ContextDetail {
  /** Member inventory nodes keyed by bounded-context id (from the projected view). */
  membersByContext: Map<string, InventoryEntry[]>;
  /** Domain relationships between members (belongsTo structural edges excluded). */
  edges: RelationshipEntry[];
  decisionIds: Set<string>;
}

/**
 * Fetch the member nodes for each context **in the projected view** through the Query
 * Interface: `traverse` belongsTo into the context for its members, then one hop out of
 * each member to collect the domain relationships. The view supplies the authoritative
 * set of contexts; this fills in the node-level detail the aggregate view omits.
 */
export async function collectContextDetail(
  service: GraphQueryService,
  view: DomainMapView,
): Promise<ContextDetail> {
  const membersByContext = new Map<string, InventoryEntry[]>();
  const edges = new Map<string, RelationshipEntry>();
  const decisionIds = new Set<string>();

  for (const subdomain of view.subdomains) {
    for (const context of subdomain.contexts) {
      const subgraph = await service.traverse(
        { startNodeId: context.id, direction: "in", edgeTypes: [BELONGS_TO], maxDepth: 1, includeEdges: false },
        CONTEXT,
      );
      const members = subgraph.nodes.filter((node) => node.id !== context.id);
      membersByContext.set(context.id, members);
      for (const member of members) {
        if (member.type === "Decision") decisionIds.add(member.id);
        const out = await service.traverse(
          { startNodeId: member.id, direction: "out", maxDepth: 1, includeEdges: true },
          CONTEXT,
        );
        for (const edge of out.edges) {
          if (edge.relationshipType !== BELONGS_TO) edges.set(edge.id, edge);
        }
      }
    }
  }

  return { membersByContext, edges: [...edges.values()], decisionIds };
}

/** Render the projected Domain Map as PlantUML: subdomains → contexts → members. */
export function renderDomainMap(view: DomainMapView, detail: ContextDetail): string {
  const lines: string[] = [
    "@startuml payments-domain-map",
    "title Payments — Domain Map (L1) · projected by the View Projection Engine (spec 007)",
    "skinparam shadowing false",
    "skinparam defaultFontName Helvetica",
    "skinparam packageStyle frame",
    "legend right",
    "  Outer frame = subdomain · inner frame = bounded context (with concept/service counts).",
    "  <b>Decisions</b> (gold hexagons) are the highest-value nodes —",
    "  where regulation and business logic concentrate.",
    "  Bold amber arrows are decision-sourced relationships.",
    "endlegend",
    "",
  ];

  for (const subdomain of view.subdomains) {
    lines.push(`package "${escapeLabel(subdomain.name)}  «subdomain»" as ${alias(subdomain.id)} {`);
    for (const context of subdomain.contexts) {
      const counts = `${context.conceptCount} concepts · ${context.serviceCount} services`;
      lines.push(`  package "${escapeLabel(context.name)}\\n${counts}" as ${alias(context.id)} {`);
      const members = [...(detail.membersByContext.get(context.id) ?? [])].sort(
        (a, b) => a.type.localeCompare(b.type) || nodeName(a).localeCompare(nodeName(b)),
      );
      for (const node of members) {
        const style = TYPE_STYLE[node.type] ?? FALLBACK_STYLE;
        const extra = nodeDetail(node);
        const label = escapeLabel(extra ? `${nodeName(node)}\\n${extra}` : nodeName(node));
        lines.push(`    ${style.shape} "${label}" as ${alias(node.id)} <<${style.stereotype}>> ${style.colour}`);
      }
      lines.push("  }");
    }
    lines.push("}");
    lines.push("");
  }

  // Relationships between members — decision-sourced edges emphasised (bold amber).
  for (const edge of detail.edges) {
    const arrow = detail.decisionIds.has(edge.sourceId) ? "-[#F57F17,bold]->" : "-->";
    lines.push(`${alias(edge.sourceId)} ${arrow} ${alias(edge.targetId)} : ${edge.relationshipType}`);
  }

  lines.push("@enduml");
  return lines.join("\n");
}
