import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: false,
    environment: "node",
    include: ["modules/*/test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["modules/*/src/**/*.ts"],
      exclude: ["**/index.ts", "**/*.d.ts"],
    },
  },
});
