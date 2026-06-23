import { type ReactNode, useMemo } from "react";
import { BrowserRouter } from "react-router-dom";
import { Provider as UrqlProvider, type Client } from "urql";
import { createGraphQLClient } from "./lib/graphql-client";
import { AppRoutes } from "./router";

export interface AppProviderProps {
  /** Inject a urql client (tests pass an MSW- or mock-backed one); defaults to the env client. */
  client?: Client;
  children: ReactNode;
}

/**
 * The provider stack (UI-D7): urql GraphQL client + router context. Split from {@link App}
 * so tests can supply their own client + a `MemoryRouter` while exercising the **same**
 * component tree (UI-D2 — the shell is data-mode agnostic).
 */
export function AppProviders({ client, children }: AppProviderProps) {
  const graphqlClient = useMemo(() => client ?? createGraphQLClient(), [client]);
  return <UrqlProvider value={graphqlClient}>{children}</UrqlProvider>;
}

/** The Knowledge Studio root — providers + the browser router around the routed shell. */
export function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProviders>
  );
}
