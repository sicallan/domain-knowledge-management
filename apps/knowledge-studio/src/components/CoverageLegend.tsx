/** The coverage statuses, in RAG order — the shared vocabulary with the data-track matrices. */
const RAG = [
  { label: "Covered", className: "bg-coverage-covered" },
  { label: "Partial", className: "bg-coverage-partial" },
  { label: "Uncovered", className: "bg-coverage-uncovered" },
] as const;

/**
 * A sample component that **uses the RAG coverage palette** design tokens (UI-3.1 criterion
 * 5) — the same Red/Amber/Green language the data-track coverage/gap Markdown matrices use.
 * The canvas (UI-3.4) and list (UI-3.5) reuse these token classes.
 */
export function CoverageLegend() {
  return (
    <ul aria-label="Coverage legend" className="flex gap-4 text-sm">
      {RAG.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className={`inline-block h-3 w-3 rounded-full ${item.className}`} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
