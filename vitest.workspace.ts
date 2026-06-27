/**
 * Vitest workspace (monorepo): one project per test environment.
 *
 *  - the root `vitest.config.ts` — the Node project: `modules/*` unit + contract tests.
 *  - `apps/api-gateway`        — the Node project for the GraphQL gateway (SDL snapshot +
 *                                 resolvers over the in-memory adapter; the CI gate, UI-D5).
 *  - `apps/processor`          — the Node project for the `dkm process` orchestrator (Tier B:
 *                                 connectors → canonical docs → extraction hand-off).
 *  - `apps/knowledge-studio`   — the jsdom project for the React shell (render/a11y/routing).
 *
 * `pnpm test` (root `vitest run`) runs all of them; `pnpm --filter @dkm/<app> test` runs one,
 * because each app config scopes to its own `test/**`. @dkm/* aliases resolve through
 * `vite-tsconfig-paths` against each project's tsconfig (which extends the root paths).
 */
export default [
  "./vitest.config.ts",
  "./apps/api-gateway/vitest.config.ts",
  "./apps/processor/vitest.config.ts",
  "./apps/knowledge-studio/vitest.config.ts",
];
