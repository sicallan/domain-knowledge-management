import { http, HttpResponse } from "msw";
import { setupWorker } from "msw/browser";

/**
 * The MSW **browser** worker (standalone dev, `VITE_USE_MOCKS=true`). Unlike the node/test
 * handler (`handlers.ts`), it must **not** import `@dkm/api-gateway` — that backend pulls
 * `node:fs`/`node:crypto` and cannot run in (or bundle for) the browser. Standalone dev
 * therefore serves a tiny static fixture; full seed parity in-browser (bundling the demo
 * JSONL, or running the gateway schema over a browser-safe store) is tracked as a follow-up.
 * The richer path is the **live `@dkm/api-gateway` dev server** (Feature 02), which needs no
 * worker. Requires the generated `public/mockServiceWorker.js` (`pnpm dlx msw init public/`).
 */

const STANDALONE_FIXTURE: Record<string, unknown> = {
  domainMap: {
    subdomains: [{ id: "sd-payments", name: "Payments", contexts: [] }],
    crossContextRelationships: [],
  },
};

export const browserHandlers = [
  http.post(/\/graphql$/, async ({ request }) => {
    const { query } = (await request.json()) as { query: string };
    const data: Record<string, unknown> = {};
    for (const key of Object.keys(STANDALONE_FIXTURE)) {
      if (query.includes(key)) data[key] = STANDALONE_FIXTURE[key];
    }
    return HttpResponse.json({ data });
  }),
];

export const worker = setupWorker(...browserHandlers);

export async function startMockWorker(): Promise<void> {
  await worker.start({ onUnhandledRequest: "bypass" });
}
