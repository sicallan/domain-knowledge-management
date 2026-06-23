import { create } from "zustand";
import type { BreadcrumbItem } from "./shell/types";

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
  /** The entry the context panel is inspecting (content rendered by UI-3.6). */
  selectedEntryId: string | null;
  /** The traversal breadcrumb trail. */
  trail: BreadcrumbItem[];
  /** The last structured-search query dispatched from the search bar (UI-3.5 fulfils). */
  lastSearch: string | null;

  /** Select an entry from anywhere (canvas, list, search) → opens the context panel. */
  selectEntry: (id: string, crumb?: BreadcrumbItem) => void;
  /** Dismiss the context panel (Esc / click-away / close button). */
  closePanel: () => void;
  /** Dispatch a structured search action with the query (the UI-3.1 search contract). */
  dispatchSearch: (query: string) => void;
  /** Replace the breadcrumb trail (e.g. on route change). */
  setTrail: (trail: BreadcrumbItem[]) => void;
}

export const useShellStore = create<ShellState>((set) => ({
  panelOpen: false,
  selectedEntryId: null,
  trail: [],
  lastSearch: null,

  selectEntry: (id, crumb) =>
    set((state) => ({
      selectedEntryId: id,
      panelOpen: true,
      trail: crumb ? [...state.trail, crumb] : state.trail,
    })),
  closePanel: () => set({ panelOpen: false }),
  dispatchSearch: (query) => set({ lastSearch: query }),
  setTrail: (trail) => set({ trail }),
}));
