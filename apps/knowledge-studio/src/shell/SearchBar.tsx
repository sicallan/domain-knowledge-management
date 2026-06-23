import { type FormEvent, useState } from "react";

export interface SearchBarProps {
  /** Dispatch a structured search action with the trimmed query (UI-3.5 fulfils the data). */
  onSearch: (query: string) => void;
  placeholder?: string;
}

/**
 * The always-present global search affordance (UI-3.1). It owns no data — on submit it
 * dispatches the structured-search action via {@link SearchBarProps.onSearch} (the closed
 * contract UI-3.5 fulfils). Keyboard-operable: it is a labelled `search` form.
 */
export function SearchBar({ onSearch, placeholder = "Search inventory…" }: SearchBarProps) {
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    const query = value.trim();
    if (query.length === 0) return;
    onSearch(query);
  }

  return (
    <form role="search" onSubmit={handleSubmit} className="flex items-center gap-2">
      <label htmlFor="global-search" className="sr-only">
        Search the knowledge graph
      </label>
      <input
        id="global-search"
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        className="w-64 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
      />
      <button
        type="submit"
        className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
      >
        Search
      </button>
    </form>
  );
}
