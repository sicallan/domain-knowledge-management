import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  computeDocumentId,
  createConnectorRegistry,
  FilesystemConnector,
} from "../src/index";
import type { SourceConfig } from "../src/port";

const FIXTURES = fileURLToPath(new URL("./fixtures/payments-docs", import.meta.url));

function config(rootPath: string, overrides: Partial<SourceConfig> = {}): SourceConfig {
  return {
    id: "payments-docs",
    type: "filesystem",
    connectionDetails: { rootPath },
    filters: [{ type: "include", pattern: "*.md", field: "name" }],
    sourceAuthority: "project",
    ...overrides,
  };
}

async function freshConnector(cfg: SourceConfig): Promise<FilesystemConnector> {
  const connector = new FilesystemConnector();
  await connector.initialize(cfg);
  return connector;
}

describe("FilesystemConnector — integration against payments-docs", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "fs-connector-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("discovers only the included Markdown files without fetching content (AC1)", async () => {
    await writeFile(join(tmp, "a.md"), "# A\nalpha");
    await writeFile(join(tmp, "b.md"), "# B\nbeta");
    await writeFile(join(tmp, "c.md"), "# C\ngamma");
    await writeFile(join(tmp, "notes.txt"), "plain");

    const connector = await freshConnector(config(tmp));
    const refs = await connector.discover();
    expect(refs).toHaveLength(3);
    expect(refs.every((r) => r.sourcePath.endsWith(".md"))).toBe(true);
    expect(refs.every((r) => !("content" in r))).toBe(true);
  });

  it("produces canonical Markdown documents with a deterministic id and sections (AC2)", async () => {
    const connector = await freshConnector(config(FIXTURES, { filters: [] }));
    const result = await connector.ingest();

    const auth = result.documents.find((d) => d.sourcePath.endsWith("authorisation.md"));
    expect(auth).toBeTruthy();
    expect(auth!.contentType).toBe("markdown");
    expect(auth!.id).toBe(computeDocumentId("filesystem", auth!.sourcePath, auth!.sourceVersion));
    expect(auth!.title).toBe("Authorisation");

    const sections = auth!.sections ?? [];
    expect(sections.map((s) => [s.level, s.title])).toEqual([
      [1, "Authorisation"],
      [2, "Authorisation Decision"],
      [2, "Risk Checks"],
    ]);
    for (const s of sections) {
      expect(auth!.content.slice(s.startOffset, s.endOffset)).toBe(s.content);
    }
  });

  it("infers plaintext content type for non-Markdown files", async () => {
    const connector = await freshConnector(config(FIXTURES, { filters: [] }));
    const result = await connector.ingest();
    const notes = result.documents.find((d) => d.sourcePath.endsWith("notes.txt"));
    expect(notes?.contentType).toBe("plaintext");
    expect(notes?.sections).toBeUndefined();
  });

  it("carries provenance: authority, absolute path, content-hash version, ISO timestamp (AC3)", async () => {
    const connector = await freshConnector(config(FIXTURES));
    const result = await connector.ingest();
    const doc = result.documents[0]!;
    expect(doc.sourceAuthority).toBe("project");
    expect(isAbsolute(doc.sourcePath)).toBe(true);
    expect(doc.sourceVersion).toMatch(/^[0-9a-f]{64}$/);
    expect(Number.isNaN(Date.parse(doc.fetchedAt))).toBe(false);
  });

  it("skips every unchanged file on an incremental re-run (AC4)", async () => {
    const connector = await freshConnector(config(FIXTURES));
    const first = await connector.ingest();
    expect(first.stats.fetched).toBeGreaterThan(0);

    const second = await connector.ingest(first.state);
    expect(second.stats.skipped).toBe(second.stats.total);
    expect(second.stats.fetched).toBe(0);
    expect(second.documents).toHaveLength(0);
  });

  it("re-emits only the changed file and advances its checkpoint (AC5)", async () => {
    await writeFile(join(tmp, "a.md"), "# A\nalpha");
    await writeFile(join(tmp, "b.md"), "# B\nbeta");

    const connector = await freshConnector(config(tmp));
    const first = await connector.ingest();
    expect(first.stats.fetched).toBe(2);
    const bPathBefore = first.state.checkpoint[join(tmp, "b.md")] as { hash: string };

    await writeFile(join(tmp, "b.md"), "# B\nbeta — revised with new content");
    const second = await connector.ingest(first.state);

    expect(second.stats.fetched).toBe(1);
    expect(second.stats.skipped).toBe(1);
    expect(second.documents).toHaveLength(1);
    expect(second.documents[0]!.sourcePath).toBe(join(tmp, "b.md"));
    const bPathAfter = second.state.checkpoint[join(tmp, "b.md")] as { hash: string };
    expect(bPathAfter.hash).not.toBe(bPathBefore.hash);
  });

  it("continues past an unreadable file and reports it as a retriable error (AC6)", async () => {
    for (let i = 1; i <= 4; i += 1) {
      await writeFile(join(tmp, `good${i}.md`), `# Doc ${i}\nbody`);
    }
    // A broken symlink: discovery lists it, but reading follows the link and fails.
    await symlink(join(tmp, "does-not-exist.md"), join(tmp, "corrupt.md"));

    const connector = await freshConnector(config(tmp));
    const result = await connector.ingest();

    expect(result.stats.total).toBe(5);
    expect(result.stats.fetched).toBe(4);
    expect(result.stats.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.documentPath.endsWith("corrupt.md")).toBe(true);
    expect(result.errors[0]!.retriable).toBe(true);
  });

  it("excludes documents matching an exclude filter (AC7)", async () => {
    const connector = await freshConnector(
      config(FIXTURES, {
        filters: [
          { type: "include", pattern: "*.md", field: "name" },
          { type: "exclude", pattern: "**/drafts/**", field: "path" },
        ],
      }),
    );
    const result = await connector.ingest();
    expect(result.documents.some((d) => d.sourcePath.includes("/drafts/"))).toBe(false);
    expect(result.documents.length).toBeGreaterThan(0);
  });

  it("registers the filesystem connector in the default registry (AC8)", () => {
    const registry = createConnectorRegistry();
    expect(registry.hasConnector("filesystem")).toBe(true);
    expect(registry.getConnector("filesystem").type).toBe("filesystem");
    expect(registry.hasConnector("unknown")).toBe(false);
  });
});
