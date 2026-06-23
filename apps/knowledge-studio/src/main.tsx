import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/tokens.css";

/**
 * Boot the Knowledge Studio. When `VITE_USE_MOCKS=true` (standalone dev, no gateway), the
 * MSW worker is started first so the same shell renders over the seeded in-memory backend
 * (UI-D2 Tier 3); otherwise it points at the live `@dkm/api-gateway` endpoint.
 */
async function bootstrap(): Promise<void> {
  if (import.meta.env.VITE_USE_MOCKS === "true") {
    const { startMockWorker } = await import("./mocks/browser");
    await startMockWorker();
  }

  const rootElement = document.getElementById("root");
  if (!rootElement) throw new Error("missing #root element");

  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
