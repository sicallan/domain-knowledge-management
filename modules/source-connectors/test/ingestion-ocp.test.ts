import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The Open-Closed gate for ingestion (Feature 06). Adding the `json` connector
 * must extend the framework without modifying its closed surfaces. Rather than a
 * brittle file-content snapshot, this guard asserts the *import direction*: the
 * new connector depends on the port, but the port / registry / filesystem
 * connector / contract suite / canonical-document never depend back on it. A
 * back-reference would mean the core was edited to know about `json` — exactly
 * what OCP forbids. (The decisive zero-core-edits check is also enforced by the
 * reviewed git diff.)
 */
const src = (name: string): string => fileURLToPath(new URL(`../src/${name}`, import.meta.url));

async function read(name: string): Promise<string> {
  return readFile(src(name), "utf8");
}

/** Files that are CLOSED for modification and must not back-reference the json connector. */
const CLOSED_CORE = [
  "port.ts",
  "registry.ts",
  "filesystem-connector.ts",
  "contract.ts",
  "canonical-document.ts",
];

describe("Ingestion OCP gate — json connector extends without modifying the core", () => {
  it("the json connector depends on the unchanged SourceConnector port", async () => {
    const source = await read("json-connector.ts");
    expect(source).toMatch(/from\s+["']\.\/port["']/);
  });

  it("the json connector emits structured content via the shared CanonicalDocument helpers", async () => {
    const source = await read("json-connector.ts");
    // Reuses Feature 01's helpers rather than re-implementing identity/hashing.
    expect(source).toMatch(/computeDocumentId/);
    expect(source).toMatch(/computeContentHash/);
    expect(source).toMatch(/contentType:\s*["']structured["']/);
  });

  for (const file of CLOSED_CORE) {
    it(`closed core file ${file} does not reference the json connector`, async () => {
      const source = await read(file);
      expect(source).not.toMatch(/json-connector/i);
      expect(source).not.toMatch(/JsonConnector/);
    });
  }

  it("the filesystem connector is untouched by this feature (no json awareness)", async () => {
    const source = await read("filesystem-connector.ts");
    expect(source).not.toMatch(/json/i);
  });
});
