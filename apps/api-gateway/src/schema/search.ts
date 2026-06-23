import type {
  BackendUnavailableResult,
  ImpactSuccessResult,
  ImpactedNode,
  SearchHit,
  SearchSuccessResult,
} from "@dkm/query";
import { SearchMode } from "./args";
import { builder } from "./builder";
import { InventoryEntryRef } from "./entry";

/**
 * Deferred-query domain (spec 006). `search` and `assessImpact` need vector/PostgreSQL
 * backends not wired in Phase 3, so the service returns a typed `BackendUnavailable`
 * marker **instead of throwing** (UI-D2 Tier 2 / criterion 6). Each is exposed as a
 * GraphQL union so the UI renders the honest "coming soon" state, never a fake success.
 */

export const BackendUnavailableRef = builder
  .objectRef<BackendUnavailableResult>("BackendUnavailable")
  .implement({
    description: "A query type whose backend is not wired yet — honest, never an error.",
    fields: (t) => ({
      available: t.exposeBoolean("available"),
      reason: t.exposeString("reason"),
      queryType: t.exposeString("queryType"),
      requiredBackends: t.exposeStringList("requiredBackends"),
    }),
  });

const SearchHitRef = builder.objectRef<SearchHit>("SearchHit").implement({
  fields: (t) => ({
    entry: t.field({ type: InventoryEntryRef, resolve: (h) => h.entry }),
    score: t.exposeFloat("score"),
  }),
});

const SearchHitsRef = builder.objectRef<SearchSuccessResult>("SearchHits").implement({
  fields: (t) => ({
    available: t.exposeBoolean("available"),
    hits: t.field({ type: [SearchHitRef], resolve: (s) => s.hits }),
    cursor: t.exposeString("cursor", { nullable: true }),
    hasMore: t.exposeBoolean("hasMore"),
    totalCount: t.exposeInt("totalCount", { nullable: true }),
  }),
});

const SearchResultUnion = builder.unionType("SearchResult", {
  types: [SearchHitsRef, BackendUnavailableRef],
  resolveType: (value) => (value.available ? "SearchHits" : "BackendUnavailable"),
});

const ImpactedNodeRef = builder.objectRef<ImpactedNode>("ImpactedNode").implement({
  fields: (t) => ({
    entry: t.field({ type: InventoryEntryRef, resolve: (n) => n.entry }),
    score: t.exposeFloat("score"),
    distance: t.exposeInt("distance"),
  }),
});

const ImpactSuccessRef = builder.objectRef<ImpactSuccessResult>("ImpactSuccess").implement({
  fields: (t) => ({
    available: t.exposeBoolean("available"),
    impacted: t.field({ type: [ImpactedNodeRef], resolve: (s) => s.impacted }),
  }),
});

const ImpactResultUnion = builder.unionType("ImpactResult", {
  types: [ImpactSuccessRef, BackendUnavailableRef],
  resolveType: (value) => (value.available ? "ImpactSuccess" : "BackendUnavailable"),
});

builder.queryFields((t) => ({
  search: t.field({
    type: SearchResultUnion,
    description: "Semantic/keyword/hybrid search — Phase 3 returns BackendUnavailable (Tier 2).",
    args: {
      query: t.arg.string({ required: true }),
      mode: t.arg({ type: SearchMode, required: true }),
    },
    resolve: (_root, args, ctx) =>
      ctx.queryService.search({ query: args.query, mode: args.mode }, ctx.context),
  }),
  assessImpact: t.field({
    type: ImpactResultUnion,
    description: "Impact assessment — Phase 3 returns BackendUnavailable (deferred to Phase 4).",
    args: {
      triggerNodeId: t.arg.id({ required: true }),
      traversalDepth: t.arg.int({ required: true }),
    },
    resolve: (_root, args, ctx) =>
      ctx.queryService.assessImpact(
        { triggerNodeId: String(args.triggerNodeId), traversalDepth: args.traversalDepth },
        ctx.context,
      ),
  }),
}));
