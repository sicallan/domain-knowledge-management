import { Outlet } from "react-router-dom";
import { useShellStore } from "../store";
import { Breadcrumb } from "./Breadcrumb";
import { ContextPanelSlot } from "./ContextPanelSlot";
import { NavMenu } from "./NavMenu";
import { NotificationCentre } from "./NotificationCentre";
import { SAMPLE_NOTIFICATIONS } from "./sample-data";
import { SearchBar } from "./SearchBar";
import { SelectedEntrySummary } from "./SelectedEntrySummary";

/**
 * The persistent application frame (UI-3.1) every screen mounts in: a nav rail, a header
 * with the always-present search bar + notification centre + user slot, the breadcrumb,
 * the routed content outlet, and the slide-out context-panel slot. It is **presentation
 * only** (UI-D3) — it binds the store's search-dispatch and context-panel contracts and
 * renders the active route via `<Outlet>`.
 */
export function AppLayout() {
  const panelOpen = useShellStore((state) => state.panelOpen);
  const closePanel = useShellStore((state) => state.closePanel);
  const trail = useShellStore((state) => state.trail);
  const dispatchSearch = useShellStore((state) => state.dispatchSearch);
  const selectedEntry = useShellStore((state) => state.selectedEntry);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <a href="#main-content" className="sr-only focus:not-sr-only">
        Skip to main content
      </a>
      <aside className="w-64 shrink-0 border-r border-border p-4">
        <div className="mb-4 font-semibold">Knowledge Studio</div>
        <NavMenu />
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-border p-4">
          <SearchBar onSearch={dispatchSearch} />
          <div className="flex items-center gap-3">
            <NotificationCentre items={SAMPLE_NOTIFICATIONS} />
            {/* User menu slot — filled by the auth feature (UI-3.3). */}
            <div id="user-menu-slot" />
          </div>
        </header>

        <Breadcrumb trail={trail} />

        <main id="main-content" className="flex-1">
          <Outlet />
        </main>
      </div>

      <ContextPanelSlot open={panelOpen} onClose={closePanel}>
        {selectedEntry && <SelectedEntrySummary entry={selectedEntry} />}
      </ContextPanelSlot>
    </div>
  );
}
