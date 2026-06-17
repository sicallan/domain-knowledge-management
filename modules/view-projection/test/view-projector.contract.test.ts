import { runViewProjectorContractTests } from "../src/contract";
import { DefaultViewEngine, DomainMapProjector } from "../src/index";
import { buildService, ctx, seededInMemoryGraph } from "./helpers";

// The Domain Map projector must honour the reusable ViewProjector port contract
// (feature 05 §8). Future views (Compliance Matrix, Vendor Coverage, …) reuse this
// exact suite by supplying their own factory.
runViewProjectorContractTests("DomainMapProjector", async () => {
  const graph = await seededInMemoryGraph();
  const service = buildService(graph);
  const projector = new DomainMapProjector(service);
  const engine = new DefaultViewEngine(service);
  engine.registerProjector(projector);
  return { projector, engine, params: {}, context: ctx() };
});
