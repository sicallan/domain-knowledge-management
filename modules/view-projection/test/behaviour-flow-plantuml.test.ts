import { describe, expect, it } from "vitest";
import { renderBehaviourFlowPlantUml } from "../src/index";
import type { BehaviourFlowView } from "../src/index";

/**
 * A known Behaviour Flow view, hand-built to the **same seeded flow shape** as the
 * Part 1 projector fixture ({@link seedBehaviourFlowGraph}) — a Payments card
 * authorisation flow exercising every projected facet the renderer must show:
 *
 *  - three steps held in `sequence` order: `step-validate` (0) → `step-decide` (1) → `step-settle` (2);
 *  - an emitted event (`evt-validated`) and a consumed/trigger event (`evt-requested`);
 *  - an outgoing state transition with a guard (`pending → validated`);
 *  - one **decision-point** step (`step-decide`) carrying an automated Decision with
 *    two outcome branches (one of which produces an event);
 *  - a saga `compensates` edge (`step-settle` rolls back `step-validate`).
 */
const VIEW: BehaviourFlowView = {
  flow: { id: "flow-auth", name: "Card Authorisation", trigger: "AuthorisationRequested", owningService: "auth-svc" },
  steps: [
    {
      id: "step-validate",
      sequence: 0,
      actionType: "invoke-service",
      serviceOrComponent: "validation-svc",
      emits: [{ eventId: "evt-validated", name: "CardValidated" }],
      consumes: [{ eventId: "evt-requested", name: "AuthorisationRequested" }],
      transitions: [{ fromState: "pending", toState: "validated", guardCondition: "card present" }],
      isDecisionPoint: false,
    },
    {
      id: "step-decide",
      sequence: 1,
      actionType: "evaluate-decision",
      serviceOrComponent: "auth-svc",
      emits: [],
      consumes: [],
      transitions: [],
      isDecisionPoint: true,
      decision: {
        id: "dec-auth",
        name: "Authorise Payment",
        type: "automated",
        outcomes: [
          { label: "approved", producesEventId: "evt-approved" },
          { label: "declined" },
        ],
      },
    },
    {
      id: "step-settle",
      sequence: 2,
      actionType: "publish-event",
      serviceOrComponent: "settlement-svc",
      emits: [{ eventId: "evt-approved", name: "approved" }],
      consumes: [],
      transitions: [],
      isDecisionPoint: false,
      compensates: "step-validate",
    },
  ],
};

/**
 * The golden PlantUML for {@link VIEW}. Mirrors the demo exporter's visual language
 * (gold-hexagon Decisions `#FFD54F`, bold-amber decision edges `#F57F17`, blue step
 * boxes, yellow event ovals, purple state transitions, `left to right direction`) but
 * is driven entirely by the typed {@link BehaviourFlowView}. In-label line breaks are
 * PlantUML `\n` (a literal backslash-n in the emitted string).
 */
const GOLDEN = `@startuml behaviour-flow
title Card Authorisation — Behaviour Flow
skinparam shadowing false
skinparam defaultFontName Helvetica
left to right direction
legend right
  Flow: <b>Card Authorisation</b>  (flow-auth)
  Trigger: AuthorisationRequested · Owner: auth-svc
  Decision points are gold hexagons (where regulation bites); bold amber arrows are outcomes.
  Blue = steps · yellow = events · purple = state transitions.
endlegend

rectangle "step-validate\\n#0 «invoke-service» @validation-svc" as s_step_validate <<Step>> #C5CAE9
rectangle "step-decide\\n#1 «evaluate-decision» @auth-svc" as s_step_decide <<Step>> #C5CAE9
rectangle "step-settle\\n#2 «publish-event» @settlement-svc" as s_step_settle <<Step>> #C5CAE9

usecase "AuthorisationRequested" as e_evt_requested <<Event>> #FFE082
usecase "CardValidated" as e_evt_validated <<Event>> #FFE082
usecase "approved" as e_evt_approved <<Event>> #FFE082

rectangle "pending → validated\\n[card present]" as t_step_validate_0 <<StateTransition>> #B39DDB

hexagon "Authorise Payment\\n«automated»  approved / declined" as d_dec_auth <<Decision>> #FFD54F

s_step_validate -[#90A4AE,dashed]-> s_step_decide : then
s_step_decide -[#90A4AE,dashed]-> s_step_settle : then

e_evt_requested -[#5C6BC0]-> s_step_validate : consumes
s_step_validate -[#5C6BC0]-> e_evt_validated : emits
s_step_validate -[#7E57C2]-> t_step_validate_0 : transitionsTo
s_step_decide -[#F57F17,bold]-> d_dec_auth : invokes
d_dec_auth -[#F57F17,bold]-> e_evt_approved : approved
s_step_settle -[#5C6BC0]-> e_evt_approved : emits
s_step_settle -[#5C6BC0,dashed]-> s_step_validate : compensates
@enduml`;

