export * from "./types";
export { DefaultViewEngine } from "./engine";
export { DomainMapProjector } from "./domain-map-projector";
export { CapabilityMapProjector } from "./capability-map-projector";
export { BusinessArchitectureProjector } from "./business-architecture-projector";
export { BehaviourFlowProjector } from "./behaviour-flow-projector";
export { renderBehaviourFlowPlantUml } from "./behaviour-flow-plantuml";

// Phase 3 — L2 coverage & gap views, sharing one realisation predicate (D-P3.3).
export {
  buildMappingIndex,
  isFunctionallyRealised,
  isTechnicallyRealised,
  maxCoveragePercentage,
  missingLayers,
  readElementRealisation,
  rollUpCoverage,
  rowCoverageStatus,
  FUNCTIONAL_EDGE_TYPES,
  TECHNICAL_EDGE_TYPES,
} from "./realisation-predicate";
export type { Coverage, ElementRealisation, MappingRef } from "./realisation-predicate";
export { VendorCoverageProjector } from "./vendor-coverage-projector";
export { renderVendorCoverageMarkdown } from "./vendor-coverage-render";
export { GapAnalysisProjector } from "./gap-analysis-projector";
export { renderGapAnalysisMarkdown } from "./gap-analysis-render";
// The contract suite imports vitest; consume it via `@dkm/view-projection/src/contract`.
