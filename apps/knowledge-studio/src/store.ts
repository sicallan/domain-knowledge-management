import { create } from "zustand";
import type { BreadcrumbItem } from "./shell/types";

/** A minimal summary of the selected entry (the canvas/list have this from the node data). */
export interface SelectedEntry {
  id: string;
  type?: string;
  label?: string;
}

/** The deep-link URL for inspecting an entry — the breadcrumb + shareable-selection convention. */
export function explorerHref(id: string): string {
  return `/explorer?entry=${encodeURIComponent(id)}`;
}

function crumbOf(entry: SelectedEntry): BreadcrumbItem {
  return { id: entry.id, label: entry.label ?? entry.id, href: explorerHref(entry.id) };
}

/**
 * The shell's client-state store (UI-D7 pin: Zustand). It holds **presentation** state
 * only — the open/closed context panel, the current selection, the breadcrumb trail, and
 * the last dispatched search — never domain data (that arrives over GraphQL, UI-D3). The
 * actions here are the **search-dispatch** and **context-panel** contracts UI-3.5/UI-3.6
 * fulfil; their shapes are the closed surface (OCP) later screens bind to.
 */
export interface ShellState {
  /** Whether the slide-out context panel is open. */
  panelOpen: boolean;
  /** The entry the context panel is inspecting (full detail rendered by UI-3.6). */
  selectedEntry: SelectedEntry | null;
  /** The traversal breadcrumb trail. */
  trail: BreadcrumbItem[];
  /** The last structured-search query dispatched from the search bar (UI-3.5 fulfils). */
  lastSearch: string | null;

  /** Select an entry from anywhere (canvas, list, search) → opens the panel, starts a fresh trail. */
  selectEntry: (entry: SelectedEntry) => void;
  /** Navigate to a related entry from the panel → appends a breadcrumb hop (criterion 3). */
  navigateTo: (entry: SelectedEntry) => void;
  /** Dismiss the context panel (Esc / click-away / close button). */
  closePanel: () => void;
  /** Dispatch a structured search action with the query (the UI-3.1 search contract). */
  dispatchSearch: (query: string) => void;
  /** Replace the breadcrumb trail (e.g. on route change). */
  setTrail: (trail: BreadcrumbItem[]) => void;
}

export const useShellStore = create<ShellState>((set) => ({
  panelOpen: false,
  selectedEntry: null,
  trail: [],
  lastSearch: null,

  selectEntry: (entry) => set({ selectedEntry: entry, panelOpen: true, trail: [crumbOf(entry)] }),
  navigateTo: (entry) =>
    set((state) => ({
      selectedEntry: entry,
      panelOpen: true,
      trail:
        state.trail.at(-1)?.id === entry.id ? state.trail : [...state.trail, crumbOf(entry)],
    })),
  closePanel: () => set({ panelOpen: false }),
  dispatchSearch: (query) => set({ lastSearch: query }),
  setTrail: (trail) => set({ trail }),
}));
