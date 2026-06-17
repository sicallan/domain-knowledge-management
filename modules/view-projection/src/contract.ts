import { describe, expect, it } from "vitest";
import type { GraphMutationEvent } from "@dkm/knowledge-graph";
import type { QueryContext } from "@dkm/query";
import type { ViewEngine, ViewProjector } from "./types";

/**
 * What a view-projector contract-suite factory yields: a fresh projector, an engine
 * with that projector registered, and the params/context to drive a projection.
 */
export interface ViewProjectorContractHarness {
  projector: ViewProjector<Record<string, unknown>, unknown>;
  /** A fresh engine with {@link projector} already registered. */
  engine: ViewEngine;
  /** Params that produce a valid projection for this projector. */
  params: Record<string, unknown>;
  context: QueryContext;
}

export type ViewProjectorContractFactory = () =>
  | ViewProjectorContractHarness
  | Promise<ViewProjectorContractHarness>;

/** A representative graph mutation event, used to prove `invalidatedBy` is total. */
const SAMPLE_EVENT: GraphMutationEvent = {
  eventId: "evt-contract",
  timestamp: "2026-01-01T00:00:00Z",
  mutationType: "NodeCreated",
  entityType: "DomainConcept",
  entityId: "n-1",
  previousState: null,
  newState: null,
  trigger: { type: "loader", identity: "contract" },
  confidence: 1,
  transactionId: "tx-contract",
};

/**
 * Reusable port contract for any {@link ViewProjector} (feature 05 §8). Every view —
 * the Domain Map now, the Compliance Matrix and the rest later — must satisfy this
 * identical suite, proving the port is honoured: a stable `viewType`, a projection
 * that wraps into a well-formed {@link import("./types").ViewResult} through the
 * engine, and a total `invalidatedBy`. Call it inside a test file with a factory that
 * produces a fresh harness per `it`.
 */
export function runViewProjectorContractTests(
  name: string,
  factory: ViewProjectorContractFactory,
): void {
  describe(`ViewProjector contract — ${name}`, () => {
    it("exposes a stable, non-empty viewType", async () => {
      const { projector } = await factory();
      expect(typeof projector.viewType).toBe("string");
      expect(projector.viewType.length).toBeGreaterThan(0);
      // Stable: reading it again yields the same value.
      expect(projector.viewType).toBe(projector.viewType);
    });

    it("project resolves to defined data without throwing", async () => {
      const { projector, params, context } = await factory();
      const data = await projector.project(params, context);
      expect(data).toBeDefined();
      expect(data).not.toBeNull();
    });

    it("getView wraps the projection in a well-formed ViewResult (on-demand: cacheHit/stale false)", async () => {
      const { projector, engine, params, context } = await factory();
      const result = await engine.getView(projector.viewType, params, context);

      expect(result.data).toBeDefined();
      expect(result.metadata.viewType).toBe(projector.viewType);
      expect(typeof result.metadata.computedAt).toBe("string");
      expect(Number.isNaN(Date.parse(result.metadata.computedAt))).toBe(false);
      expect(typeof result.metadata.entriesIncluded).toBe("number");
      expect(result.metadata.entriesIncluded).toBeGreaterThanOrEqual(0);
      expect(result.metadata.cacheHit).toBe(false);
      expect(result.metadata.stale).toBe(false);
    });

    it("invalidatedBy is total — returns a boolean for any event and never throws", async () => {
      const { projector } = await factory();
      expect(typeof projector.invalidatedBy(SAMPLE_EVENT)).toBe("boolean");
      const otherEvent: GraphMutationEvent = { ...SAMPLE_EVENT, mutationType: "EdgeRemoved" };
      expect(typeof projector.invalidatedBy(otherEvent)).toBe("boolean");
    });
  });
}
