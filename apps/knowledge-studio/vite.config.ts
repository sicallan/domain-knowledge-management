import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// The Knowledge Studio dev/build config. `@dkm/*` aliases resolve via the root tsconfig
// (which this app's tsconfig extends). graphql is deduped so the in-process MSW schema
// execution shares a single graphql instance with @dkm/api-gateway.
export default defineConfig({
  plugins: [react(), tsconfigPaths({ root: fileURLToPath(new URL("../..", import.meta.url)) })],
  resolve: { dedupe: ["graphql", "react", "react-dom"] },
  server: { port: 5173 },
});
