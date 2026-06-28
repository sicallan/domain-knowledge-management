import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./shell/AppLayout";
import { ExplorerScreen } from "./screens/ExplorerScreen";
import { NotFound } from "./screens/NotFound";
import { OverviewScreen } from "./screens/OverviewScreen";
import { ViewPlaceholder } from "./screens/ViewPlaceholder";

/**
 * The application routing table (UI-D7). Adding a screen is one `<Route>` registration —
 * the shell (the `AppLayout` layout route) is the **closed** host (OCP). The explorer is
 * the home route; the view screens are placeholders until their steps land; `*` is the 404.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/explorer" replace />} />
        <Route path="overview" element={<OverviewScreen />} />
        <Route path="explorer" element={<ExplorerScreen />} />
        <Route path="views/domain-map" element={<ViewPlaceholder title="Domain Map" step="UI-3.4" />} />
        <Route path="views/coverage" element={<ViewPlaceholder title="Coverage Map" step="UI-3.5" />} />
        <Route path="views/gap" element={<ViewPlaceholder title="Gap Analysis" step="UI-3.5" />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
