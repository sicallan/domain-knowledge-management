import { describe, expect, it } from "vitest";
import { DefaultConnectorRegistry } from "../src/registry";
import type {
  DiscoveryFilter,
  DocumentReference,
  HealthStatus,
  IngestionResult,
  IngestionState,
  SourceConfig,
  SourceConnector,
} from "../src/port";

/**
 * A minimal connector standing in for a *future* connector type (e.g. Feature 06's
 * `json`). Its existence in this test is the OCP proof: a brand-new connector
 * registers through the public `register()` API with zero changes to the registry.
 */
class StubConnector implements SourceConnector {
  readonly type: string;
  readonly supportedFormats: string[];

  constructor(type: string, formats: string[] = ["stub"]) {
    this.type = type;
    this.supportedFormats = formats;
  }

  async initialize(_config: SourceConfig): Promise<void> {}
  async healthCheck(): Promise<HealthStatus> {
    return { healthy: true };
  }
  async ingest(_state?: IngestionState): Promise<IngestionResult> {
    return {
      runId: "r",
      documents: [],
      state: {
        sourceId: "s",
        lastRunId: "r",
        lastRunAt: new Date().toISOString(),
        checkpoint: {},
        documentsProcessed: 0,
        lastDocumentId: "",
      },
      errors: [],
      stats: { total: 0, fetched: 0, skipped: 0, failed: 0, duration: 0 },
    };
  }
  async discover(_filters?: DiscoveryFilter[]): Promise<DocumentReference[]> {
    return [];
  }
}

describe("DefaultConnectorRegistry", () => {
  it("registers a connector and retrieves it by type", () => {
    const registry = new DefaultConnectorRegistry();
    const connector = new StubConnector("filesystem", ["md"]);
    registry.register(connector);
    expect(registry.hasConnector("filesystem")).toBe(true);
    expect(registry.getConnector("filesystem")).toBe(connector);
  });

  it("reports unknown types via hasConnector", () => {
    const registry = new DefaultConnectorRegistry();
    expect(registry.hasConnector("unknown")).toBe(false);
  });

  it("throws when getting an unregistered type", () => {
    const registry = new DefaultConnectorRegistry();
    expect(() => registry.getConnector("unknown")).toThrow(/unknown/i);
  });

  it("throws on duplicate registration of the same type", () => {
    const registry = new DefaultConnectorRegistry();
    registry.register(new StubConnector("filesystem"));
    expect(() => registry.register(new StubConnector("filesystem"))).toThrow(/already/i);
  });

  it("lists registered connectors as metadata", () => {
    const registry = new DefaultConnectorRegistry();
    registry.register(new StubConnector("filesystem", ["md", "txt"]));
    registry.register(new StubConnector("json", ["json"]));
    const listed = registry.listConnectors().sort((a, b) => a.type.localeCompare(b.type));
    expect(listed).toEqual([
      { type: "filesystem", supportedFormats: ["md", "txt"] },
      { type: "json", supportedFormats: ["json"] },
    ]);
  });

  it("OCP: a second, previously-unknown connector type registers without touching the registry", () => {
    const registry = new DefaultConnectorRegistry();
    registry.register(new StubConnector("filesystem", ["md"]));
    // Feature 06's connector is added purely through the public API.
    const future = new StubConnector("json", ["json"]);
    expect(() => registry.register(future)).not.toThrow();
    expect(registry.getConnector("json")).toBe(future);
    expect(registry.hasConnector("filesystem")).toBe(true);
  });
});
