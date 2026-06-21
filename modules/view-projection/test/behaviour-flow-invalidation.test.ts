import { describe, expect, it } from "vitest";
import type { GraphMutationEvent } from "@dkm/knowledge-graph";
import { BehaviourFlowProjector } from "../src/index";
import { buildService, seededBehaviourFlowGraph } from "./helpers";

function event(entityType: string, entityId: string): GraphMutationEvent {
  return {
    eventId: `evt-${entityId}`,
    timestamp: "2026-01-01T00:00:00Z",
    mutationType: "NodeUpdated",
    entityType,
    entityId,
    previousState: null,
    newState: null,
    trigger: { type: "loader", identity: "test" },
    confidence: 1,
    transactionId: "tx-1",
  };
}

async function projector(): Promise<BehaviourFlowProjector> {
  return new BehaviourFlowProjector(buildService(await seededBehaviourFlowGraph()));
}

describe("BehaviourFlowProjector — invalidatedBy (criterion 6)", () => {
  it("invalidates on mutations to the node types a flow is built from", async () => {
    const p = await projector();
    for (const type of ["OrchestrationFlow", "OrchestrationStep", "Event", "StateTransition", "Decision"]) {
      expect(p.invalidatedBy(event(type, "n-1"))).toBe(true);
    }
  });

  it("invalidates on behavioural / decision edge mutations (Relationship:* entity types)", async () => {
    const p = await projector();
    for (const rel of [
      "Relationship:triggers",
      "Relationship:emits",
      "Relationship:transitionsTo",
      "Relationship:invokes",
      "Relationship:produces",
      "Relationship:compensates",
    ]) {
      expect(p.invalidatedBy(event(rel, "r-1"))).toBe(true);
    }
  });

  it("does NOT invalidate on unrelated node types", async () => {
    const p = await projector();
    for (const type of ["Subdomain", "BoundedContext", "DomainConcept", "Service"]) {
      expect(p.invalidatedBy(event(type, "n-2"))).toBe(false);
    }
  });

  it("is total — returns a boolean and never throws for any event", async () => {
    const p = await projector();
    const edgeRemoved: GraphMutationEvent = { ...event("Relationship:emits", "r-9"), mutationType: "EdgeRemoved" };
    expect(typeof p.invalidatedBy(edgeRemoved)).toBe("boolean");
    expect(typeof p.invalidatedBy(event("Anything", "x"))).toBe("boolean");
  });
});
