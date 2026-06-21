import { afterAll, describe, expect, it } from "vitest";
import { InMemoryGraphAdapter, neo4jAdapterFromEnv } from "@dkm/knowledge-graph";
import type { GraphPort } from "@dkm/knowledge-graph";
import { GraphQueryService } from "@dkm/query";
import { BehaviourFlowProjector, renderBehaviourFlowPlantUml } from "../src/index";
import { BEHAVIOUR_FLOW_ID, ctx, seedBehaviourFlowGraph } from "./helpers";

/**
 * End-to-end Behaviour Flow render (feature 04 acceptance 7 — adapter parity):
 * seed one flow through the graph **port** → project it with the Part 1
 * {@link BehaviourFlowProjector} (which composes only the Query Interface) →
 * {@link renderBehaviourFlowPlantUml}. Because the projector reads through the port,
 * the rendered PlantUML must be **byte-identical** across the in-memory and Neo4j
 * adapters (D-P1.2 port boundary). The Neo4j leg is opt-in and auto-skips without
 * `NEO4J_URI`, so CI stays green with no services/secrets; the real Neo4j parity run
 * is tracked as a follow-up only.
 */
async function renderSeededFlow(graph: GraphPort): Promise<string> {
  await seedBehaviourFlowGraph(graph);
  const service = new GraphQueryService(graph);
  const projector = new BehaviourFlowProjector(service);
  const view = await projector.project({ flowId: BEHAVIOUR_FLOW_ID }, ctx());
  return renderBehaviourFlowPlantUml(view);
}

describe("Behaviour Flow render over a seeded graph — in-memory adapter", () => {
  it("projects then renders valid, decision-highlighted PlantUML for the seeded flow", async () => {
    const uml = await renderSeededFlow(new InMemoryGraphAdapter());

    expect(uml.startsWith("@startuml")).toBe(true);
    expect(uml.trimEnd().endsWith("@enduml")).toBe(true);
    expect(uml).toContain("title Card Authorisation — Behaviour Flow");
    // Steps in sequence order.
    expect(uml.indexOf("as s_step_validate ")).toBeLessThan(uml.indexOf("as s_step_decide "));
    expect(uml.indexOf("as s_step_decide ")).toBeLessThan(uml.indexOf("as s_step_settle "));
    // Events + transition present.
    expect(uml).toContain("e_evt_requested -[#5C6BC0]-> s_step_validate : consumes");
    expect(uml).toContain("s_step_validate -[#5C6BC0]-> e_evt_validated : emits");
    expect(uml).toContain("s_step_validate -[#7E57C2]-> t_step_validate_0 : transitionsTo");
    // Decision point rendered distinctly (gold hexagon + bold-amber edges).
    expect(uml).toContain(
      'hexagon "Authorise Payment\\n«automated»  approved / declined" as d_dec_auth <<Decision>> #FFD54F',
    );
    expect(uml).toContain("s_step_decide -[#F57F17,bold]-> d_dec_auth : invokes");
    expect(uml).toContain("d_dec_auth -[#F57F17,bold]-> e_evt_approved : approved");
  });
});

// Same seed → project → render against Neo4j — opt-in only (D-P1.2), never a CI gate.
const neo4j = neo4jAdapterFromEnv();
if (neo4j) {
  const { adapter, driver } = neo4j;
  afterAll(async () => {
    await adapter.clear();
    await driver.close();
  });
  describe("Behaviour Flow render over a seeded graph — Neo4j adapter (parity, criterion 7)", () => {
    it("renders identical PlantUML to the in-memory adapter from the same seeded flow", async () => {
      const fromMemory = await renderSeededFlow(new InMemoryGraphAdapter());

      await adapter.clear();
      const fromNeo4j = await renderSeededFlow(adapter);

      expect(fromNeo4j).toBe(fromMemory);
    });
  });
} else {
  describe.skip("Behaviour Flow render over a seeded graph — Neo4j adapter (set NEO4J_URI to run)", () => {
    it("is skipped without a configured Neo4j — never a CI gate (D-P1.2, criterion 7)", () => {
      /* documents the guarded, opt-in adapter-parity path */
    });
  });
}
