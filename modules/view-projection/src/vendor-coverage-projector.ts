import type { GraphMutationEvent } from "@dkm/knowledge-graph";
import type { QueryContext, QueryService } from "@dkm/query";
import type { InventoryEntry } from "@dkm/schema";
import {
  buildMappingIndex,
  maxCoveragePercentage,
  readElementRealisation,
  rollUpCoverage,
  rowCoverageStatus,
} from "./realisation-predicate";
import type { MappingRef } from "./realisation-predicate";
import type {
  CoverageRowKind,
  VendorCoverageCell,
  VendorCoverageColumn,
  VendorCoverageParams,
  VendorCoverageRow,
  VendorCoverageSummary,
  VendorCoverageView,
  ViewMetadata,
  ViewProjector,
} from "./types";

const VENDOR_PRODUCT = "VendorProduct";
const MAPPING = "VendorCapabilityMapping";

/** Node types whose mutation could change the Coverage Map. */
const RELEVANT_NODE_TYPES = new Set([
  "BusinessCapability",
  "DomainConcept",
  VENDOR_PRODUCT,
  MAPPING,
  "ProjectSpec",
  "Service",
]);

/** Edge types whose mutation could change the Coverage Map. */
const RELEVANT_EDGE_TYPES = new Set(["fulfils", "specifies", "realizesVendorCap", "implements", "realizedBy"]);

const RELATIONSHIP_PREFIX = "Relationship:";

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function domainOf(node: InventoryEntry): string | undefined {
  return str(node.domain) ?? str(node.subdomain);
}

function claimsOf(node: InventoryEntry): string[] {
  return Array.isArray(node.capabilityClaims) ? (node.capabilityClaims as string[]) : [];
}

/**
 * Vendor Coverage Map projector (Phase 3 feature 03; spec 007 viewType `vendor-coverage`).
 * Produces a {@link VendorCoverageView} — L1 capabilities/concepts (rows) × vendor products
 * (columns), each cell a coverage status — by composing **only** the Query Interface
 * primitives (`listEntries`, `traverse`), so adapter parity (in-memory ↔ Neo4j) is inherited
 * (D-P1.2).
 *
 * Per-row status and the gap flag come from the **shared realisation predicate**
 * ({@link rowCoverageStatus}), which the Gap view (feature 04) reuses verbatim — so the
 * Coverage Map's `uncovered` rows and the Gap view's functional gaps can never disagree
 * (D-P3.3, guarded by a parity test). Cell coverage is attributed to a product via the
 * mapping's `vendorCapability` matching the product's `capabilityClaims` (D-P3.7), and
 * rolled up worst-wins (D-P3.2).
 *
 * **OCP**: a new view added purely by implementing {@link ViewProjector} + registering.
 */
export class VendorCoverageProjector implements ViewProjector<VendorCoverageParams, VendorCoverageView> {
  readonly viewType = "vendor-coverage";

  constructor(private readonly service: QueryService) {}

  describe(): ViewMetadata {
    return {
      viewType: this.viewType,
      description: "Capabilities/concepts × vendor products coverage matrix with RAG gap indicators.",
      parameters: [
        { name: "vendor", type: "string", required: false, description: "Restrict columns to one vendor." },
        { name: "domain", type: "string", required: false, description: "Restrict rows to one domain." },
        { name: "rowKind", type: "string", required: false, description: "BusinessCapability (default) or DomainConcept." },
      ],
      refreshPolicy: "on-demand",
      estimatedComputeTime: "<1s",
    };
  }

