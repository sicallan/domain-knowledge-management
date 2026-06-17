import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The loader OCP guard (acceptance 2). The vector loader is the *open* extension — it
 * imports the closed `LoaderPort`, but nothing closed imports *it*. This durable
 * import-direction assertion enforces "no back-reference": the port, orchestrator,
 * graph loader, and contract suite stay ignorant of the vector loader. The decisive
 * zero-core-edits check is the reviewed git diff; this is its automated tripwire.
 */
function src(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../src/${name}`, import.meta.url)), "utf-8");
}

const CLOSED_SURFACES = ["port.ts", "orchestrator.ts", "graph-loader.ts", "contract.ts"];

describe("loader OCP — import direction (the vector loader extends; it is never depended on)", () => {
  it("the vector loader imports the LoaderPort (extension points to the closed contract)", () => {
    expect(src("vector-loader.ts")).toMatch(/from "\.\/port"/);
  });

  it.each(CLOSED_SURFACES)("%s does not import or reference the vector loader (no back-reference)", (file) => {
    const text = src(file);
    expect(text).not.toMatch(/["']\.\/vector-loader["']/);
    expect(text).not.toMatch(/\bVectorLoader\b/);
  });
});
