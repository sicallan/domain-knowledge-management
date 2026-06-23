/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** GraphQL gateway endpoint (Feature 02). Defaults to `/graphql`. */
  readonly VITE_GRAPHQL_ENDPOINT?: string;
  /** When `"true"`, boot the MSW worker for standalone dev (UI-D2 Tier 3). */
  readonly VITE_USE_MOCKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
