import { describe, expect, it } from "vitest";
import type { Evidence, InventoryEntry, RelationshipEntry } from "@dkm/schema";
import type { GraphPort, GraphPortFactory } from "./port";

const EVIDENCE: Evidence[] = [{ source: "spec.md", fetchedAt: "2026-01-01T00:00:00Z", sourceAuthority: "scheme" }];

let seq = 0;
function uuid(): string {
  seq += 1;
  return `00000000-0000-4000-8000-${seq.toString(16).padStart(12, "0")}`;
}

function makeNode(type: string, extra: Record<string, unknown> = {}, id = uuid()): InventoryEntry {
  return {
    id,
    type,
    version: "1.0.0",
    lifecycle_status: "active",
    validFrom: "2026-01-01T00:00:00Z",
    validTo: null,
    evidencedBy: EVIDENCE,
    confidence: 0.9,
    ...extra,
  };
}

function makeEdge(relationshipType: string, sourceId: string, targetId: string): RelationshipEntry {
  return {
    id: uuid(),
    type: "Relationship",
    version: "1.0.0",
    relationshipType,
    sourceId,
    targetId,
    evidencedBy: EVIDENCE,
  };
}

/**
 * Adapter-agnostic contract test suite for {@link GraphPort} (spec 002
 * "Port Contract Test Suite"). Any adapter — in-memory, Neo4j, … — must pass
 * this identical suite. Call inside a test file with a factory producing a fresh
 * port instance.
 */
