import { runViewProjectorContractTests } from "../src/contract";
import { DefaultViewEngine, VendorCoverageProjector } from "../src/index";
import { buildService, ctx, seededCoverageGraph } from "./helpers";

// The Vendor Coverage Map projector reuses the identical ViewProjector port contract
// (feature 03 criterion 1) — same suite as the Domain Map / Behaviour Flow views.
runViewProjectorContractTests("VendorCoverageProjector", async () => {
  const service = buildService(await seededCoverageGraph());
  const projector = new VendorCoverageProjector(service);
  const engine = new DefaultViewEngine(service);
  engine.registerProjector(projector);
  return { projector, engine, params: {}, context: ctx() };
});
