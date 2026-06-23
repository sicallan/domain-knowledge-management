import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Studio test project (jsdom): render/a11y/routing over @testing-library + axe. graphql
 * is inlined + deduped so the MSW handler can execute the @dkm/api-gateway schema in
 * one realm (UI-D2). Runs under `pnpm test` (root workspace) and `pnpm --filter
 * @dkm/knowledge-studio test`.
 */
export default defineConfig({
  plugins: [react(), tsconfigPaths({ root: fileURLToPath(new URL("../..", import.meta.url)) })],
  resolve: { dedupe: ["graphql", "react", "react-dom"] },
  test: {
    name: "knowledge-studio",
    globals: false,
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    root: fileURLToPath(new URL(".", import.meta.url)),
    server: { deps: { inline: ["graphql", /@pothos\//] } },
  },
});