  async project(params: VendorCoverageParams, context: QueryContext): Promise<VendorCoverageView> {
    const rowKind: CoverageRowKind = params.rowKind ?? "BusinessCapability";
    const domainFilter = str(params.domain)?.toLowerCase();
    const vendorFilter = str(params.vendor)?.toLowerCase();

    // Rows (L1 elements), optionally scoped to one domain.
    const rowNodes = (await this.listAll(rowKind, context))
      .filter((node) => !domainFilter || domainOf(node)?.toLowerCase() === domainFilter)
      .sort(byId);

    // Columns (vendor products), optionally scoped to one vendor.
    const columnNodes = (await this.listAll(VENDOR_PRODUCT, context))
      .filter((node) => !vendorFilter || matchesVendor(node, vendorFilter))
      .sort(byId);
    const columns: VendorCoverageColumn[] = columnNodes.map((node) => ({
      id: node.id,
      name: str(node.name) ?? node.id,
      vendor: str(node.vendor) ?? "",
    }));
    const claimsByColumn = new Map(columnNodes.map((node) => [node.id, new Set(claimsOf(node))]));

    // Mappings: indexed by mappedConcept.targetId (the cell coverage carrier).
    const mappingIndex = buildMappingIndex(await this.listAll(MAPPING, context));

    const rows: VendorCoverageRow[] = [];
    const cells: VendorCoverageCell[] = [];
    for (const rowNode of rowNodes) {
      const realisation = await readElementRealisation(this.service, rowNode.id, mappingIndex, context);
      const status = rowCoverageStatus(realisation);
      const row: VendorCoverageRow = { id: rowNode.id, name: str(rowNode.name) ?? rowNode.id, kind: rowKind, status, gap: status === "uncovered" };
      const domain = domainOf(rowNode);
      if (domain) row.domain = domain;
      rows.push(row);

      const rowMappings = mappingIndex.get(rowNode.id) ?? [];
      for (const column of columns) {
        cells.push(buildCell(rowNode.id, column.id, rowMappings, claimsByColumn.get(column.id)));
      }
    }

    return { rows, columns, cells, summary: summarise(rows) };
  }

  invalidatedBy(event: GraphMutationEvent): boolean {
    if (RELEVANT_NODE_TYPES.has(event.entityType)) return true;
    if (event.entityType.startsWith(RELATIONSHIP_PREFIX)) {
      return RELEVANT_EDGE_TYPES.has(event.entityType.slice(RELATIONSHIP_PREFIX.length));
    }
    return false;
  }

  /** Freshness metadata: the capabilities/concepts (rows) the matrix covers. */
  entriesIncluded(result: VendorCoverageView): number {
    return result.rows.length;
  }

  /** Read every entry of a type through the Query Interface, following cursors. */
  private async listAll(type: string, context: QueryContext): Promise<InventoryEntry[]> {
    const all: InventoryEntry[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.service.listEntries({ type, limit: 100, cursor }, context);
      all.push(...page.items);
      cursor = page.cursor ?? undefined;
    } while (cursor);
    return all;
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id.localeCompare(b.id);
}

function matchesVendor(node: InventoryEntry, needle: string): boolean {
  return [str(node.vendor), node.id, str(node.name)].some((value) => value?.toLowerCase() === needle);
}

/**
 * A cell's coverage of one capability by one vendor product. The product's mappings are
 * those whose `vendorCapability` it claims (D-P3.7); their coverages roll up worst-wins
 * (D-P3.2), surfacing the max percentage and the union of named gaps. No attributable
 * mapping → uncovered (criterion 3).
 */
function buildCell(
  rowId: string,
  columnId: string,
  rowMappings: MappingRef[],
  claims: Set<string> | undefined,
): VendorCoverageCell {
  const attributable = rowMappings.filter((mapping) => claims?.has(mapping.vendorCapability));
  const cell: VendorCoverageCell = { rowId, columnId, status: rollUpCoverage(attributable.map((m) => m.coverage)) };
  const percentage = maxCoveragePercentage(attributable.map((m) => m.coveragePercentage));
  if (percentage !== undefined) cell.coveragePercentage = percentage;
  if (attributable.length > 0) cell.mappingId = attributable[0]!.mappingId;
  const gaps = attributable.flatMap((m) => m.gaps ?? []);
  if (gaps.length > 0) cell.gaps = gaps;
  return cell;
}

function summarise(rows: VendorCoverageRow[]): VendorCoverageSummary {
  const covered = rows.filter((r) => r.status === "covered").length;
  const partial = rows.filter((r) => r.status === "partial").length;
  const uncovered = rows.filter((r) => r.status === "uncovered").length;
  const total = rows.length;
  // Weighted overall coverage: covered=1, partial=0.5, uncovered=0.
  const coveragePercentage = total === 0 ? 0 : Math.round(((covered + partial * 0.5) / total) * 100);
  return { totalCapabilities: total, covered, partial, uncovered, coveragePercentage };
}
