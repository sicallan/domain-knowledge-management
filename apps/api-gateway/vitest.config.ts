import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Gateway test project (Node env): SDL snapshot + resolvers over the in-memory adapter
 * (the CI gate — UI-D5). `@dkm/*` aliases resolve via the root tsconfig, which this app's
 * tsconfig extends; pointing `vite-tsconfig-paths` at the repo root picks them all up.
 */
export default defineConfig({
  plugins: [tsconfigPaths({ root: fileURLToPath(new URL("../..", import.meta.url)) })],
  // Pothos builds the schema with one `graphql` instance; `printSchema`/`graphql()` must
  // use the same one, or graphql throws "from another module or realm". Dedupe to one copy
  // and inline graphql + Pothos so Vitest transforms them as a single (ESM) module instance.
  resolve: { dedupe: ["graphql"] },
  test: {
    name: "api-gateway",
    globals: false,
    environment: "node",
    include: ["test/**/*.test.ts"],
    root: fileURLToPath(new URL(".", import.meta.url)),
    server: { deps: { inline: ["graphql", /@pothos\//] } },
  },
});
