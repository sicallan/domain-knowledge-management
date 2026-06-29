import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DomainMap } from "../src/domain-map/DomainMap";
import type { DomainMapView } from "../src/domain-map/useDomainMap";

/**
 * The presentational Domain Map — pure render of a `DomainMapView` (criteria 1, 2). It receives the
 * projection as a prop, so it is deterministic and needs no gateway. Relationships reference context
 * **ids**; the component must resolve them to context **names** for display.
 */
const view: DomainMapView = {
  subdomains: [
    {
      id: "sd-payments",
      name: "Payments",
      contexts: [
        {
          id: "bc-authorisation",
          name: "Authorisation",
          conceptCount: 3,
          serviceCount: 1,
          relationships: [{ targetContextId: "bc-settlement", type: "triggers" }],
        },
        { id: "bc-settlement", name: "Settlement", conceptCount: 2, serviceCount: 0, relationships: [] },
      ],
    },
    {
      id: "sd-risk",
      name: "Risk & Fraud",
      contexts: [{ id: "bc-fraud", name: "Fraud Scoring", conceptCount: 1, serviceCount: 2, relationships: [] }],
    },
  ],
  crossContextRelationships: [
    { source: "bc-authorisation", target: "bc-fraud", type: "checks", strength: 2 },
  ],
};

describe("DomainMap (presentational)", () => {
  it("renders subdomains, context cards with concept/service counts (criterion 1)", () => {
    render(<DomainMap view={view} />);

    expect(screen.getByRole("heading", { name: "Payments", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Risk & Fraud", level: 2 })).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Authorisation", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Settlement", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Fraud Scoring", level: 3 })).toBeInTheDocument();

    // Pluralised counts (3 concepts / 1 service).
    const authCard = screen.getByRole("listitem", { name: "Authorisation" });
    expect(authCard).toHaveTextContent(/3 concepts · 1 service/);
    // Intra-subdomain relationship resolves the target id to its name.
    expect(authCard).toHaveTextContent(/triggers/);
    expect(authCard).toHaveTextContent(/Settlement/);
  });

  it("renders cross-context relationships with resolved context names (criterion 2)", () => {
    render(<DomainMap view={view} />);

    const region = screen.getByRole("region", { name: /Cross-context relationships/ });
    // ids (bc-authorisation → bc-fraud) shown as names, with the type and strength.
    expect(within(region).getByRole("listitem")).toHaveTextContent(/Authorisation/);
    expect(within(region).getByRole("listitem")).toHaveTextContent(/Fraud Scoring/);
    expect(within(region).getByRole("listitem")).toHaveTextContent(/checks/);
    expect(within(region).getByRole("listitem")).toHaveTextContent(/2/);
  });
});
