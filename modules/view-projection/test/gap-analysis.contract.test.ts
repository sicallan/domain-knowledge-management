import { runViewProjectorContractTests } from "../src/contract";
import { DefaultViewEngine, GapAnalysisProjector } from "../src/index";
import { buildService, ctx, seededCoverageGraph } from "./helpers";

// The Gap Analysis projector reuses the identical ViewProjector port contract
// (feature 04 criterion 1) — same suite as every other view.
runViewProjectorContractTests("GapAnalysisProjector", async () => {
  const service = buildService(await seededCoverageGraph());
  const projector = new GapAnalysisProjector(service);
  const engine = new DefaultViewEngine(service);
  engine.registerProjector(projector);
  return { projector, engine, params: {}, context: ctx() };
});
