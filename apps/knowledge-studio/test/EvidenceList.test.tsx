import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EvidenceList } from "../src/context-panel/EvidenceList";

describe("EvidenceList (criterion 4)", () => {
  it("renders each evidence item's source, date and authority", () => {
    render(
      <EvidenceList
        items={[
          { source: "authorisation.md", fetchedAt: "2026-06-15T00:00:00Z", sourceAuthority: "scheme" },
        ]}
      />,
    );
    expect(screen.getByText("authorisation.md")).toBeInTheDocument();
    expect(screen.getByText(/2026-06-15/)).toBeInTheDocument();
    expect(screen.getByText(/scheme/)).toBeInTheDocument();
  });

  it("shows an empty state when there is no evidence", () => {
    render(<EvidenceList items={[]} />);
    expect(screen.getByText("No evidence recorded.")).toBeInTheDocument();
  });
});
