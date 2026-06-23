import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useShellStore } from "../store";

/**
 * Two-way sync between the selected entry and the URL's `?entry=` param (criterion 7), so a
 * selection is **shareable/deep-linkable** and the breadcrumb (whose hrefs are `?entry=` links)
 * works. Renders nothing.
 *
 * Each effect depends on **exactly one** derived scalar — `urlEntry` (URL→store) and
 * `currentSelection` (store→URL) — and bails when they already agree. That makes the sync
 * provably loop-free: writing one side updates the other to the *same* value, so the other
 * side's effect short-circuits instead of writing back.
 */
export function SelectionDeepLink() {
  const [params, setParams] = useSearchParams();
  const urlEntry = params.get("entry");
  const selectedEntry = useShellStore((state) => state.selectedEntry);
  const panelOpen = useShellStore((state) => state.panelOpen);
  const selectEntry = useShellStore((state) => state.selectEntry);
  const closePanel = useShellStore((state) => state.closePanel);

  const currentSelection = panelOpen ? (selectedEntry?.id ?? null) : null;

  // URL → store: adopt the URL's entry when it differs (deep-link load, back/forward, breadcrumb).
  useEffect(() => {
    if (urlEntry === currentSelection) return;
    if (urlEntry) selectEntry({ id: urlEntry });
    else closePanel();
    // Intentionally keyed only on the URL value; `currentSelection` is read for the guard.
  }, [urlEntry]);

  // store → URL: write the selection when it differs (functional update avoids a `params` dep).
  // Skipped on the first render so a deep-linked `?entry=` is adopted by URL→store before this
  // effect would otherwise clear it (the store is empty on mount).
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    if (currentSelection === urlEntry) return;
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (currentSelection) next.set("entry", currentSelection);
        else next.delete("entry");
        return next;
      },
      { replace: true },
    );
    // Intentionally keyed only on the selection value.
  }, [currentSelection]);

  return null;
}
