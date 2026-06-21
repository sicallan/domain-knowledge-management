import { describe, expect, it } from "vitest";
import type { InMemoryGraphAdapter } from "@dkm/knowledge-graph";
import { BehaviourFlowProjector } from "../src/index";
import type { BehaviourFlowStep, BehaviourFlowView } from "../src/index";
import { BEHAVIOUR_FLOW_ID, buildService, ctx, seededBehaviourFlowGraph } from "./helpers";

function projectorOver(graph: InMemoryGraphAdapter): BehaviourFlowProjector {
  return new BehaviourFlowProjector(buildService(graph));
}

function step(view: BehaviourFlowView, id: string): BehaviourFlowStep | undefined {
  return view.steps.find((s) => s.id === id);
}

describe("BehaviourFlowProjector — flow header (criterion 2)", () => {
  it("surfaces the flow's id, name, trigger and owning service", async () => {
    const projector = projectorOver(await seededBehaviourFlowGraph());
    const view = await projector.project({ flowId: BEHAVIOUR_FLOW_ID }, ctx());

    expect(view.flow).toEqual({
      id: "flow-auth",
      name: "Card Authorisation",
      trigger: "AuthorisationRequested",
      owningService: "auth-svc",
    });
  });
});

describe("BehaviourFlowProjector — step ordering (criterion 2)", () => {
  it("orders steps by sequence, not by the order ids appear in flow.steps", async () => {
    const projector = projectorOver(await seededBehaviourFlowGraph());
    const view = await projector.project({ flowId: BEHAVIOUR_FLOW_ID }, ctx());

    expect(view.steps.map((s) => s.id)).toEqual(["step-validate", "step-decide", "step-settle"]);
    expect(view.steps.map((s) => s.sequence)).toEqual([0, 1, 2]);
    expect(step(view, "step-validate")).toMatchObject({
      actionType: "invoke-service",
      serviceOrComponent: "validation-svc",
    });
  });
});

describe("BehaviourFlowProjector — emit / consume / transition wiring (criterion 2)", () => {
  it("reads each step's emitted events from its `emits` edges", async () => {
    const projector = projectorOver(await seededBehaviourFlowGraph());
    const view = await projector.project({ flowId: BEHAVIOUR_FLOW_ID }, ctx());

    expect(step(view, "step-validate")?.emits).toEqual([{ eventId: "evt-validated", name: "CardValidated" }]);
    expect(step(view, "step-settle")?.emits).toEqual([{ eventId: "evt-approved", name: "approved" }]);
    expect(step(view, "step-decide")?.emits).toEqual([]);
  });

  it("derives the first step's `consumes` from the flow's trigger event; later steps consume nothing", async () => {
    const projector = projectorOver(await seededBehaviourFlowGraph());
    const view = await projector.project({ flowId: BEHAVIOUR_FLOW_ID }, ctx());

    expect(step(view, "step-validate")?.consumes).toEqual([
      { eventId: "evt-requested", name: "AuthorisationRequested" },
    ]);
    expect(step(view, "step-decide")?.consumes).toEqual([]);
    expect(step(view, "step-settle")?.consumes).toEqual([]);
  });

  it("surfaces a step's outgoing state transitions (fromState/toState/guardCondition)", async () => {
    const projector = projectorOver(await seededBehaviourFlowGraph());
    const view = await projector.project({ flowId: BEHAVIOUR_FLOW_ID }, ctx());

    expect(step(view, "step-validate")?.transitions).toEqual([
      { fromState: "pending", toState: "validated", guardCondition: "card present" },
    ]);
    expect(step(view, "step-decide")?.transitions).toEqual([]);
  });

  it("surfaces a saga compensation step via its `compensates` edge", async () => {
    const projector = projectorOver(await seededBehaviourFlowGraph());
    const view = await projector.project({ flowId: BEHAVIOUR_FLOW_ID }, ctx());

    expect(step(view, "step-settle")?.compensates).toBe("step-validate");
    expect(step(view, "step-validate")?.compensates).toBeUndefined();
  });
});

describe("BehaviourFlowProjector — decision points highlighted (criterion 3)", () => {
  it("flags a step that invokes a Decision and carries its id/name/type + outcome branches", async () => {
    const projector = projectorOver(await seededBehaviourFlowGraph());
    const view = await projector.project({ flowId: BEHAVIOUR_FLOW_ID }, ctx());

    const decide = step(view, "step-decide");
    expect(decide?.isDecisionPoint).toBe(true);
    expect(decide?.decision).toEqual({
      id: "dec-auth",
      name: "Authorise Payment",
      type: "automated", // mapped from the Decision node's `decisionType` axis field
      outcomes: [
        { label: "approved", producesEventId: "evt-approved" }, // matched via a `produces` edge
        { label: "declined" }, // no produced event → producesEventId omitted
      ],
    });
  });

  it("marks non-decision steps as isDecisionPoint:false with no decision detail", async () => {
    const projector = projectorOver(await seededBehaviourFlowGraph());
    const view = await projector.project({ flowId: BEHAVIOUR_FLOW_ID }, ctx());

    expect(step(view, "step-validate")?.isDecisionPoint).toBe(false);
    expect(step(view, "step-validate")?.decision).toBeUndefined();
  });
});

describe("BehaviourFlowProjector — unknown flow (criterion 4)", () => {
  it("returns an empty, clearly not-found view for a missing flowId (no throw)", async () => {
    const projector = projectorOver(await seededBehaviourFlowGraph());
    const view = await projector.project({ flowId: "flow-does-not-exist" }, ctx());

    expect(view.steps).toEqual([]);
    expect(view.flow).toEqual({ id: "flow-does-not-exist", name: "", trigger: "" });
  });

  it("does not treat a non-OrchestrationFlow node as a flow", async () => {
    const projector = projectorOver(await seededBehaviourFlowGraph());
    // `dec-auth` exists but is a Decision, not a flow.
    const view = await projector.project({ flowId: "dec-auth" }, ctx());
    expect(view.steps).toEqual([]);
    expect(view.flow.name).toBe("");
  });
});

describe("BehaviourFlowProjector — freshness metadata", () => {
  it("counts the flow + its steps in entriesIncluded, zero for a missing flow", async () => {
    const projector = projectorOver(await seededBehaviourFlowGraph());
    const found = await projector.project({ flowId: BEHAVIOUR_FLOW_ID }, ctx());
    expect(projector.entriesIncluded(found)).toBe(4); // 1 flow + 3 steps

    const missing = await projector.project({ flowId: "nope" }, ctx());
    expect(projector.entriesIncluded(missing)).toBe(0);
  });

  it("declares an on-demand refresh policy via describe()", async () => {
    const projector = projectorOver(await seededBehaviourFlowGraph());
    expect(projector.describe().viewType).toBe("behaviour-flow");
    expect(projector.describe().refreshPolicy).toBe("on-demand");
  });
});