describe("renderBehaviourFlowPlantUml — golden render (criterion 5)", () => {
  it("renders the known view to the exact expected PlantUML", () => {
    expect(renderBehaviourFlowPlantUml(VIEW)).toBe(GOLDEN);
  });
});

describe("renderBehaviourFlowPlantUml — structural guarantees (criterion 5)", () => {
  const uml = renderBehaviourFlowPlantUml(VIEW);

  it("is wrapped in a single @startuml … @enduml block", () => {
    expect(uml.startsWith("@startuml")).toBe(true);
    expect(uml.trimEnd().endsWith("@enduml")).toBe(true);
    expect(uml.match(/@startuml/g)).toHaveLength(1);
    expect(uml.match(/@enduml/g)).toHaveLength(1);
  });

  it("surfaces the flow header (name/trigger/owner) as the diagram title and legend", () => {
    expect(uml).toContain("title Card Authorisation — Behaviour Flow");
    expect(uml).toContain("Flow: <b>Card Authorisation</b>  (flow-auth)");
    expect(uml).toContain("Trigger: AuthorisationRequested · Owner: auth-svc");
  });

  it("renders steps in sequence order, not view-array order", () => {
    const order = ["s_step_validate", "s_step_decide", "s_step_settle"].map((alias) =>
      uml.indexOf(`as ${alias} `),
    );
    expect(order.every((idx) => idx >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // The "then" sequence arrows chain the steps in order.
    expect(uml).toContain("s_step_validate -[#90A4AE,dashed]-> s_step_decide : then");
    expect(uml).toContain("s_step_decide -[#90A4AE,dashed]-> s_step_settle : then");
  });

  it("renders every emitted and consumed event", () => {
    expect(uml).toContain("e_evt_requested -[#5C6BC0]-> s_step_validate : consumes");
    expect(uml).toContain("s_step_validate -[#5C6BC0]-> e_evt_validated : emits");
    expect(uml).toContain("s_step_settle -[#5C6BC0]-> e_evt_approved : emits");
  });

  it("renders every state transition with its guard", () => {
    expect(uml).toContain('rectangle "pending → validated\\n[card present]" as t_step_validate_0');
    expect(uml).toContain("s_step_validate -[#7E57C2]-> t_step_validate_0 : transitionsTo");
  });

  it("renders the decision point distinctly — a gold hexagon with the decision name, type and outcomes", () => {
    // Gold hexagon (the demo's Decision style) carrying name + «type» + outcome labels.
    expect(uml).toContain(
      'hexagon "Authorise Payment\\n«automated»  approved / declined" as d_dec_auth <<Decision>> #FFD54F',
    );
    // Bold-amber decision edges (invokes + the producing outcome branch).
    expect(uml).toContain("s_step_decide -[#F57F17,bold]-> d_dec_auth : invokes");
    expect(uml).toContain("d_dec_auth -[#F57F17,bold]-> e_evt_approved : approved");
    // A non-decision step is NOT rendered as a hexagon.
    expect(uml).not.toContain("s_step_validate <<Decision>>");
  });

  it("renders the saga compensation edge", () => {
    expect(uml).toContain("s_step_settle -[#5C6BC0,dashed]-> s_step_validate : compensates");
  });
});
