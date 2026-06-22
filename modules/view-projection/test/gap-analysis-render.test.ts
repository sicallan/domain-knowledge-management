import { describe, expect, it } from "vitest";
import { renderGapAnalysisMarkdown } from "../src/index";
import type { GapAnalysisView } from "../src/index";

const VIEW: GapAnalysisView = {
  gaps: [
    {
      id: "cap-settle",
      name: "Settlement",
      kind: "BusinessCapability",
      domain: "payments",
      missingLayers: ["L3"],
      priority: 2,
      reason: "Functionally realised at L2 but not technically realised (no implementing service).",
    },
    {
      id: "cap-report",
      name: "Reporting",
      kind: "BusinessCapability",
      domain: "payments",
      missingLayers: ["L2", "L3"],
      priority: 0,
      reason:
        "No functional realisation (no fulfils/specifies edge or vendor mapping) and no technical realisation (no implementing service).",
    },
  ],
  summary: { totalAssessed: 7, functionalGaps: 1, technicalGaps: 2, fullyRealised: 2 },
};

describe("renderGapAnalysisMarkdown (criterion 10)", () => {
  it("renders a deterministic priority-ordered gap table with a summary", () => {
    expect(renderGapAnalysisMarkdown(VIEW)).toBe(
      [
        "# Gap Analysis",
        "",
        "1 functional gap · 2 technical gaps · 2 fully realised (of 7 assessed)",
        "",
        "| Priority | Element | Kind | Missing | Reason |",
        "| --- | --- | --- | --- | --- |",
        "| 2 | Settlement | BusinessCapability | L3 | Functionally realised at L2 but not technically realised (no implementing service). |",
        "| 0 | Reporting | BusinessCapability | L2 + L3 | No functional realisation (no fulfils/specifies edge or vendor mapping) and no technical realisation (no implementing service). |",
      ].join("\n"),
    );
  });

  it("renders a clean empty state when there are no gaps", () => {
    const md = renderGapAnalysisMarkdown({
      gaps: [],
      summary: { totalAssessed: 3, functionalGaps: 0, technicalGaps: 0, fullyRealised: 3 },
    });
    expect(md).toContain("0 functional gaps · 0 technical gaps · 3 fully realised (of 3 assessed)");
    expect(md).toContain("_No gaps — every assessed element is realised._");
  });
});
