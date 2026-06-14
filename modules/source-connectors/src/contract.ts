import { describe, expect, it } from "vitest";
import type { SourceConfig, SourceConnector } from "./port";

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * A fresh, ready-to-test connector plus a config that, once `initialize`d, yields
 * at least one document and passes `healthCheck`. Each connector module provides
 * its own factory; the suite below is identical for all of them.
 */
export interface ConnectorContractHarness {
  connector: SourceConnector;
  config: SourceConfig;
  /** Optional cleanup (e.g. remove a temp fixture tree). */
  teardown?: () => void | Promise<void>;
}

export type ConnectorContractHarnessFactory = () =>
  | ConnectorContractHarness
  | Promise<ConnectorContractHarness>;

/**
 * Connector-agnostic contract test suite for {@link SourceConnector} (spec 004).
 * Every connector — filesystem, json (Feature 06), … — must pass this identical
 * suite. Feature 06 reusing this function *is* the OCP proof: the second connector
 * is verified without editing the framework.
 */
export function runSourceConnectorContractTests(
  name: string,
  makeHarness: ConnectorContractHarnessFactory,
): void {
  describe(`SourceConnector contract — ${name}`, () => {
    it("1. exposes non-empty metadata", async () => {
      const { connector, teardown } = await makeHarness();
      try {
        expect(typeof connector.type).toBe("string");
        expect(connector.type.length).toBeGreaterThan(0);
        expect(Array.isArray(connector.supportedFormats)).toBe(true);
        expect(connector.supportedFormats.length).toBeGreaterThan(0);
      } finally {
        await teardown?.();
      }
    });

    it("2. follows the lifecycle: initialise → healthy → ingest", async () => {
      const { connector, config, teardown } = await makeHarness();
      try {
        await connector.initialize(config);
        const health = await connector.healthCheck();
        expect(health.healthy).toBe(true);
        const result = await connector.ingest();
        expect(result).toBeTruthy();
      } finally {
        await teardown?.();
      }
    });

    it("3. discover lists references without fetching content", async () => {
      const { connector, config, teardown } = await makeHarness();
      try {
        await connector.initialize(config);
        const refs = await connector.discover();
        expect(Array.isArray(refs)).toBe(true);
        for (const ref of refs) {
          expect(typeof ref.sourcePath).toBe("string");
          // A reference carries no content field by contract.
          expect((ref as unknown as Record<string, unknown>).content).toBeUndefined();
        }
      } finally {
        await teardown?.();
      }
    });

    it("4. ingest returns a well-formed IngestionResult", async () => {
      const { connector, config, teardown } = await makeHarness();
      try {
        await connector.initialize(config);
        const result = await connector.ingest();

        expect(typeof result.runId).toBe("string");
        expect(Array.isArray(result.documents)).toBe(true);
        expect(Array.isArray(result.errors)).toBe(true);

        const { stats } = result;
        expect(stats.total).toBe(stats.fetched + stats.skipped + stats.failed);
        expect(stats.duration).toBeGreaterThanOrEqual(0);
        expect(result.documents).toHaveLength(stats.fetched);

        for (const doc of result.documents) {
          expect(doc.id.length).toBeGreaterThan(0);
          expect(doc.sourceType).toBe(connector.type);
          expect(typeof doc.sourcePath).toBe("string");
          expect(doc.sourceVersion.length).toBeGreaterThan(0);
          expect(doc.fetchedAt).toMatch(ISO_8601);
          expect(typeof doc.content).toBe("string");
          expect(["markdown", "plaintext", "structured"]).toContain(doc.contentType);
        }

        // Errors, when present, are structured and non-fatal (the run completed).
        for (const err of result.errors) {
          expect(typeof err.documentPath).toBe("string");
          expect(typeof err.error).toBe("string");
          expect(typeof err.retriable).toBe("boolean");
        }
      } finally {
        await teardown?.();
      }
    });

    it("5. re-ingesting with the returned state is idempotent (all skipped)", async () => {
      const { connector, config, teardown } = await makeHarness();
      try {
        await connector.initialize(config);
        const first = await connector.ingest();
        const second = await connector.ingest(first.state);
        expect(second.stats.fetched).toBe(0);
        expect(second.stats.skipped).toBe(second.stats.total);
        expect(second.documents).toHaveLength(0);
      } finally {
        await teardown?.();
      }
    });
  });
}
