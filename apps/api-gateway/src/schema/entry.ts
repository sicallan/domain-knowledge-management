import type { Evidence, InventoryEntry, RelationshipEntry } from "@dkm/schema";
import type { PaginatedResult, PathResult, QueryPath, SubgraphResult } from "@dkm/query";
import { Direction, PropertyFilterInput, SortInput } from "./args";
import { builder } from "./builder";

/**
 * Graph Query domain — the `InventoryEntry`/`Relationship`/`Subgraph` projections and
 * the `entry`/`entries`/`traverse`/`paths` resolvers. Each resolver delegates to the
 * injected `QueryService` and threads `ctx.context` (UI-D3 / criterion 8); none touches
 * a graph adapter or reads `demo/*.jsonl`.
 */

export const EvidenceRef = builder.objectRef<Evidence>("Evidence").implement({
  description: "A provenance link tying an assertion to its source.",
  fields: (t) => ({
    source: t.exposeString("source"),
    location: t.exposeString("location", { nullable: true }),
    fetchedAt: t.exposeString("fetchedAt"),
    sourceAuthority: t.exposeString("sourceAuthority", { nullable: true }),
  }),
});

export const InventoryEntryRef = builder.objectRef<InventoryEntry>("InventoryEntry").implement({
  description: "A typed inventory entry — the base-entry fields plus a JSON escape hatch for type-specific data.",
  // The InventoryEntry index signature (`[key: string]: unknown`) defeats Pothos's
  // `expose*` field inference, so the base fields use explicit resolvers.
  fields: (t) => ({
    id: t.id({ resolve: (e) => e.id }),
    type: t.string({ resolve: (e) => e.type }),
    version: t.string({ resolve: (e) => e.version }),
    lifecycleStatus: t.string({ resolve: (e) => e.lifecycle_status }),
    validFrom: t.string({ resolve: (e) => e.validFrom }),
    validTo: t.string({ nullable: true, resolve: (e) => e.validTo ?? null }),
    transactionTime: t.string({ nullable: true, resolve: (e) => e.transactionTime ?? null }),
    confidence: t.float({ nullable: true, resolve: (e) => e.confidence ?? null }),
    createdAt: t.string({ nullable: true, resolve: (e) => e.createdAt ?? null }),
    updatedAt: t.string({ nullable: true, resolve: (e) => e.updatedAt ?? null }),
    createdBy: t.string({ nullable: true, resolve: (e) => e.createdBy ?? null }),
    evidencedBy: t.field({ type: [EvidenceRef], resolve: (e) => e.evidencedBy }),
    data: t.field({
      type: "JSON",
      description: "The full entry record incl. type-specific fields (the open InventoryEntry index signature).",
      resolve: (e) => e,
    }),
  }),
});

export const RelationshipRef = builder.objectRef<RelationshipEntry>("Relationship").implement({
  description: "A typed, directed edge between two inventory entries.",
  fields: (t) => ({
    id: t.exposeID("id"),
    relationshipType: t.exposeString("relationshipType"),
    sourceId: t.exposeID("sourceId"),
    targetId: t.exposeID("targetId"),
    sourceType: t.exposeString("sourceType", { nullable: true }),
    targetType: t.exposeString("targetType", { nullable: true }),
    direction: t.exposeString("direction", { nullable: true }),
    confidence: t.exposeFloat("confidence", { nullable: true }),
  }),
});

export const SubgraphRef = builder.objectRef<SubgraphResult>("Subgraph").implement({
  description: "The reachable subgraph from a traversal.",
  fields: (t) => ({
    nodes: t.field({ type: [InventoryEntryRef], resolve: (s) => s.nodes }),
    edges: t.field({ type: [RelationshipRef], resolve: (s) => s.edges }),
    truncated: t.exposeBoolean("truncated"),
  }),
});

export const EntryConnectionRef = builder
  .objectRef<PaginatedResult<InventoryEntry>>("EntryConnection")
  .implement({
    description: "A keyset-paginated page of inventory entries.",
    fields: (t) => ({
      items: t.field({ type: [InventoryEntryRef], resolve: (c) => c.items }),
      cursor: t.exposeString("cursor", { nullable: true }),
      hasMore: t.exposeBoolean("hasMore"),
      totalCount: t.exposeInt("totalCount", { nullable: true }),
    }),
  });

export const QueryPathRef = builder.objectRef<QueryPath>("QueryPath").implement({
  description: "A single connecting path between two nodes.",
  fields: (t) => ({
    nodeIds: t.exposeIDList("nodeIds"),
    edges: t.field({ type: [RelationshipRef], resolve: (p) => p.edges }),
  }),
});

export const PathResultRef = builder.objectRef<PathResult>("PathResult").implement({
  fields: (t) => ({
    paths: t.field({ type: [QueryPathRef], resolve: (r) => r.paths }),
    found: t.exposeBoolean("found"),
  }),
});

builder.queryFields((t) => ({
  entry: t.field({
    type: InventoryEntryRef,
    nullable: true,
    description: "Look up one inventory entry by id; null (not an error) when absent.",
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const result = await ctx.queryService.getEntry(String(args.id), ctx.context);
      return result?.entry ?? null;
    },
  }),
  entries: t.field({
    type: EntryConnectionRef,
    description: "List inventory entries of a type, with filters, sort and keyset pagination.",
    args: {
      type: t.arg.string(),
      filter: t.arg({ type: [PropertyFilterInput] }),
      sort: t.arg({ type: SortInput }),
      limit: t.arg.int(),
      cursor: t.arg.string(),
    },
    resolve: (_root, args, ctx) =>
      ctx.queryService.listEntries(
        {
          type: args.type ?? undefined,
          filters: args.filter?.map((f) => ({ field: f.field, op: f.op, value: f.value })),
          sort: args.sort ? { field: args.sort.field, direction: args.sort.direction } : undefined,
          limit: args.limit ?? undefined,
          cursor: args.cursor ?? undefined,
        },
        ctx.context,
      ),
  }),
  traverse: t.field({
    type: SubgraphRef,
    description: "Traverse the graph from a start node; depth is clamped by the service cap.",
    args: {
      startNodeId: t.arg.id({ required: true }),
      direction: t.arg({ type: Direction, required: true }),
      edgeTypes: t.arg.stringList(),
      nodeTypes: t.arg.stringList(),
      maxDepth: t.arg.int({ required: true }),
      includeEdges: t.arg.boolean({ required: true }),
    },
    resolve: (_root, args, ctx) =>
      ctx.queryService.traverse(
        {
          startNodeId: String(args.startNodeId),
          direction: args.direction,
          edgeTypes: args.edgeTypes ?? undefined,
          nodeTypes: args.nodeTypes ?? undefined,
          maxDepth: args.maxDepth,
          includeEdges: args.includeEdges,
        },
        ctx.context,
      ),
  }),
  paths: t.field({
    type: PathResultRef,
    description: "Find paths between two nodes.",
    args: {
      sourceId: t.arg.id({ required: true }),
      targetId: t.arg.id({ required: true }),
      edgeTypes: t.arg.stringList(),
      maxDepth: t.arg.int(),
      limit: t.arg.int(),
    },
    resolve: (_root, args, ctx) =>
      ctx.queryService.findPaths(
        {
          sourceId: String(args.sourceId),
          targetId: String(args.targetId),
          edgeTypes: args.edgeTypes ?? undefined,
          maxDepth: args.maxDepth ?? undefined,
          limit: args.limit ?? undefined,
        },
        ctx.context,
      ),
  }),
}));
