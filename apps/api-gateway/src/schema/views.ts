import type {
  BehaviourFlowDecision,
  BehaviourFlowEventRef as BehaviourFlowEventShape,
  BehaviourFlowHeader,
  BehaviourFlowOutcome,
  BehaviourFlowStep,
  BehaviourFlowTransition,
  BehaviourFlowView,
  ContextRelationship,
  CrossContextRelationship,
  DomainMapContext,
  DomainMapSubdomain,
  DomainMapView,
  GapAnalysisGap,
  GapAnalysisSummary,
  GapAnalysisView,
  VendorCoverageCell,
  VendorCoverageColumn,
  VendorCoverageRow,
  VendorCoverageSummary,
  VendorCoverageView,
} from "@dkm/view-projection";
import { builder } from "./builder";

/**
 * View Projection domain — the GraphQL projection of the four view output shapes
 * (spec 007 / Phase-3 data track) and the `coverageMap`/`gapAnalysis`/`domainMap`/
 * `behaviourFlow` resolvers. Each resolver delegates to the injected `ViewEngine`
 * (`getView`) and returns the projector's `data` shape; resolver args mirror the
 * projector param types (feature 02 §11) so they can't drift. Status fields are
 * exposed as `String` — the projectors are the source of the allowed values.
 */

// --- Domain Map ------------------------------------------------------------

const ContextRelationshipRef = builder
  .objectRef<ContextRelationship>("ContextRelationship")
  .implement({
    fields: (t) => ({
      targetContextId: t.exposeString("targetContextId"),
      type: t.exposeString("type"),
    }),
  });

const DomainMapContextRef = builder.objectRef<DomainMapContext>("DomainMapContext").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    conceptCount: t.exposeInt("conceptCount"),
    serviceCount: t.exposeInt("serviceCount"),
    relationships: t.field({ type: [ContextRelationshipRef], resolve: (c) => c.relationships }),
  }),
});

const DomainMapSubdomainRef = builder
  .objectRef<DomainMapSubdomain>("DomainMapSubdomain")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),
      name: t.exposeString("name"),
      contexts: t.field({ type: [DomainMapContextRef], resolve: (s) => s.contexts }),
    }),
  });

const CrossContextRelationshipRef = builder
  .objectRef<CrossContextRelationship>("CrossContextRelationship")
  .implement({
    fields: (t) => ({
      source: t.exposeString("source"),
      target: t.exposeString("target"),
      type: t.exposeString("type"),
      strength: t.exposeInt("strength"),
    }),
  });

const DomainMapViewRef = builder.objectRef<DomainMapView>("DomainMapView").implement({
  fields: (t) => ({
    subdomains: t.field({ type: [DomainMapSubdomainRef], resolve: (v) => v.subdomains }),
    crossContextRelationships: t.field({
      type: [CrossContextRelationshipRef],
      resolve: (v) => v.crossContextRelationships,
    }),
  }),
});

// --- Vendor Coverage Map ---------------------------------------------------

const VendorCoverageRowRef = builder.objectRef<VendorCoverageRow>("VendorCoverageRow").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    kind: t.exposeString("kind"),
    status: t.exposeString("status"),
    gap: t.exposeBoolean("gap"),
    domain: t.exposeString("domain", { nullable: true }),
  }),
});

const VendorCoverageColumnRef = builder
  .objectRef<VendorCoverageColumn>("VendorCoverageColumn")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),
      name: t.exposeString("name"),
      vendor: t.exposeString("vendor"),
    }),
  });

const VendorCoverageCellRef = builder
  .objectRef<VendorCoverageCell>("VendorCoverageCell")
  .implement({
    fields: (t) => ({
      rowId: t.exposeID("rowId"),
      columnId: t.exposeID("columnId"),
      status: t.exposeString("status"),
      coveragePercentage: t.exposeFloat("coveragePercentage", { nullable: true }),
      mappingId: t.exposeID("mappingId", { nullable: true }),
      gaps: t.exposeStringList("gaps", { nullable: true }),
    }),
  });

const VendorCoverageSummaryRef = builder
  .objectRef<VendorCoverageSummary>("VendorCoverageSummary")
  .implement({
    fields: (t) => ({
      totalCapabilities: t.exposeInt("totalCapabilities"),
      covered: t.exposeInt("covered"),
      partial: t.exposeInt("partial"),
      uncovered: t.exposeInt("uncovered"),
      coveragePercentage: t.exposeFloat("coveragePercentage"),
    }),
  });

const VendorCoverageViewRef = builder
  .objectRef<VendorCoverageView>("VendorCoverageView")
  .implement({
    fields: (t) => ({
      rows: t.field({ type: [VendorCoverageRowRef], resolve: (v) => v.rows }),
      columns: t.field({ type: [VendorCoverageColumnRef], resolve: (v) => v.columns }),
      cells: t.field({ type: [VendorCoverageCellRef], resolve: (v) => v.cells }),
      summary: t.field({ type: VendorCoverageSummaryRef, resolve: (v) => v.summary }),
    }),
  });

// --- Gap Analysis ----------------------------------------------------------

const GapAnalysisGapRef = builder.objectRef<GapAnalysisGap>("GapAnalysisGap").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    kind: t.exposeString("kind"),
    domain: t.exposeString("domain", { nullable: true }),
    missingLayers: t.exposeStringList("missingLayers"),
    priority: t.exposeInt("priority"),
    reason: t.exposeString("reason"),
  }),
});

