import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  computeContentHash,
  computeDocumentId,
  createConnectorRegistry,
  JsonConnector,
} from "../src/index";
import type { CanonicalDocument } from "../src/canonical-document";
import type { SourceConfig } from "../src/port";

const FIXTURES = fileURLToPath(new URL("./fixtures/json-source", import.meta.url));

function config(overrides: Partial<SourceConfig> = {}): SourceConfig {
  return {
    id: "payments-json",
    type: "json",
    connectionDetails: { rootPath: FIXTURES },
    filters: [{ type: "include", pattern: "*.json", field: "name" }],
    sourceAuthority: "scheme",
    ...overrides,
  };
}

/** The shared CanonicalDocument contract the Python enrichment models mirror across the JSONL boundary. */
function expectConformsToCanonicalContract(doc: CanonicalDocument): void {
  expect(typeof doc.id).toBe("string");
  expect(doc.id.length).toBeGreaterThan(0);
  expect(["markdown", "plaintext", "structured"]).toContain(doc.contentType);
  expect(typeof doc.content).toBe("string");
  expect(typeof doc.sourcePath).toBe("string");
  expect(doc.sourceVersion.length).toBeGreaterThan(0);
  expect(Number.isNaN(Date.parse(doc.fetchedAt))).toBe(false);
}

describe("JsonConnector — integration against the decision-log fixture", () => {
  it("ingests fixtures/decision-log.json into a well-formed structured CanonicalDocument", async () => {
    const connector = new JsonConnector();
    await connector.initialize(config());
    const result = await connector.ingest();

    const log = result.documents.find((d) => d.sourcePath.endsWith("decision-log.json"));
    expect(log).toBeTruthy();

    const raw = await readFile(fileURLToPath(new URL("./fixtures/json-source/decision-log.json", import.meta.url)), "utf8");
    const parsed = JSON.parse(raw);

    expectConformsToCanonicalContract(log!);
    expect(log!.sourceType).toBe("json");
    expect(log!.contentType).toBe("structured");
    // structuredContent is the parsed value with full fidelity.
    expect(log!.structuredContent).toEqual(parsed);
    expect(Array.isArray(log!.structuredContent)).toBe(true);
    // Provenance: scheme authority, content-hash version, deterministic id, raw text retained.
    expect(log!.sourceAuthority).toBe("scheme");
    expect(log!.sourceVersion).toBe(computeContentHash(raw));
    expect(log!.id).toBe(computeDocumentId("json", log!.sourcePath, log!.sourceVersion));
    expect(log!.content).toBe(raw);
  });

  it("ingests every fixture as a structured document and conforms to the canonical contract", async () => {
    const connector = new JsonConnector();
    await connector.initialize(config());
    const result = await connector.ingest();

    expect(result.documents.length).toBeGreaterThanOrEqual(2);
    for (const doc of result.documents) {
      expect(doc.contentType).toBe("structured");
      expect(doc.structuredContent).toBeDefined();
      expectConformsToCanonicalContract(doc);
    }
    expect(result.stats.failed).toBe(0);
  });

  it("is reachable through the default registry as the second connector (OCP)", async () => {
    const registry = createConnectorRegistry();
    expect(registry.hasConnector("json")).toBe(true);
    expect(registry.getConnector("json").type).toBe("json");

    const types = registry.listConnectors().map((c) => c.type).sort();
    expect(types).toContain("filesystem");
    expect(types).toContain("json");
  });
});
