import { describe, expect, it } from "vitest";
import { runViewProjectorContractTests } from "../src/contract";
import { BehaviourFlowProjector, DefaultViewEngine, DomainMapProjector } from "../src/index";
import type { BehaviourFlowView, ViewProjector } from "../src/index";
import { BEHAVIOUR_FLOW_ID, buildService, ctx, seededBehaviourFlowGraph } from "./helpers";

// The Behaviour Flow projector must honour the reusable ViewProjector port contract
// (feature 05 §8) — the SAME suite the Domain Map uses, supplied with its own factory.
// The harness types `projector` as the generic port (`ViewProjector<Record<string,
// unknown>, unknown>`); this projector's params are the narrower `{ flowId: string }`,
// so it is widened to the base port (the suite only exercises base-port members).
runViewProjectorContractTests("BehaviourFlowProjector", async () => {
  const service = buildService(await seededBehaviourFlowGraph());
  const projector = new BehaviourFlowProjector(service);
  const engine = new DefaultViewEngine(service);
  engine.registerProjector(projector);
  return {
    projector: projector as unknown as ViewProjector<Record<string, unknown>, unknown>,
    engine,
    params: { flowId: BEHAVIOUR_FLOW_ID },
    context: ctx(),
  };
});

describe("BehaviourFlowProjector — registration is the only touch-point (criterion 1, OCP)", () => {
  it("exposes `behaviour-flow` in listViews() once registered, with no engine edit", async () => {
    const service = buildService(await seededBehaviourFlowGraph());
    const engine = new DefaultViewEngine(service);
    engine.registerProjector(new BehaviourFlowProjector(service));

    const flow = engine.listViews().find((v) => v.viewType === "behaviour-flow");
    expect(flow).toBeDefined();
    expect(flow?.refreshPolicy).toBe("on-demand");
  });

  it("coexists with the Domain Map projector — both views are listed, neither disturbs the other", async () => {
    const service = buildService(await seededBehaviourFlowGraph());
    const engine = new DefaultViewEngine(service);
    engine.registerProjector(new DomainMapProjector(service));
    engine.registerProjector(new BehaviourFlowProjector(service));

    expect(engine.listViews().map((v) => v.viewType).sort()).toEqual(["behaviour-flow", "domain-map"]);
  });

  it("dispatches getView('behaviour-flow', {flowId}) and wraps it with freshness metadata", async () => {
    const service = buildService(await seededBehaviourFlowGraph());
    const engine = new DefaultViewEngine(service);
    engine.registerProjector(new BehaviourFlowProjector(service));

    const result = await engine.getView<BehaviourFlowView>("behaviour-flow", { flowId: BEHAVIOUR_FLOW_ID }, ctx());
    expect(result.metadata.viewType).toBe("behaviour-flow");
    expect(result.metadata.cacheHit).toBe(false);
    expect(result.metadata.stale).toBe(false);
    expect(result.metadata.entriesIncluded).toBe(4);
    expect(result.data.flow.id).toBe("flow-auth");
    expect(result.data.steps.map((s) => s.id)).toEqual(["step-validate", "step-decide", "step-settle"]);
  });
});
