import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeContentHash, computeDocumentId, JsonConnector } from "../src/index";
import type { SourceConfig } from "../src/port";

function config(rootPath: string, overrides: Partial<SourceConfig> = {}): SourceConfig {
  return {
    id: "json-source",
    type: "json",
    connectionDetails: { rootPath },
    filters: [{ type: "include", pattern: "*.json", field: "name" }],
    sourceAuthority: "project",
    ...overrides,
  };
}

async function freshConnector(cfg: SourceConfig): Promise<JsonConnector> {
  const connector = new JsonConnector();
  await connector.initialize(cfg);
  return connector;
}

describe("JsonConnector — metadata", () => {
  it("declares the json type and supported format", () => {
    const connector = new JsonConnector();
    expect(connector.type).toBe("json");
    expect(connector.supportedFormats).toEqual(["json"]);
  });
});

describe("JsonConnector — structured canonicalisation", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "json-connector-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("canonicalises an object source to structured content with full fidelity", async () => {
    const value = { boundedContext: "Authorisation", policies: { retryLimit: 3, synchronous: true } };
    const raw = JSON.stringify(value, null, 2);
    await writeFile(join(tmp, "inventory.json"), raw);

    const connector = await freshConnector(config(tmp));
    const result = await connector.ingest();

    expect(result.documents).toHaveLength(1);
    const doc = result.documents[0]!;
    expect(doc.contentType).toBe("structured");
    expect(doc.structuredContent).toEqual(value);
    // The raw JSON text is preserved verbatim as `content`.
    expect(doc.content).toBe(raw);
  });

  it("canonicalises an array source to structured content with full fidelity", async () => {
    const value = [
      { id: "DEC-001", decision: "Authorise synchronously" },
      { id: "DEC-002", decision: "Tokenise credentials" },
    ];
    const raw = JSON.stringify(value);
    await writeFile(join(tmp, "decisions.json"), raw);

    const connector = await freshConnector(config(tmp));
    const result = await connector.ingest();

    expect(result.documents).toHaveLength(1);
    const doc = result.documents[0]!;
    expect(doc.contentType).toBe("structured");
    expect(Array.isArray(doc.structuredContent)).toBe(true);
    expect(doc.structuredContent).toEqual(value);
  });

  it("carries provenance and a deterministic id derived from the content hash", async () => {
    const raw = JSON.stringify({ id: "DEC-001" });
    await writeFile(join(tmp, "one.json"), raw);

    const connector = await freshConnector(config(tmp));
    const result = await connector.ingest();
    const doc = result.documents[0]!;

    expect(doc.sourceType).toBe("json");
    expect(doc.sourceAuthority).toBe("project");
    expect(isAbsolute(doc.sourcePath)).toBe(true);
    expect(doc.sourcePath.endsWith("one.json")).toBe(true);
    expect(doc.sourceVersion).toBe(computeContentHash(raw));
    expect(doc.sourceVersion).toMatch(/^[0-9a-f]{64}$/);
    expect(doc.id).toBe(computeDocumentId("json", doc.sourcePath, doc.sourceVersion));
    expect(Number.isNaN(Date.parse(doc.fetchedAt))).toBe(false);
  });

  it("only walks *.json files, ignoring other extensions", async () => {
    await writeFile(join(tmp, "keep.json"), JSON.stringify({ keep: true }));
    await writeFile(join(tmp, "skip.md"), "# not json");
    await writeFile(join(tmp, "skip.txt"), "plain");

    const connector = await freshConnector(config(tmp, { filters: [] }));
    const result = await connector.ingest();

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]!.sourcePath.endsWith("keep.json")).toBe(true);
  });

  it("emits sorted, deterministic output across files", async () => {
    await writeFile(join(tmp, "b.json"), JSON.stringify({ n: 2 }));
    await writeFile(join(tmp, "a.json"), JSON.stringify({ n: 1 }));
    await writeFile(join(tmp, "c.json"), JSON.stringify({ n: 3 }));

    const connector = await freshConnector(config(tmp));
    const result = await connector.ingest();

    const order = result.documents.map((d) => d.sourcePath.replace(/^.*\//, ""));
    expect(order).toEqual(["a.json", "b.json", "c.json"]);
  });
});

describe("JsonConnector — error handling", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "json-connector-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("skips malformed JSON and reports it as a non-retriable error without aborting the run", async () => {
    await writeFile(join(tmp, "good.json"), JSON.stringify({ ok: true }));
    await writeFile(join(tmp, "bad.json"), "{ not: valid json, ");

    const connector = await freshConnector(config(tmp));
    const result = await connector.ingest();

    expect(result.stats.total).toBe(2);
    expect(result.stats.fetched).toBe(1);
    expect(result.stats.failed).toBe(1);
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]!.sourcePath.endsWith("good.json")).toBe(true);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.documentPath.endsWith("bad.json")).toBe(true);
    // Re-parsing malformed JSON will not succeed, so the error is not retriable.
    expect(result.errors[0]!.retriable).toBe(false);
  });
});

describe("JsonConnector — incremental ingestion", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "json-connector-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("skips every unchanged source on an incremental re-run", async () => {
    await writeFile(join(tmp, "a.json"), JSON.stringify({ n: 1 }));
    await writeFile(join(tmp, "b.json"), JSON.stringify({ n: 2 }));

    const connector = await freshConnector(config(tmp));
    const first = await connector.ingest();
    expect(first.stats.fetched).toBe(2);

    const second = await connector.ingest(first.state);
    expect(second.stats.fetched).toBe(0);
    expect(second.stats.skipped).toBe(second.stats.total);
    expect(second.documents).toHaveLength(0);
  });

  it("re-emits only the changed source and advances its checkpoint", async () => {
    await writeFile(join(tmp, "a.json"), JSON.stringify({ n: 1 }));
    await writeFile(join(tmp, "b.json"), JSON.stringify({ n: 2 }));

    const connector = await freshConnector(config(tmp));
    const first = await connector.ingest();
    const bBefore = first.state.checkpoint[join(tmp, "b.json")] as { hash: string };

    await writeFile(join(tmp, "b.json"), JSON.stringify({ n: 2, revised: true }));
    const second = await connector.ingest(first.state);

    expect(second.stats.fetched).toBe(1);
    expect(second.stats.skipped).toBe(1);
    expect(second.documents).toHaveLength(1);
    expect(second.documents[0]!.sourcePath.endsWith("b.json")).toBe(true);
    const bAfter = second.state.checkpoint[join(tmp, "b.json")] as { hash: string };
    expect(bAfter.hash).not.toBe(bBefore.hash);
  });
});
