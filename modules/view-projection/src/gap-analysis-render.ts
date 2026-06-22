import type { GapAnalysisView } from "./types";

/**
 * Gap Analysis renderer (feature 04 criterion 10 — the second half of the Phase 3 visible
 * story). A **pure** function over the already-projected, priority-ordered
 * {@link GapAnalysisView}: it emits a deterministic Markdown table of gaps (priority,
 * element, kind, missing layer(s), computed reason) plus a summary, with a clean empty
 * state. It does **not** re-query the graph, so it inherits the projector's adapter parity.
 */
export function renderGapAnalysisMarkdown(view: GapAnalysisView): string {
  const { summary } = view;
  const gapWord = (n: number): string => (n === 1 ? "gap" : "gaps");

  const lines = [
    "# Gap Analysis",
    "",
    `${summary.functionalGaps} functional ${gapWord(summary.functionalGaps)} · ${summary.technicalGaps} technical ${gapWord(summary.technicalGaps)} · ${summary.fullyRealised} fully realised (of ${summary.totalAssessed} assessed)`,
    "",
  ];

  if (view.gaps.length === 0) {
    lines.push("_No gaps — every assessed element is realised._");
  } else {
    lines.push("| Priority | Element | Kind | Missing | Reason |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const gap of view.gaps) {
      lines.push(`| ${gap.priority} | ${gap.name} | ${gap.kind} | ${gap.missingLayers.join(" + ")} | ${gap.reason} |`);
    }
  }

  return lines.join("\n");
}
