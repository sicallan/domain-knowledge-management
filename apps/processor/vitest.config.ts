import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Processor test project (Node env): the `dkm process` orchestrator — connectors → canonical
 * docs JSONL → extraction hand-off. `@dkm/*` aliases resolve via the root tsconfig, which this
 * app's tsconfig extends; pointing `vite-tsconfig-paths` at the repo root picks them all up.
 */
export default defineConfig({
  plugins: [tsconfigPaths({ root: fileURLToPath(new URL("../..", import.meta.url)) })],
  test: {
    name: "processor",
    globals: false,
    environment: "node",
    include: ["test/**/*.test.ts"],
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
});
