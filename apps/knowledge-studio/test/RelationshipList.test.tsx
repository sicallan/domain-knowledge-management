import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RelationshipList } from "../src/context-panel/RelationshipList";
import type { RelationshipGroup } from "../src/context-panel/useEntry";

const groups: RelationshipGroup[] = [
  {
    relationshipType: "operatesOn",
    rows: [
      {
        edgeId: "e1",
        direction: "outgoing",
        relationshipType: "operatesOn",
        target: { id: "e-authorisation", type: "Event", label: "Payment Authorised" },
      },
    ],
  },
  {
    relationshipType: "invokes",
    rows: [
      {
        edgeId: "e2",
        direction: "incoming",
        relationshipType: "invokes",
        target: { id: "step-authorise", type: "OrchestrationStep", label: "Authorise step" },
      },
    ],
  },
];

describe("RelationshipList (criteria 2, 3)", () => {
  it("groups relationships by type and lists navigable targets", () => {
    render(<RelationshipList groups={groups} onNavigate={() => {}} />);
    expect(screen.getByText("operatesOn")).toBeInTheDocument();
    expect(screen.getByText("invokes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Payment Authorised/ })).toBeInTheDocument();
  });

  it("emits onNavigate with the target when a relationship is activated", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<RelationshipList groups={groups} onNavigate={onNavigate} />);

    await user.click(screen.getByRole("button", { name: /Payment Authorised/ }));

    expect(onNavigate).toHaveBeenCalledWith({
      id: "e-authorisation",
      type: "Event",
      label: "Payment Authorised",
    });
  });

  it("shows an empty state when there are no relationships", () => {
    render(<RelationshipList groups={[]} onNavigate={() => {}} />);
    expect(screen.getByText("No relationships.")).toBeInTheDocument();
  });
});
