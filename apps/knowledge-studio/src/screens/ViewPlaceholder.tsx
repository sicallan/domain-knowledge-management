export interface ViewPlaceholderProps {
  title: string;
  /** The plan step that fills this screen, e.g. "UI-3.4". */
  step: string;
}

/**
 * A routed placeholder for a main-plan view screen (UI-3.1). Registered in the router so
 * the nav + routing resolve today; the real view (served over the GraphQL gateway) lands
 * in its own step.
 */
export function ViewPlaceholder({ title, step }: ViewPlaceholderProps) {
  return (
    <section aria-labelledby="view-heading" className="p-4">
      <h1 id="view-heading" className="text-xl font-semibold">
        {title}
      </h1>
      <p className="mt-2 text-muted-foreground">This view is delivered in {step}.</p>
    </section>
  );
}
