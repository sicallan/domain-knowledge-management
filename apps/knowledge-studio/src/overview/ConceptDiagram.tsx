import { colourOfLayer } from "../explorer/encoding";
import { cn } from "../lib/cn";
import { conceptsByLayer } from "./model";

/**
 * The four-layer conceptual model as a themed, accessible layered diagram (enhancement). It's
 * built from real DOM (sections + chips), not an image, so it inherits dark-mode, scales, and is
 * screen-reader navigable. Layer colours reuse the graph's `colourOfLayer`, so the picture and the
 * canvas share one encoding; planned (not-yet-extracted) concepts are shown dashed/muted.
 */
export function ConceptDiagram() {
  return (
    <figure aria-label="The four-layer conceptual model" className="m-0 flex flex-col gap-2">
      {conceptsByLayer().map(({ layer, concepts }) => {
        const colour = colourOfLayer(layer.id);
        return (
          <section
            key={layer.id}
            aria-label={`${layer.id} ${layer.title}`}
            className="rounded-md border border-border bg-muted/30 p-3"
            style={{ borderLeftWidth: 4, borderLeftColor: colour }}
          >
            <header className="mb-2 flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-semibold" style={{ color: colour }}>
                {layer.id}
              </span>
              <span className="text-sm font-semibold">{layer.title}</span>
              <span className="text-xs text-muted-foreground">— {layer.subtitle}</span>
            </header>
            <ul className="flex flex-wrap gap-1.5">
              {concepts.map((concept) => (
                <li key={concept.type}>
                  <span
                    title={concept.description}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-xs",
                      concept.status === "planned" && "border-dashed opacity-60",
                    )}
                    style={{ borderColor: colour, color: colour }}
                  >
                    {concept.type}
                    {concept.status === "planned" && (
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        planned
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <figcaption className="text-xs text-muted-foreground">
        Realisation flows upward: L3 technical realises L2 functional, which realises L1 pure
        domain; L0 sets the strategic “why”. Everything maps to L1.
      </figcaption>
    </figure>
  );
}