const GapAnalysisSummaryRef = builder
  .objectRef<GapAnalysisSummary>("GapAnalysisSummary")
  .implement({
    fields: (t) => ({
      totalAssessed: t.exposeInt("totalAssessed"),
      functionalGaps: t.exposeInt("functionalGaps"),
      technicalGaps: t.exposeInt("technicalGaps"),
      fullyRealised: t.exposeInt("fullyRealised"),
    }),
  });

const GapAnalysisViewRef = builder.objectRef<GapAnalysisView>("GapAnalysisView").implement({
  fields: (t) => ({
    gaps: t.field({ type: [GapAnalysisGapRef], resolve: (v) => v.gaps }),
    summary: t.field({ type: GapAnalysisSummaryRef, resolve: (v) => v.summary }),
  }),
});

// --- Behaviour Flow --------------------------------------------------------

const BehaviourFlowEventRef = builder
  .objectRef<BehaviourFlowEventShape>("BehaviourFlowEvent")
  .implement({
    fields: (t) => ({
      eventId: t.exposeID("eventId"),
      name: t.exposeString("name"),
    }),
  });

const BehaviourFlowTransitionRef = builder
  .objectRef<BehaviourFlowTransition>("BehaviourFlowTransition")
  .implement({
    fields: (t) => ({
      fromState: t.exposeString("fromState"),
      toState: t.exposeString("toState"),
      guardCondition: t.exposeString("guardCondition", { nullable: true }),
    }),
  });

const BehaviourFlowOutcomeRef = builder
  .objectRef<BehaviourFlowOutcome>("BehaviourFlowOutcome")
  .implement({
    fields: (t) => ({
      label: t.exposeString("label"),
      producesEventId: t.exposeID("producesEventId", { nullable: true }),
    }),
  });

const BehaviourFlowDecisionRef = builder
  .objectRef<BehaviourFlowDecision>("BehaviourFlowDecision")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),
      name: t.exposeString("name"),
      type: t.exposeString("type"),
      outcomes: t.field({ type: [BehaviourFlowOutcomeRef], resolve: (d) => d.outcomes }),
    }),
  });

const BehaviourFlowStepRef = builder.objectRef<BehaviourFlowStep>("BehaviourFlowStep").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    sequence: t.exposeInt("sequence"),
    actionType: t.exposeString("actionType"),
    serviceOrComponent: t.exposeString("serviceOrComponent", { nullable: true }),
    emits: t.field({ type: [BehaviourFlowEventRef], resolve: (s) => s.emits }),
    consumes: t.field({ type: [BehaviourFlowEventRef], resolve: (s) => s.consumes }),
    transitions: t.field({ type: [BehaviourFlowTransitionRef], resolve: (s) => s.transitions }),
    isDecisionPoint: t.exposeBoolean("isDecisionPoint"),
    decision: t.field({
      type: BehaviourFlowDecisionRef,
      nullable: true,
      resolve: (s) => s.decision ?? null,
    }),
    compensates: t.exposeString("compensates", { nullable: true }),
  }),
});

const BehaviourFlowHeaderRef = builder
  .objectRef<BehaviourFlowHeader>("BehaviourFlowHeader")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),
      name: t.exposeString("name"),
      trigger: t.exposeString("trigger"),
      owningService: t.exposeString("owningService", { nullable: true }),
    }),
  });

const BehaviourFlowViewRef = builder.objectRef<BehaviourFlowView>("BehaviourFlowView").implement({
  fields: (t) => ({
    flow: t.field({ type: BehaviourFlowHeaderRef, resolve: (v) => v.flow }),
    steps: t.field({ type: [BehaviourFlowStepRef], resolve: (v) => v.steps }),
  }),
});

// --- Resolvers -------------------------------------------------------------

builder.queryFields((t) => ({
  domainMap: t.field({
    type: DomainMapViewRef,
    description: "The L1 Domain Map: subdomains → bounded contexts → concepts/services.",
    args: { subdomain: t.arg.string(), depth: t.arg.int() },
    resolve: async (_root, args, ctx) => {
      const result = await ctx.views.getView<DomainMapView>(
        "domain-map",
        { subdomain: args.subdomain ?? undefined, depth: args.depth ?? undefined },
        ctx.context,
      );
      return result.data;
    },
  }),
  coverageMap: t.field({
    type: VendorCoverageViewRef,
    description: "The L2 Vendor Coverage Map: L1 rows × vendor columns, with roll-up status.",
    args: { vendor: t.arg.string(), domain: t.arg.string(), rowKind: t.arg.string() },
    resolve: async (_root, args, ctx) => {
      const result = await ctx.views.getView<VendorCoverageView>(
        "vendor-coverage",
        {
          vendor: args.vendor ?? undefined,
          domain: args.domain ?? undefined,
          rowKind: args.rowKind ?? undefined,
        },
        ctx.context,
      );
      return result.data;
    },
  }),
  gapAnalysis: t.field({
    type: GapAnalysisViewRef,
    description: "The deterministic inverse of the Coverage Map — L1 elements with absent realisation layers.",
    args: { domain: t.arg.string(), layer: t.arg.string() },
    resolve: async (_root, args, ctx) => {
      const result = await ctx.views.getView<GapAnalysisView>(
        "gap-analysis",
        { domain: args.domain ?? undefined, layer: args.layer ?? undefined },
        ctx.context,
      );
      return result.data;
    },
  }),
  behaviourFlow: t.field({
    type: BehaviourFlowViewRef,
    description: "A single orchestration flow projected as ordered steps with decision points.",
    args: { flowId: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const result = await ctx.views.getView<BehaviourFlowView>(
        "behaviour-flow",
        { flowId: String(args.flowId) },
        ctx.context,
      );
      return result.data;
    },
  }),
}));
