import { Link } from "react-router-dom";

/** The 404 / empty state (UI-3.1 criterion 2). */
export function NotFound() {
  return (
    <section aria-labelledby="notfound-heading" className="p-4">
      <h1 id="notfound-heading" className="text-xl font-semibold">
        Page not found
      </h1>
      <p className="mt-2 text-muted-foreground">
        That route does not exist. <Link to="/explorer" className="text-primary underline">Back to the Explorer</Link>.
      </p>
    </section>
  );
}