export function runGraphPortContractTests(name: string, factory: GraphPortFactory): void {
  describe(`GraphPort contract — ${name}`, () => {
    describe("1. CRUD correctness", () => {
      it("upsert creates a retrievable node and emits NodeCreated", async () => {
        const port = await factory();
        const node = makeNode("DomainConcept", { name: "Payment", conceptType: "aggregate" });
        const result = await port.upsertNode(node);
        expect(result.success).toBe(true);
        expect(result.revision).toBe(1);

        const fetched = await port.getNode(node.id);
        expect(fetched?.name).toBe("Payment");

        const events = await port.getEvents();
        expect(events.filter((e) => e.mutationType === "NodeCreated")).toHaveLength(1);
      });

      it("re-upsert with a change updates the node and bumps revision", async () => {
        const port = await factory();
        const node = makeNode("DomainConcept", { name: "Payment", conceptType: "aggregate" });
        await port.upsertNode(node);
        const updated = await port.upsertNode({ ...node, name: "Card Payment" });
        expect(updated.revision).toBe(2);
        const fetched = await port.getNode(node.id);
        expect(fetched?.name).toBe("Card Payment");
      });

      it("delete soft-removes (retired + validTo) and emits NodeRetired", async () => {
        const port = await factory();
        const node = makeNode("Rule", { expression: "x>0", ruleType: "validation" });
        await port.upsertNode(node);
        const result = await port.deleteNode(node.id);
        expect(result.success).toBe(true);
        const fetched = await port.getNode(node.id);
        expect(fetched?.lifecycle_status).toBe("retired");
        expect(fetched?.validTo).toBeTruthy();
        const events = await port.getEvents(undefined, undefined, [{ mutationType: "NodeRetired" }]);
        expect(events).toHaveLength(1);
      });

      it("nodeExists reflects presence", async () => {
        const port = await factory();
        const node = makeNode("Rule", { expression: "x>0", ruleType: "validation" });
        expect(await port.nodeExists(node.id)).toBe(false);
        await port.upsertNode(node);
        expect(await port.nodeExists(node.id)).toBe(true);
      });
    });

    describe("2. Edge operations & cardinality", () => {
      it("creates and retrieves an edge by direction", async () => {
        const port = await factory();
        const decision = makeNode("Decision", { name: "Authorise", decisionType: "automated", outcomes: ["ok"] });
        const rule = makeNode("Rule", { expression: "x>0", ruleType: "validation" });
        await port.upsertNode(decision);
        await port.upsertNode(rule);
        const edge = makeEdge("evaluates", decision.id, rule.id);
        const result = await port.createEdge(edge);
        expect(result.success).toBe(true);

        expect(await port.getEdges(decision.id, "out")).toHaveLength(1);
        expect(await port.getEdges(rule.id, "in")).toHaveLength(1);
        expect(await port.getEdges(rule.id, "out")).toHaveLength(0);
      });

      it("removes an edge and emits EdgeRemoved", async () => {
        const port = await factory();
        const a = makeNode("Service", { name: "svc" });
        const b = makeNode("DomainConcept", { name: "Payment", conceptType: "aggregate" });
        await port.upsertNode(a);
        await port.upsertNode(b);
        await port.createEdge(makeEdge("implements", a.id, b.id));
        const result = await port.removeEdge(a.id, b.id, "implements");
        expect(result.success).toBe(true);
        expect(await port.getEdges(a.id, "out")).toHaveLength(0);
      });

      it("enforces cardinality (belongsTo is N:1 — a second edge is rejected)", async () => {
        const port = await factory();
        const svc = makeNode("Service", { name: "svc" });
        const ctxA = makeNode("DomainConcept", { name: "ContextA", conceptType: "aggregate" });
        const ctxB = makeNode("DomainConcept", { name: "ContextB", conceptType: "aggregate" });
        await port.upsertNode(svc);
        await port.upsertNode(ctxA);
        await port.upsertNode(ctxB);
        expect((await port.createEdge(makeEdge("belongsTo", svc.id, ctxA.id))).success).toBe(true);
        const second = await port.createEdge(makeEdge("belongsTo", svc.id, ctxB.id));
        expect(second.success).toBe(false);
        expect(second.error?.code).toBe("CARDINALITY");
      });
    });

    describe("3. Event emission", () => {
      it("produces exactly one event per mutation with correct types", async () => {
        const port = await factory();
        const node = makeNode("Rule", { expression: "x>0", ruleType: "validation" });
        await port.upsertNode(node);
        await port.upsertNode({ ...node, expression: "x>1" });
        await port.deleteNode(node.id);
        const events = await port.getEvents(undefined, undefined, [{ entityId: node.id }]);
        expect(events.map((e) => e.mutationType)).toEqual(["NodeCreated", "NodeUpdated", "NodeRetired"]);
        for (const e of events) {
          expect(e.eventId).toBeTruthy();
          expect(e.timestamp).toBeTruthy();
          expect(e.transactionId).toBeTruthy();
        }
      });
    });

    describe("4. Transaction atomicity", () => {
      it("rolls back all operations when one fails", async () => {
        const port = await factory();
        const good = makeNode("Rule", { expression: "x>0", ruleType: "validation" });
        const tx = await port.beginTransaction();
        await tx.upsertNode(good);
        // The second op targets the same node with a stale expected revision (the
        // first op will have set it to 1), forcing a conflict during commit.
        await tx.upsertNode({ ...good, expression: "x>9" }, { expectedRevision: 99 });
        await expect(tx.commit()).rejects.toThrow();
        // Nothing from the transaction was applied.
        expect(await port.nodeExists(good.id)).toBe(false);
        expect(await port.getEvents()).toHaveLength(0);
      });

      it("applies all operations on a successful commit", async () => {
        const port = await factory();
        const n1 = makeNode("Rule", { expression: "x>0", ruleType: "validation" });
        const n2 = makeNode("Rule", { expression: "y>0", ruleType: "validation" });
        const tx = await port.beginTransaction();
        await tx.upsertNode(n1);
        await tx.upsertNode(n2);
        await tx.createEdge(makeEdge("constrainedBy", n1.id, n2.id));
        await tx.commit();
        expect(await port.nodeExists(n1.id)).toBe(true);
        expect(await port.nodeExists(n2.id)).toBe(true);
        expect(await port.getEdges(n1.id, "out")).toHaveLength(1);
        // All events share one transactionId.
        const events = await port.getEvents();
        const txIds = new Set(events.map((e) => e.transactionId));
        expect(txIds.size).toBe(1);
      });
    });

    describe("5. Optimistic concurrency", () => {
      it("rejects an update with a stale expected revision", async () => {
        const port = await factory();
        const node = makeNode("Rule", { expression: "x>0", ruleType: "validation" });
        const first = await port.upsertNode(node);
        expect(first.revision).toBe(1);
        // A correct expectedRevision succeeds.
        const ok = await port.upsertNode({ ...node, expression: "x>1" }, { expectedRevision: 1 });
        expect(ok.success).toBe(true);
        // The original (now stale) revision is rejected.
        const stale = await port.upsertNode({ ...node, expression: "x>2" }, { expectedRevision: 1 });
        expect(stale.success).toBe(false);
        expect(stale.error?.code).toBe("CONFLICT");
      });
    });

    describe("6. Temporal queries", () => {
      it("point-in-time read returns the historical state", async () => {
        const port = await factory();
        const node = makeNode("DomainConcept", { name: "Payment", conceptType: "aggregate" });
        const created = await port.upsertNode(node);
        const createdEvent = (await port.getEvents(undefined, undefined, [{ mutationType: "NodeCreated" }]))[0];
        const t1 = createdEvent!.timestamp;
        await port.upsertNode({ ...node, name: "Card Payment" });

        const atT1 = await port.getNode(node.id, t1);
        expect(atT1?.name).toBe("Payment");
        const latest = await port.getNode(node.id);
        expect(latest?.name).toBe("Card Payment");
        expect(created.success).toBe(true);
      });
    });

    describe("7. Traversal correctness", () => {
      it("returns the reachable subgraph within the depth limit", async () => {
        const port = await factory();
        const d = makeNode("Decision", { name: "Authorise", decisionType: "automated", outcomes: ["ok"] });
        const r = makeNode("Rule", { expression: "x>0", ruleType: "validation" });
        const ref = makeNode("ReferenceData", { name: "Limits", owner: "Steward" });
        await port.upsertNode(d);
        await port.upsertNode(r);
        await port.upsertNode(ref);
        await port.createEdge(makeEdge("evaluates", d.id, r.id));
        await port.createEdge(makeEdge("consumes", r.id, ref.id));

        const depth1 = await port.traverse({ startNodeId: d.id, direction: "out", maxDepth: 1 });
        expect(depth1.nodes.map((n) => n.id).sort()).toEqual([d.id, r.id].sort());

        const depth2 = await port.traverse({ startNodeId: d.id, direction: "out", maxDepth: 2 });
        expect(depth2.nodes.map((n) => n.id).sort()).toEqual([d.id, r.id, ref.id].sort());
      });

      it("findByType returns matching nodes, findPath returns a connecting path", async () => {
        const port = await factory();
        const d = makeNode("Decision", { name: "Authorise", decisionType: "automated", outcomes: ["ok"] });
        const r = makeNode("Rule", { expression: "x>0", ruleType: "validation" });
        await port.upsertNode(d);
        await port.upsertNode(r);
        await port.createEdge(makeEdge("evaluates", d.id, r.id));

        const decisions = await port.findByType("Decision");
        expect(decisions).toHaveLength(1);

        const paths = await port.findPath({ sourceId: d.id, targetId: r.id });
        expect(paths).toHaveLength(1);
        expect(paths[0]?.nodeIds).toEqual([d.id, r.id]);
      });
    });

    describe("8. Idempotency", () => {
      it("re-upserting an identical node is a no-op (no new event, same revision)", async () => {
        const port = await factory();
        const node = makeNode("Rule", { expression: "x>0", ruleType: "validation" });
        await port.upsertNode(node);
        const before = await port.getEvents();
        const again = await port.upsertNode({ ...node });
        expect(again.noop).toBe(true);
        expect(again.revision).toBe(1);
        const after = await port.getEvents();
        expect(after).toHaveLength(before.length);
      });
    });
  });
}

/** Re-exported for adapters that only want the port type next to the suite. */
export type { GraphPort };
