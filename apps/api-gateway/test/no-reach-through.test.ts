import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Adapter-over-port guard (UI-D3 / criterion 7). The resolver layer (`src/schema/**`
 * + `src/context.ts`) must reach the data **only** through the injected `QueryService`
 * / `ViewEngine`. It must never import a graph adapter, the Neo4j driver, the loader,
 * or read `demo/*.jsonl` — that fakeness lives behind the port in `seed.ts` alone.
 */

const schemaDir = fileURLToPath(new URL("../src/schema", import.meta.url));
const contextFile = fileURLToPath(new URL("../src/context.ts", import.meta.url));

const RESOLVER_FILES = [
  contextFile,
  ...readdirSync(schemaDir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => `${schemaDir}/${f}`),
];

/** Strip comments so the guard scans code, not prose (a doc comment may *mention* the port internals). */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /@dkm\/knowledge-graph/, why: "a graph adapter (reach-through past the port)" },
  { pattern: /@dkm\/loaders/, why: "the loader (resolvers must not load data)" },
  { pattern: /InMemoryGraphAdapter|Neo4jGraphAdapter/, why: "a concrete graph adapter" },
  { pattern: /\bneo4j\b/i, why: "the Neo4j driver" },
  { pattern: /readJsonl|concatJsonl/, why: "a JSONL reader" },
  { pattern: /demo\//, why: "a direct demo/*.jsonl read" },
];

describe("resolvers are an adapter over the port (no store reach-through)", () => {
  it.each(RESOLVER_FILES)("%s imports only QueryService/ViewEngine, no store internals", (file) => {
    const source = stripComments(readFileSync(file, "utf8"));
    for (const { pattern, why } of FORBIDDEN) {
      expect(pattern.test(source), `${file} must not reference ${why}`).toBe(false);
    }
  });
});
