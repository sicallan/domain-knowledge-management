import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { markdownFileName, serialiseCanonicalDocs } from "../src/canonical";
import { runConnectors } from "../src/connectors";
import { type ExtractRequest, parseArgs, runProcess } from "../src/process";

const DOCS_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "docs");

describe("runConnectors", () => {
  it("ingests Markdown and JSON from one folder through the connector registry", async () => {
    const { documents } = await runConnectors(DOCS_DIR, "operational");

    const byType = documents.map((d) => d.contentType);
    expect(byType).toContain("markdown"); // authorisation.md
    expect(byType).toContain("structured"); // reference-data.json
    // The JSON source carries its parsed structure.
    const json = documents.find((d) => d.contentType === "structured");
    expect(json?.structuredContent).toMatchObject({ boundedContext: "Authorisation" });
    // Provenance authority is stamped from the run.
    expect(documents.every((d) => d.sourceAuthority === "operational")).toBe(true);
  });
});

describe("serialiseCanonicalDocs", () => {
  it("emits one JSON document per line, round-trippable", async () => {
    const { documents } = await runConnectors(DOCS_DIR, "operational");
    const jsonl = serialiseCanonicalDocs(documents);
    const lines = jsonl.trimEnd().split("\n");
    expect(lines).toHaveLength(documents.length);
    expect(JSON.parse(lines[0] ?? "")).toHaveProperty("id");
  });

  it("is empty for no documents", () => {
    expect(serialiseCanonicalDocs([])).toBe("");
  });
});

describe("markdownFileName", () => {
  it("derives a readable .md name from the source path", () => {
    const used = new Set<string>();
    expect(markdownFileName({ sourcePath: "/input/Report_2024.pdf", id: "abc123" }, used)).toBe(
      "Report_2024.md",
    );
  });

  it("disambiguates same-basename sources so neither is overwritten", () => {
    const used = new Set<string>();
    const a = markdownFileName({ sourcePath: "/input/a/notes.pdf", id: "id-aaaaaaaa" }, used);
    const b = markdownFileName({ sourcePath: "/input/b/notes.pdf", id: "id-bbbbbbbb" }, used);
    expect(a).toBe("notes.md");
    expect(b).not.toBe(a);
    expect(b.endsWith(".md")).toBe(true);
  });
});

describe("parseArgs", () => {
  it("parses the docs dir, domain and flags", () => {
    const args = parseArgs(["./docs", "--domain", "lending", "--fake", "--authority", "project"]);
    expect(args).toMatchObject({ docsDir: "./docs", domain: "lending", fake: true, authority: "project" });
  });

  it("requires a docs dir and a domain", () => {
    expect(() => parseArgs(["--domain", "x"])).toThrow(/docs-dir/);
    expect(() => parseArgs(["./docs"])).toThrow(/--domain/);
  });

  it("rejects an unknown authority", () => {
    expect(() => parseArgs(["./docs", "--domain", "x", "--authority", "bogus"])).toThrow(/authority/);
  });
});

describe("runProcess", () => {
  it("writes canonical-docs JSONL and hands it to the extractor with the right paths", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "dkm-proc-"));
    const seen: ExtractRequest[] = [];

    const result = await runProcess(
      { docsDir: DOCS_DIR, domain: "payments", authority: "scheme", fake: true, dataDir, python: "python3" },
      { extract: (request) => seen.push(request) },
    );

    // The canonical-docs bridge file is written under the domain's canonical/ subdir…
    expect(result.canonicalPath).toBe(join(dataDir, "payments", "canonical", "canonical-docs.jsonl"));
    expect(result.documentCount).toBeGreaterThan(0);
    const written = readFileSync(result.canonicalPath, "utf8").trimEnd().split("\n");
    expect(written).toHaveLength(result.documentCount);

    // …and the extractor is invoked once, pointed at the domain output dir, honouring --fake.
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      canonicalPath: result.canonicalPath,
      outDir: join(dataDir, "payments"),
      fake: true,
    });
  });

  it("writes a readable .md per document alongside the canonical JSONL", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "dkm-md-"));

    await runProcess(
      { docsDir: DOCS_DIR, domain: "payments", authority: "scheme", fake: true, dataDir, python: "python3" },
      { extract: vi.fn() },
    );

    const mdDir = join(dataDir, "payments", "canonical", "markdown");
    expect(existsSync(mdDir)).toBe(true);
    const mdFiles = readdirSync(mdDir).filter((f) => f.endsWith(".md"));
    expect(mdFiles.length).toBeGreaterThan(0);
    // The .md carries the document's actual extracted text (the connector's Markdown body).
    const sample = readFileSync(join(mdDir, mdFiles[0] ?? ""), "utf8");
    expect(sample.length).toBeGreaterThan(0);
  });

  it("errors when the folder has no supported documents", async () => {
    const empty = mkdtempSync(join(tmpdir(), "dkm-empty-"));
    await expect(
      runProcess(
        { docsDir: empty, domain: "x", authority: "operational", fake: true, dataDir: empty, python: "python3" },
        { extract: vi.fn() },
      ),
    ).rejects.toThrow(/no supported documents/);
  });
});
