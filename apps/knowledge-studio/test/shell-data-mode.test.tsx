import { render, screen, waitFor } from "@testing-library/react";
import { Client, Provider as UrqlProvider, cacheExchange, fetchExchange, gql, useQuery } from "urql";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createGraphQLClient } from "../src/lib/graphql-client";
import { mockServer } from "../src/mocks/server";

/**
 * The same data-bound component renders over the **MSW fixtures** (UI-D2 Tier 3 — the
 * gateway schema over the shared seed) and over a **(mock) live client**, with no component
 * change (criterion 7). This is the proof that the shell is data-mode agnostic.
 */

const DOMAIN_MAP = gql`
  query {
    domainMap {
      subdomains {
        id
        name
      }
    }
  }
`;

interface DomainMapData {
  domainMap: { subdomains: { id: string; name: string }[] };
}

function SubdomainProbe() {
  const [{ data, fetching, error }] = useQuery<DomainMapData>({ query: DOMAIN_MAP });
  if (fetching) return <p>Loading…</p>;
  if (error) return <p role="alert">{error.message}</p>;
  return (
    <ul aria-label="subdomains">
      {data?.domainMap.subdomains.map((subdomain) => <li key={subdomain.id}>{subdomain.name}</li>)}
    </ul>
  );
}

describe("data-mode parity (criterion 7)", () => {
  beforeAll(() => mockServer.listen({ onUnhandledRequest: "bypass" }));
  afterEach(() => mockServer.resetHandlers());
  afterAll(() => mockServer.close());

  it("renders seed data when MSW intercepts the gateway endpoint", async () => {
    const client = createGraphQLClient("http://localhost/graphql");
    render(
      <UrqlProvider value={client}>
        <SubdomainProbe />
      </UrqlProvider>,
    );
    // 'Payments' comes from demo/payments-extractions.jsonl through the real gateway schema.
    await waitFor(() => expect(screen.getByText("Payments")).toBeInTheDocument());
  });

  it("renders the same component unchanged against a (mock) live client", async () => {
    const fixture = { data: { domainMap: { subdomains: [{ id: "sd-payments", name: "Payments" }] } } };
    const client = new Client({
      url: "http://localhost/graphql",
      exchanges: [cacheExchange, fetchExchange],
      fetch: async () =>
        new Response(JSON.stringify(fixture), { headers: { "content-type": "application/json" } }),
    });
    render(
      <UrqlProvider value={client}>
        <SubdomainProbe />
      </UrqlProvider>,
    );
    await waitFor(() => expect(screen.getByText("Payments")).toBeInTheDocument());
  });
});
