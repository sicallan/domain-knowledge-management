import type { DomainMapView } from "./useDomainMap";

export interface DomainMapProps {
  view: DomainMapView;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * The presentational Domain Map: subdomains → bounded-context cards (concept/service counts and the
 * context's outgoing relationships) → a cross-context relationships section. Pure — it renders the
 * `DomainMapView` it is given and holds no data of its own.
 *
 * Relationships in the projection reference context **ids**; this component resolves them to context
 * **names** via a lookup built from every context in the view (cross-subdomain targets included).
 */
export function DomainMap({ view }: DomainMapProps) {
  const contextName = new Map<string, string>();
  for (const subdomain of view.subdomains) {
    for (const context of subdomain.contexts) contextName.set(context.id, context.name);
  }
  const nameOf = (id: string): string => contextName.get(id) ?? id;

  return (
    <div className="flex flex-col gap-6">
      {view.subdomains.map((subdomain) => {
        const headingId = `domain-map-sd-${subdomain.id}`;
        return (
          <section key={subdomain.id} aria-labelledby={headingId} className="flex flex-col gap-3">
            <h2 id={headingId} className="text-lg font-semibold">
              {subdomain.name}
            </h2>
            {subdomain.contexts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bounded contexts.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {subdomain.contexts.map((context) => {
                  const cardHeadingId = `domain-map-ctx-${context.id}`;
                  return (
                    <li
                      key={context.id}
                      aria-labelledby={cardHeadingId}
                      className="flex flex-col gap-2 rounded-lg border border-border p-3"
                    >
                      <h3 id={cardHeadingId} className="font-medium">
                        {context.name}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {plural(context.conceptCount, "concept")} · {plural(context.serviceCount, "service")}
                      </p>
                      {context.relationships.length > 0 && (
                        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                          {context.relationships.map((rel, index) => (
                            <li key={`${rel.targetContextId}-${rel.type}-${index}`}>
                              <span className="font-mono text-xs">{rel.type}</span> → {nameOf(rel.targetContextId)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      {view.crossContextRelationships.length > 0 && (
        <section aria-labelledby="domain-map-ccr" className="flex flex-col gap-2">
          <h2 id="domain-map-ccr" className="text-lg font-semibold">
            Cross-context relationships
          </h2>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {view.crossContextRelationships.map((rel, index) => (
              <li key={`${rel.source}-${rel.target}-${rel.type}-${index}`}>
                {nameOf(rel.source)} <span className="font-mono text-xs">{rel.type}</span> → {nameOf(rel.target)}
                {rel.strength > 1 ? ` (×${rel.strength})` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
